/**
 * Data lifecycle across modules:
 *  - a v1.0.0 database (schema v1) upgrades to the current schema without losing data;
 *  - "Delete all my data" leaves every table empty (core, plan, cycle, kitchen, yoga, watch kv);
 *  - "Export as JSON" includes every module.
 */
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

import AsyncStorage from '@react-native-async-storage/async-storage';
import { dayExtras, saveCycleSettings } from '../src/cycle/store';
import { deleteEverything, exportEverything } from '../src/db/allData';
import { setDriver, type SqlDriver } from '../src/db/driver';
import { countAll, dayLogs, kv, periods, vitals, weightLogs } from '../src/db/repos';
import { db, SCHEMA_VERSION } from '../src/db/schema';
import { getHeartToday } from '../src/health';
import { todayKey } from '../src/health/dates';
import { appName } from '../src/health/sources';
import { sqlKitchen } from '../src/kitchen/pantry';
import { __setNotificationsModule } from '../src/notify/scheduler';
import { rememberWatch, WATCH_KV, WATCH_SOURCE } from '../src/watch/storage';
import { savePrefs, yogaHistory } from '../src/yoga/store';
import { memoryDriver } from '../test-utils/memoryDriver';

/** The exact v1 schema shipped in Bloom 1.0.0. */
const V1_0_0_SCHEMA = `
CREATE TABLE IF NOT EXISTS period_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  start_day TEXT NOT NULL,          -- YYYY-MM-DD (local)
  end_day TEXT,                     -- inclusive; NULL = ongoing / unknown
  flow TEXT,                        -- light | medium | heavy
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_period_start ON period_logs(start_day);

CREATE TABLE IF NOT EXISTS day_logs (
  day TEXT PRIMARY KEY,             -- YYYY-MM-DD
  flow TEXT,                        -- none | spotting | light | medium | heavy
  symptoms TEXT NOT NULL DEFAULT '[]',  -- JSON array of symptom ids
  moods TEXT NOT NULL DEFAULT '[]',     -- JSON array of mood ids
  note TEXT,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sleep_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  start_time TEXT NOT NULL,         -- ISO instant
  end_time TEXT NOT NULL,
  quality INTEGER,                  -- 1..5
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sleep_end ON sleep_logs(end_time);

CREATE TABLE IF NOT EXISTS vitals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kind TEXT NOT NULL,               -- hr | spo2
  value REAL NOT NULL,
  time TEXT NOT NULL,               -- ISO instant
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_vitals_kind_time ON vitals(kind, time);

CREATE TABLE IF NOT EXISTS step_days (
  day TEXT PRIMARY KEY,             -- YYYY-MM-DD
  sensor_steps INTEGER NOT NULL DEFAULT 0,  -- counted by the phone sensor while Bloom was open
  manual_steps INTEGER,             -- user override; when set it wins
  updated_at TEXT NOT NULL
);
`;

async function v1Database(): Promise<SqlDriver> {
  const d = memoryDriver();
  await d.exec(V1_0_0_SCHEMA);
  await d.exec('CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT)');
  await d.run("INSERT INTO meta (key, value) VALUES ('schema_version', '1')");
  await d.run("INSERT INTO period_logs (start_day, end_day, flow, created_at) VALUES ('2026-09-01', '2026-09-05', 'medium', 'x')");
  await d.run("INSERT INTO day_logs (day, flow, symptoms, moods, note, updated_at) VALUES ('2026-09-02', 'heavy', '[\"cramps\"]', '[]', 'hi', 'x')");
  await d.run("INSERT INTO vitals (kind, value, time, created_at) VALUES ('hr', 64, '2026-09-02T08:00:00.000Z', 'x')");
  await d.run("INSERT INTO sleep_logs (start_time, end_time, quality, created_at) VALUES ('2026-09-01T17:00:00.000Z', '2026-09-02T01:00:00.000Z', 4, 'x')");
  await d.run("INSERT INTO step_days (day, sensor_steps, manual_steps, updated_at) VALUES ('2026-09-02', 4200, NULL, 'x')");
  return d;
}

const liveCtx = { mode: 'live' as const, granted: new Set<never>(), availability: 'unsupported' as const };

beforeEach(async () => {
  setDriver(memoryDriver());
  await AsyncStorage.clear();
  __setNotificationsModule(null); // no native module in jest → reminders are a no-op
});
afterAll(() => {
  setDriver(null);
  __setNotificationsModule(undefined);
});

