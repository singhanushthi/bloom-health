import { setDriver } from '../src/db/driver';
import {
  countAll,
  dayLogs,
  deleteAllData,
  exportAll,
  periods,
  sleepLogs,
  stepDays,
  ValidationError,
  vitals,
  bleedingDaysFromDayLogs,
} from '../src/db/repos';
import { memoryDriver } from '../test-utils/memoryDriver';

beforeEach(() => setDriver(memoryDriver()));
afterAll(() => setDriver(null));

describe('periods', () => {
  it('adds, lists, updates and removes', async () => {
    const id = await periods.add({ startDay: '2026-01-01', endDay: '2026-01-05', flow: 'medium' });
    await periods.add({ startDay: '2025-12-01' });
    let list = await periods.list();
    expect(list.map((p) => p.startDay)).toEqual(['2025-12-01', '2026-01-01']);
    expect(list[1]).toMatchObject({ endDay: '2026-01-05', flow: 'medium' });
    await periods.update(id, { startDay: '2026-01-02', endDay: '2026-01-06', flow: 'heavy' });
    await periods.remove(list[0].id);
    list = await periods.list();
    expect(list).toEqual([{ id, startDay: '2026-01-02', endDay: '2026-01-06', flow: 'heavy' }]);
  });

  it('rejects an end date before the start', async () => {
    await expect(periods.add({ startDay: '2026-01-05', endDay: '2026-01-01' })).rejects.toBeInstanceOf(ValidationError);
  });
});

describe('day logs', () => {
  it('upserts by day and round-trips chips', async () => {
    await dayLogs.upsert({ day: '2026-02-01', flow: 'light', symptoms: ['cramps'], moods: [], note: null });
    await dayLogs.upsert({ day: '2026-02-01', flow: 'heavy', symptoms: ['cramps', 'fatigue'], moods: ['calm'], note: ' tired ' });
    const log = await dayLogs.get('2026-02-01');
    expect(log).toEqual({ day: '2026-02-01', flow: 'heavy', symptoms: ['cramps', 'fatigue'], moods: ['calm'], note: 'tired' });
    expect(bleedingDaysFromDayLogs(await dayLogs.list())).toEqual(['2026-02-01']);
  });

  it('deletes a day log that is saved empty', async () => {
    await dayLogs.upsert({ day: '2026-02-02', flow: 'light', symptoms: [], moods: [], note: null });
    await dayLogs.upsert({ day: '2026-02-02', flow: 'none', symptoms: [], moods: [], note: '' });
    expect(await dayLogs.get('2026-02-02')).toBeNull();
  });
});

describe('sleep', () => {
  it('validates times and quality', async () => {
    const bed = new Date('2026-01-01T23:00:00Z');
    await expect(sleepLogs.add({ start: bed, end: new Date('2026-01-01T22:00:00Z'), quality: 3 })).rejects.toThrow(/after bedtime/);
    await expect(sleepLogs.add({ start: bed, end: new Date('2026-01-03T23:00:00Z'), quality: 3 })).rejects.toThrow(/more than/);
    await expect(sleepLogs.add({ start: bed, end: new Date('2026-01-02T07:00:00Z'), quality: 6 })).rejects.toThrow(/1 to 5/);
    await sleepLogs.add({ start: bed, end: new Date('2026-01-02T07:00:00Z'), quality: 4 });
    const list = await sleepLogs.listBetween(new Date('2026-01-01T00:00:00Z'), new Date('2026-01-03T00:00:00Z'));
    expect(list).toHaveLength(1);
    expect(list[0].quality).toBe(4);
  });
});

describe('vitals', () => {
  it('enforces plausible ranges with field-level errors', async () => {
    const t = new Date('2026-01-01T10:00:00Z');
    await expect(vitals.add({ kind: 'hr', value: 25, time: t })).rejects.toMatchObject({ field: 'value' });
    await expect(vitals.add({ kind: 'hr', value: 221, time: t })).rejects.toThrow(/30 and 220/);
    await expect(vitals.add({ kind: 'spo2', value: 69, time: t })).rejects.toThrow(/70 and 100/);
    await vitals.add({ kind: 'hr', value: 30, time: t });
    await vitals.add({ kind: 'spo2', value: 100, time: t });
    await vitals.add({ kind: 'hr', value: 72, time: new Date('2026-01-01T11:00:00Z') });
    expect((await vitals.latest('hr'))?.value).toBe(72);
  });
});

describe('steps', () => {
  it('accumulates sensor deltas per day and lets a manual value win', async () => {
    await stepDays.addSensorSteps('2026-01-01', 120);
    await stepDays.addSensorSteps('2026-01-01', 30);
    await stepDays.addSensorSteps('2026-01-01', 0);
    expect((await stepDays.get('2026-01-01'))?.steps).toBe(150);
    await stepDays.setManual('2026-01-01', 9000);
    expect(await stepDays.get('2026-01-01')).toMatchObject({ steps: 9000, sensorSteps: 150 });
    await stepDays.setManual('2026-01-01', null);
    expect((await stepDays.get('2026-01-01'))?.steps).toBe(150);
    await expect(stepDays.setManual('2026-01-01', -5)).rejects.toBeInstanceOf(ValidationError);
  });
});

describe('export and delete', () => {
  it('exports everything then wipes it', async () => {
    await periods.add({ startDay: '2026-01-01' });
    await vitals.add({ kind: 'hr', value: 60, time: new Date('2026-01-01T10:00:00Z') });
    await stepDays.addSensorSteps('2026-01-01', 10);
    const e = await exportAll();
    expect(e).toMatchObject({ app: 'Bloom', version: 1 });
    expect(e.periods).toHaveLength(1);
    expect(e.vitals).toHaveLength(1);
    expect(e.steps).toHaveLength(1);
    expect(await countAll()).toBe(3);
    await deleteAllData();
    expect(await countAll()).toBe(0);
  });
});
