/**
 * Plan persistence: idempotent migrations (v1 → v2), repositories, the addActivity contract,
 * weekly reviews, demo/standalone loaders and the AI food parser.
 */
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);
jest.mock(
  '../src/content/foods',
  () => {
    const mk = (id: string, name: string, diet: string, kcal: number, protein: number) => ({
      id,
      name,
      aliases: [],
      category: 'test',
      diet,
      serving: { label: '1 serving', grams: 100 },
      per: { kcal, protein, carbs: 20, fat: 5, fiber: 2 },
    });
    const FOODS = [mk('roti', 'Roti', 'vegan', 120, 3.5), mk('paneer', 'Paneer bhurji', 'veg', 250, 16), mk('dahi', 'Dahi', 'veg', 100, 6)];
    return { FOODS, searchFoods: (q: string) => FOODS.filter((f) => f.name.toLowerCase().includes(q.toLowerCase())) };
  },
  { virtual: true }
);

import { setDriver } from '../src/db/driver';
import {
  activityLogs,
  countAll,
  deleteAllData,
  exportAll,
  foodEntries,
  periods,
  planAdjustments,
  ValidationError,
  water,
  weightLogs,
} from '../src/db/repos';
import { migrate, SCHEMA_VERSION } from '../src/db/schema';
import { addDays } from '../src/health/dates';
import { addActivity } from '../src/plan/activity';
import { logFood, logWeight } from '../src/plan/actions';
import { parseFoodJson, withJsonMode, FOOD_SCHEMA } from '../src/plan/aiFood';
import { loadPlanState, loadPlanSummary, runWeeklyReviews } from '../src/plan/data';
import { subscribePlan } from '../src/plan/events';
import type { Profile } from '../src/plan/profile';
import { loadProfile, saveProfile } from '../src/plan/store';
import { memoryDriver } from '../test-utils/memoryDriver';

beforeEach(() => setDriver(memoryDriver()));
afterAll(() => setDriver(null));

const liveCtx = { mode: 'live' as const, granted: new Set<never>(), availability: 'unsupported' as const };

describe('migrations', () => {
  it('are re-runnable and upgrade v1 data in place', async () => {
    const d = memoryDriver();
    await migrate(d);
    await migrate(d); // twice — no error
    await d.run("INSERT INTO meta (key, value) VALUES ('schema_version', '1') ON CONFLICT(key) DO UPDATE SET value = '1'");
    await d.run("INSERT INTO period_logs (start_day, created_at) VALUES ('2026-01-01', 'x')");
    await migrate(d); // v1 → v2 again; tables use IF NOT EXISTS
    const v = await d.first<{ value: string }>("SELECT value FROM meta WHERE key = 'schema_version'");
    expect(Number(v?.value)).toBe(SCHEMA_VERSION);
    expect(SCHEMA_VERSION).toBe(2);
    const n = await d.first<{ n: number }>('SELECT COUNT(*) AS n FROM period_logs');
    expect(n?.n).toBe(1);
    for (const t of ['weight_logs', 'food_entries', 'custom_foods', 'food_favourites', 'water_days', 'activity_logs', 'plan_adjustments', 'kv'])
      expect(await d.first(`SELECT name FROM sqlite_master WHERE type='table' AND name='${t}'`)).toBeTruthy();
  });
});

