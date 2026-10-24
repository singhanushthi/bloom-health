/**
 * Standalone paths (no Health Connect): step accumulation per local day, re-subscribe safety,
 * cross-midnight sleep entry, and idempotent migrations.
 */
process.env.TZ = 'Asia/Kolkata';

import { setDriver } from '../src/db/driver';
import { stepDays } from '../src/db/repos';
import { migrate, SCHEMA_VERSION } from '../src/db/schema';
import { toDayKey } from '../src/health/dates';
import { createStepAccumulator } from '../src/sensors/stepCounter';
import { sleepRange } from '../src/components/sheets/DateTimeField';
import { validateSleep } from '../src/db/repos';
import { memoryDriver } from '../test-utils/memoryDriver';

describe('local day keys in Asia/Kolkata', () => {
  it('uses the IST calendar day, not UTC', () => {
    // 2026-10-23T19:00Z = 2026-10-24 00:30 IST
    expect(toDayKey(new Date('2026-10-23T19:00:00Z'))).toBe('2026-10-24');
    expect(toDayKey(new Date('2026-10-23T18:29:00Z'))).toBe('2026-10-23');
  });
});

describe('step accumulator', () => {
  it('splits steps across local midnight', () => {
    let day = '2026-10-23';
    const acc = createStepAccumulator(() => day);
    acc.onReading(10);
    acc.onReading(25);
    day = '2026-10-24';
    acc.onReading(30);
    expect(acc.take()).toEqual([
      ['2026-10-23', 25],
      ['2026-10-24', 5],
    ]);
    expect(acc.hasPending()).toBe(false);
  });

  it('does not double count or lose steps across re-subscribe (app resume)', () => {
    const acc = createStepAccumulator(() => '2026-10-23');
    acc.onReading(100);
    acc.take();
    // New subscription: expo-sensors restarts its count at ~1.
    acc.resetBaseline();
    acc.onReading(1);
    acc.onReading(40);
    expect(acc.take()).toEqual([['2026-10-23', 40]]);
  });

  it('keeps a failed write on its own day', () => {
    let day = '2026-10-23';
    const acc = createStepAccumulator(() => day);
    acc.onReading(50);
    const [[d, n]] = acc.take();
    day = '2026-10-24';
    acc.restore(d, n);
    acc.onReading(60);
    expect(acc.take()).toEqual([
      ['2026-10-23', 50],
      ['2026-10-24', 10],
    ]);
  });

  it('persists sensor steps additively and manual steps override', async () => {
    setDriver(memoryDriver());
    await stepDays.addSensorSteps('2026-10-23', 120);
    await stepDays.addSensorSteps('2026-10-23', 30);
    expect((await stepDays.get('2026-10-23'))?.steps).toBe(150);
    await stepDays.setManual('2026-10-23', 9000);
    await stepDays.addSensorSteps('2026-10-23', 10);
    expect(await stepDays.get('2026-10-23')).toMatchObject({ steps: 9000, sensorSteps: 160, manualSteps: 9000 });
    await stepDays.setManual('2026-10-23', null);
    expect((await stepDays.get('2026-10-23'))?.steps).toBe(160);
    setDriver(null);
  });
});

describe('sleep entry crossing midnight', () => {
  const at = (iso: string) => new Date(iso);
  it('treats a same-date 23:30 → 07:00 entry as starting the evening before', () => {
    const day = at('2026-10-24T12:00:00+05:30');
    const r = sleepRange(day, at('2026-10-24T23:30:00+05:30'), day, at('2026-10-24T07:00:00+05:30'));
    expect(r.start.toISOString()).toBe(at('2026-10-23T23:30:00+05:30').toISOString());
    expect(r.end.toISOString()).toBe(at('2026-10-24T07:00:00+05:30').toISOString());
    expect(() => validateSleep(r.start, r.end, null)).not.toThrow();
  });

  it('keeps explicitly chosen dates and still rejects wake before bedtime', () => {
    const r = sleepRange(
      at('2026-10-23T12:00:00+05:30'),
      at('2026-10-23T23:00:00+05:30'),
      at('2026-10-22T12:00:00+05:30'),
      at('2026-10-22T07:00:00+05:30')
    );
    expect(() => validateSleep(r.start, r.end, null)).toThrow(/after bedtime/);
  });
});

describe('migrations', () => {
  it('can run repeatedly (app upgrade / restart) without losing data', async () => {
    const d = memoryDriver();
    await migrate(d);
    await d.run("INSERT INTO step_days (day, sensor_steps, updated_at) VALUES ('2026-10-23', 5, 'x')");
    await migrate(d);
    await migrate(d);
    expect(await d.first<{ value: string }>("SELECT value FROM meta WHERE key = 'schema_version'")).toEqual({
      value: String(SCHEMA_VERSION),
    });
    expect(await d.first<{ n: number }>('SELECT COUNT(*) AS n FROM step_days')).toEqual({ n: 1 });
  });
});
