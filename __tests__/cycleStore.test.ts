import { setDriver } from '../src/db/driver';
import { dayLogs, periods } from '../src/db/repos';
import { memoryDriver } from '../test-utils/memoryDriver';
import {
  completeSetup,
  dayExtras,
  DEFAULT_CYCLE_SETTINGS,
  deleteCycleData,
  emptyExtras,
  endPeriodToday,
  loadCycleSettings,
  normalizeSettings,
  saveCycleSettings,
  startPeriodToday,
  validateSetup,
} from '../src/cycle/store';
import { getCycleStatus } from '../src/health/cycle';

beforeEach(() => setDriver(memoryDriver()));

describe('cycle settings', () => {
  it('defaults: discreet on, fertile/log/pill reminders off', async () => {
    const s = await loadCycleSettings();
    expect(s).toEqual(DEFAULT_CYCLE_SETTINGS);
    expect(s.discreet).toBe(true);
    expect(s.reminders).toMatchObject({ fertile: false, logDay: false, pill: false });
  });

  it('saves patches (incl. nested reminders) and clamps bad values', async () => {
    await saveCycleSettings({ goal: 'conceive', reminders: { pill: true, pillTime: '07:30' } });
    const s = await loadCycleSettings();
    expect(s.goal).toBe('conceive');
    expect(s.reminders.pill).toBe(true);
    expect(s.reminders.pillTime).toBe('07:30');
    expect(s.reminders.periodSoon).toBe(true);
    const n = normalizeSettings({ typicalCycleLength: 99, typicalPeriodLength: 0, goal: 'x', reminders: { logTime: '25:00' } });
    expect(n.typicalCycleLength).toBe(45);
    expect(n.typicalPeriodLength).toBe(2);
    expect(n.goal).toBe('track');
    expect(n.reminders.logTime).toBe('21:00');
  });
});

describe('setup', () => {
  it('validates inline', () => {
    const e = validateSetup({ lastPeriodStart: '2026-12-01', periodLength: 1, cycleLength: 60, irregular: false, goal: 'track' }, '2026-10-24');
    expect(e.lastPeriodStart).toMatch(/future/);
    expect(e.periodLength).toBeTruthy();
    expect(e.cycleLength).toBeTruthy();
  });

  it('logs the last period and drives predictions from typical lengths', async () => {
    await completeSetup({ lastPeriodStart: '2026-10-10', periodLength: 4, cycleLength: 31, irregular: false, goal: 'avoid' }, '2026-10-24');
    expect(await periods.list()).toMatchObject([{ startDay: '2026-10-10', endDay: '2026-10-13' }]);
    const s = await loadCycleSettings();
    expect(s).toMatchObject({ setupDone: true, typicalCycleLength: 31, typicalPeriodLength: 4, goal: 'avoid' });
    const r = await getCycleStatus({ mode: 'live', granted: new Set(), now: new Date('2026-10-24T10:00:00') });
    expect(r.status).toBe('ok');
    expect(r.data!.nextPeriodStart).toBe('2026-11-10');
    expect(r.data!.predictions!.upcoming).toHaveLength(3);
    expect(r.data!.settings!.goal).toBe('avoid');
  });
});

describe('one-tap period start / end', () => {
  it('starts today (once) and ends the open period', async () => {
    expect(await startPeriodToday('2026-10-20')).not.toBeNull();
    expect(await startPeriodToday('2026-10-20')).toBeNull();
    expect(await endPeriodToday('2026-10-24')).toBe(true);
    expect(await periods.list()).toMatchObject([{ startDay: '2026-10-20', endDay: '2026-10-24' }]);
    expect(await endPeriodToday('2026-10-25')).toBe(false);
  });

  it('closes an older open period when a new one starts', async () => {
    await periods.add({ startDay: '2026-09-01' });
    await startPeriodToday('2026-09-29');
    const list = await periods.list();
    expect(list[0]).toMatchObject({ startDay: '2026-09-01', endDay: '2026-09-05' });
    expect(list[1]).toMatchObject({ startDay: '2026-09-29', endDay: null });
  });
});

describe('day extras', () => {
  it('upserts, cleans med tags, deletes when empty, and marks the calendar', async () => {
    await dayExtras.upsert({ ...emptyExtras('2026-10-01'), pain: 2, discharge: 'egg_white', meds: [' Meftal ', 'meftal', 'Iron tablet'], cravings: ['sweet'] });
    expect(await dayExtras.get('2026-10-01')).toMatchObject({ pain: 2, discharge: 'egg_white', meds: ['Meftal', 'Iron tablet'], cravings: ['sweet'] });
    expect(await dayExtras.recentMeds()).toEqual(['Meftal', 'Iron tablet']);
    await expect(dayExtras.upsert({ ...emptyExtras('2026-10-02'), pain: 5 })).rejects.toThrow(/0 to 3/);
    await periods.add({ startDay: '2026-09-28', endDay: '2026-10-02' });
    await dayLogs.upsert({ day: '2026-09-30', flow: 'heavy', symptoms: ['cramps'], moods: [], note: null });
    const r = await getCycleStatus({ mode: 'live', granted: new Set(), now: new Date('2026-10-05T10:00:00') });
    expect(r.data!.loggedDays).toEqual(['2026-09-30', '2026-10-01']);
    await dayExtras.upsert(emptyExtras('2026-10-01'));
    expect(await dayExtras.get('2026-10-01')).toBeNull();
  });

  it('deleteCycleData wipes settings and extras', async () => {
    await saveCycleSettings({ goal: 'conceive' });
    await dayExtras.upsert({ ...emptyExtras('2026-10-01'), energy: 'low' });
    await deleteCycleData();
    expect((await loadCycleSettings()).goal).toBe('track');
    expect(await dayExtras.list()).toEqual([]);
  });
});