describe('plan repositories', () => {
  it('validates weight 25–300 kg and rounds to 0.1', async () => {
    await expect(weightLogs.add({ day: '2026-10-24', slot: 'morning', kg: 20 })).rejects.toBeInstanceOf(ValidationError);
    await expect(weightLogs.add({ day: '2026-10-24', slot: 'morning', kg: 301 })).rejects.toBeInstanceOf(ValidationError);
    await weightLogs.add({ day: '2026-10-24', slot: 'night', kg: 70.46 });
    await weightLogs.add({ day: '2026-10-24', slot: 'morning', kg: 69.4 });
    expect((await weightLogs.latest('morning'))?.kg).toBe(69.4);
    expect((await weightLogs.list()).map((w) => w.kg)).toContain(70.5);
  });

  it('food entries, recent and water', async () => {
    await logFood({ day: '2026-10-24', meal: 'lunch', foodKey: 'db:roti', name: 'Roti', servings: 2, kcal: 240, protein: 7, carbs: 40, fat: 4, fiber: 4, source: 'db' });
    await logFood({ day: '2026-10-24', meal: 'dinner', foodKey: 'db:roti', name: 'Roti', servings: 1, kcal: 120, protein: 3.5, carbs: 20, fat: 2, fiber: 2, source: 'db' });
    await expect(foodEntries.add({ day: '2026-10-24', meal: 'lunch', name: ' ', servings: 1, kcal: 10, protein: 0, carbs: 0, fat: 0, fiber: 0, source: 'db' })).rejects.toBeInstanceOf(ValidationError);
    expect(await foodEntries.list('2026-10-24')).toHaveLength(2);
    expect(await foodEntries.recent()).toHaveLength(1); // de-duplicated by food key
    await water.set('2026-10-24', 750);
    expect(await water.get('2026-10-24')).toBe(750);
  });

  it('exports and wipes plan data too', async () => {
    await periods.add({ startDay: '2026-01-01' });
    await logWeight({ day: '2026-10-24', slot: 'morning', kg: 70 });
    const e = await exportAll();
    expect(e.plan?.weights).toHaveLength(1);
    await deleteAllData();
    expect(await countAll()).toBe(0);
  });
});

describe('addActivity contract', () => {
  it('stores the session with kcal from the latest morning weight and notifies listeners', async () => {
    const seen = jest.fn();
    const off = subscribePlan(seen);
    await weightLogs.add({ day: '2026-10-23', slot: 'morning', kg: 80 });
    await weightLogs.add({ day: '2026-10-24', slot: 'night', kg: 81 });
    await addActivity({ type: 'yoga', minutes: 30, intensity: 'moderate', dateKey: '2026-10-24', source: 'bloom-yoga', title: 'Flow' });
    const [a] = await activityLogs.list('2026-10-24');
    expect(a).toMatchObject({ type: 'yoga', minutes: 30, source: 'bloom-yoga', title: 'Flow', kcal: Math.round(3.0 * 80 * 0.5) });
    expect(seen).toHaveBeenCalled();
    off();
  });
  it('falls back to the profile weight, then 60 kg', async () => {
    await addActivity({ type: 'walk', minutes: 60, intensity: 'moderate', dateKey: '2026-10-24' });
    expect((await activityLogs.list('2026-10-24'))[0].kcal).toBe(Math.round(3.5 * 60));
    await expect(addActivity({ type: 'walk', minutes: 0, intensity: 'light' })).rejects.toBeInstanceOf(ValidationError);
  });
});

const profile = (start: string): Profile => ({
  formula: 'female',
  birthYear: 1996,
  heightCm: 165,
  weightKg: 72,
  targetKg: 64,
  activity: 'light',
  diet: 'veg',
  pace: 'steady',
  startDay: start,
  yogaPerWeek: 4,
});

describe('weekly reviews', () => {
  it('stores one decision per completed week and adapts after two slow weeks', async () => {
    const start = '2026-09-01';
    const today = '2026-09-23'; // weeks 1–3 complete
    const pts = [];
    for (let i = 0; i < 21; i++) pts.push({ day: addDays(start, i), slot: 'morning' as const, kg: 72 - (i < 7 ? 0.1 : 0.15) });
    const list = await runWeeklyReviews(profile(start), pts, today);
    expect(list.map((a) => a.weekNo)).toEqual([1, 2, 3]);
    expect(list[0].verdict).toBe('slow');
    expect(list[1]).toMatchObject({ verdict: 'slow', deltaKcal: -100 });
    // Re-running is a no-op.
    expect(await runWeeklyReviews(profile(start), pts, today)).toHaveLength(3);
    expect(await planAdjustments.list()).toHaveLength(3);
  });
  it('skips weeks without 4 morning weights', async () => {
    const start = '2026-09-01';
    const pts = [{ day: '2026-09-02', slot: 'morning' as const, kg: 71 }];
    expect(await runWeeklyReviews(profile(start), pts, '2026-09-20')).toHaveLength(0);
  });
});