describe('upgrade from Bloom 1.0.0 (schema v1)', () => {
  it('keeps every v1 row and adds the vitals.source column', async () => {
    const d = await v1Database();
    setDriver(d);
    await db();
    const v = await d.first<{ value: string }>("SELECT value FROM meta WHERE key = 'schema_version'");
    expect(Number(v?.value)).toBe(SCHEMA_VERSION);
    expect(SCHEMA_VERSION).toBe(3);
    expect(await periods.list()).toEqual([{ id: 1, startDay: '2026-09-01', endDay: '2026-09-05', flow: 'medium' }]);
    expect((await dayLogs.get('2026-09-02'))?.symptoms).toEqual(['cramps']);
    const old = await vitals.latest('hr');
    expect(old).toMatchObject({ value: 64, source: null });
    const cols = await d.all<{ name: string }>('PRAGMA table_info(vitals)');
    expect(cols.map((c) => c.name)).toContain('source');
    expect(await countAll()).toBe(5);
  });

  it('is re-runnable (v3 column already present, version reset to 2)', async () => {
    const d = await v1Database();
    setDriver(d);
    await db();
    await d.run("UPDATE meta SET value = '2' WHERE key = 'schema_version'");
    setDriver(memoryDriver());
    await db();
    setDriver(d); // a new driver instance → db() migrates again
    await expect(db()).resolves.toBe(d);
    expect(await vitals.latest('hr')).toMatchObject({ value: 64 });
  });

  it('lazily created module tables wait for migrations (no race on first launch)', async () => {
    const d = await v1Database();
    setDriver(d);
    // Fire module stores before anything else touched the DB.
    await Promise.all([
      yogaHistory.list(),
      sqlKitchen.pantry.list(),
      dayExtras.list(),
      vitals.add({ kind: 'hr', value: 70, time: new Date(), source: WATCH_SOURCE }),
    ]);
    const v = await d.first<{ value: string }>("SELECT value FROM meta WHERE key = 'schema_version'");
    expect(Number(v?.value)).toBe(SCHEMA_VERSION);
    expect(await periods.list()).toHaveLength(1);
  });
});

describe('watch readings source', () => {
  it('labels direct-watch readings "Watch (direct)"', async () => {
    expect(appName(WATCH_SOURCE)).toBe('Watch (direct)');
    const t = new Date(Date.now() - 60_000);
    await vitals.add({ kind: 'hr', value: 72, time: t, source: WATCH_SOURCE });
    await vitals.add({ kind: 'hr', value: 70, time: t });
    const r = await getHeartToday(liveCtx);
    expect(r.sources).toEqual(expect.arrayContaining([WATCH_SOURCE, 'bloom:log']));
  });
});

describe('delete all / export', () => {
  async function fillEverything() {
    const today = todayKey();
    await periods.add({ startDay: '2026-09-01', endDay: '2026-09-05', flow: 'light' });
    await dayLogs.upsert({ day: '2026-09-02', flow: 'light', symptoms: ['cramps'], moods: [], note: null });
    await vitals.add({ kind: 'hr', value: 72, time: new Date(Date.now() - 60_000), source: WATCH_SOURCE });
    await weightLogs.add({ day: today, slot: 'morning', kg: 60 });
    await kv.set('plan.profile', { any: 1 });
    await saveCycleSettings({ setupDone: true, goal: 'track' });
    await dayExtras.upsert({ day: '2026-09-02', discharge: 'creamy', sexDrive: null, energy: 'low', sleepQuality: null, cravings: [], pain: 2, meds: ['ibuprofen'] });
    await sqlKitchen.pantry.add({ name: 'Spinach' });
    await sqlKitchen.shopping.add('Milk');
    await yogaHistory.add({ day: today, sessionId: 's', title: 'Morning', level: 'beginner', minutes: 10, poses: 5, fraction: 1, programId: null, programDay: null });
    await savePrefs({ weeklyGoal: 4 });
    await rememberWatch({ id: 'AA:BB', name: 'Band' });
  }

  async function allTables(): Promise<string[]> {
    const d = await db();
    const rows = await d.all<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT IN ('meta', 'sqlite_sequence')"
    );
    return rows.map((r) => r.name);
  }

  it('export includes every module', async () => {
    await fillEverything();
    const x = await exportEverything();
    expect(x.periods).toHaveLength(1);
    expect(x.vitals[0].source).toBe(WATCH_SOURCE);
    expect(x.cycle.dayExtras).toHaveLength(1);
    expect(x.kitchen.pantry).toHaveLength(1);
    expect(x.kitchen.shopping).toHaveLength(1);
    expect(x.yoga.history).toHaveLength(1);
    expect(x.watch.device?.id).toBe('AA:BB');
    expect(x.plan?.weights).toHaveLength(1);
  });

  it('leaves every table empty', async () => {
    await fillEverything();
    const tables = await allTables();
    for (const t of ['period_logs', 'kv', 'cycle_kv', 'cycle_day_extras', 'kitchen_pantry', 'kitchen_shopping', 'kitchen_recipes', 'yoga_history'])
      expect(tables).toContain(t);
    await deleteEverything();
    const d = await db();
    for (const t of await allTables()) {
      const r = await d.first<{ n: number }>(`SELECT COUNT(*) AS n FROM ${t}`);
      expect([t, r?.n]).toEqual([t, 0]);
    }
    expect(await kv.get(WATCH_KV.device)).toBeNull();
    expect(await AsyncStorage.getItem('bloom.yoga.v1')).toBeNull();
  });
});