describe('plan loaders', () => {
  it('standalone with nothing logged', async () => {
    const s = await loadPlanState({ ...liveCtx, now: new Date(2026, 9, 24, 13) }, { cycleTracked: true });
    expect(s.profile).toBeNull();
    expect(s.plan).toBeNull();
    expect(s.totals.kcal).toBe(0);
    expect(s.cycleNote).toBeNull();
    expect(await loadPlanSummary({ ...liveCtx, now: new Date(2026, 9, 24, 13) }, { cycleTracked: true })).toBeNull();
  });

  it('live with a profile: allowance includes half of exercise, yoga counted', async () => {
    const now = new Date(2026, 9, 24, 13);
    await saveProfile(profile('2026-10-20'));
    expect((await loadProfile())?.targetKg).toBe(64);
    await addActivity({ type: 'yoga', minutes: 20, intensity: 'light', dateKey: '2026-10-24', source: 'bloom-yoga' });
    await logFood({ day: '2026-10-24', meal: 'lunch', foodKey: null, name: 'Thali', servings: 1, kcal: 600, protein: 20, carbs: 80, fat: 20, fiber: 6, source: 'ai' });
    const s = await loadPlanState({ ...liveCtx, now }, { cycleTracked: false });
    expect(s.plan?.targets).toBeTruthy();
    expect(s.allowance!.kcal).toBe(s.plan!.targets!.kcal + Math.round(s.exerciseKcal * 0.5));
    expect(s.yogaThisWeek).toBe(1);
    expect(s.ideas.length).toBeGreaterThan(0);
    const sum = await loadPlanSummary({ ...liveCtx, now }, { cycleTracked: false });
    expect(sum).toMatchObject({ daysWithFood7: 1, avgKcal7: 600, yogaSessions7: 1, topFoods: ['Thali'] });
  });

  it('demo mode returns realistic sample data', async () => {
    const s = await loadPlanState({ mode: 'demo', granted: new Set(), now: new Date(2026, 9, 24, 19) }, { cycleTracked: true });
    expect(s.demo).toBe(true);
    expect(s.weights.length).toBeGreaterThan(20);
    expect(s.trendKg).not.toBeNull();
    expect(s.food.length).toBeGreaterThan(3);
    expect(s.adjustments.length).toBeGreaterThan(0);
    expect(s.hcSessions).toHaveLength(1);
    expect(s.progress!.percent).toBeGreaterThan(0);
  });
});

describe('AI food parsing', () => {
  it('parses items and drops invalid ones', () => {
    const items = parseFoodJson(
      '```json\n{"items":[{"name":"Roti","quantity":2,"unit":"piece","kcal":240,"protein":7,"carbs":44,"fat":4},{"name":"","kcal":1},{"name":"Dal","quantity":"1","unit":"katori","kcal":"180","protein":9,"carbs":22,"fat":-3}]}\n```'
    );
    expect(items).toEqual([
      { name: 'Roti', quantity: 2, unit: 'piece', kcal: 240, protein: 7, carbs: 44, fat: 4 },
      { name: 'Dal', quantity: 1, unit: 'katori', kcal: 180, protein: 9, carbs: 22, fat: 0 },
    ]);
    expect(parseFoodJson('not json')).toEqual([]);
  });
  it('injects responseMimeType + responseSchema into the request', async () => {
    const base = jest.fn(async (_url: string, init: { body: string }) => ({ ok: true, status: 200, text: async () => init.body }));
    const f = withJsonMode(base, FOOD_SCHEMA);
    await f('u', { method: 'POST', headers: {}, body: JSON.stringify({ generationConfig: { maxOutputTokens: 5 } }) });
    const sent = JSON.parse(base.mock.calls[0][1].body);
    expect(sent.generationConfig).toMatchObject({ maxOutputTokens: 5, responseMimeType: 'application/json' });
    expect(sent.generationConfig.responseSchema.type).toBe('OBJECT');
  });
});
