/**
 * Repositories for Bloom's own on-device data. Pure TypeScript over SqlDriver.
 */
import type { DayKey } from '../health/dates';
import { ALL_TABLES, db } from './schema';

const nowIso = () => new Date().toISOString();

/* ------------------------------ Validation ------------------------------ */

export const HR_RANGE = { min: 30, max: 220 } as const;
export const SPO2_RANGE = { min: 70, max: 100 } as const;
export const SLEEP_MAX_HOURS = 18;

export class ValidationError extends Error {
  constructor(
    public field: string,
    message: string
  ) {
    super(message);
  }
}

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
function assertDay(field: string, d: string) {
  if (!DAY_RE.test(d)) throw new ValidationError(field, 'Use a valid date.');
}

/* -------------------------------- Periods ------------------------------- */

export type Flow = 'light' | 'medium' | 'heavy';
export const FLOWS: Flow[] = ['light', 'medium', 'heavy'];

export interface PeriodLog {
  id: number;
  startDay: DayKey;
  endDay: DayKey | null;
  flow: Flow | null;
}

interface PeriodRow {
  id: number;
  start_day: string;
  end_day: string | null;
  flow: string | null;
}

const toPeriod = (r: PeriodRow): PeriodLog => ({
  id: r.id,
  startDay: r.start_day,
  endDay: r.end_day,
  flow: (r.flow as Flow | null) ?? null,
});

export const periods = {
  async add(p: { startDay: DayKey; endDay?: DayKey | null; flow?: Flow | null }): Promise<number> {
    assertDay('startDay', p.startDay);
    if (p.endDay) {
      assertDay('endDay', p.endDay);
      if (p.endDay < p.startDay) throw new ValidationError('endDay', 'End date can’t be before the start date.');
    }
    const d = await db();
    const r = await d.run(
      'INSERT INTO period_logs (start_day, end_day, flow, created_at) VALUES (?, ?, ?, ?)',
      [p.startDay, p.endDay ?? null, p.flow ?? null, nowIso()]
    );
    return r.lastInsertRowId;
  },
  async update(id: number, p: { startDay: DayKey; endDay?: DayKey | null; flow?: Flow | null }) {
    if (p.endDay && p.endDay < p.startDay) throw new ValidationError('endDay', 'End date can’t be before the start date.');
    const d = await db();
    await d.run('UPDATE period_logs SET start_day = ?, end_day = ?, flow = ? WHERE id = ?', [
      p.startDay,
      p.endDay ?? null,
      p.flow ?? null,
      id,
    ]);
  },
  async remove(id: number) {
    const d = await db();
    await d.run('DELETE FROM period_logs WHERE id = ?', [id]);
  },
  async list(): Promise<PeriodLog[]> {
    const d = await db();
    return (await d.all<PeriodRow>('SELECT * FROM period_logs ORDER BY start_day ASC')).map(toPeriod);
  },
};

/* ------------------------------- Day logs ------------------------------- */

/** 'spotting' is accepted for older rows but not offered in the UI. */
export type DayFlow = 'none' | 'spotting' | Flow;
export const DAY_FLOWS: DayFlow[] = ['none', 'light', 'medium', 'heavy'];

export const SYMPTOMS = [
  { id: 'cramps', label: 'Cramps' },
  { id: 'headache', label: 'Headache' },
  { id: 'bloating', label: 'Bloating' },
  { id: 'acne', label: 'Acne' },
  { id: 'tender_breasts', label: 'Tender breasts' },
  { id: 'fatigue', label: 'Fatigue' },
  { id: 'back_pain', label: 'Back pain' },
] as const;

export const MOODS = [
  { id: 'calm', label: 'Calm' },
  { id: 'happy', label: 'Happy' },
  { id: 'energetic', label: 'Energetic' },
  { id: 'irritable', label: 'Irritable' },
  { id: 'anxious', label: 'Anxious' },
  { id: 'low', label: 'Low' },
] as const;

export interface DayLog {
  day: DayKey;
  flow: DayFlow | null;
  symptoms: string[];
  moods: string[];
  note: string | null;
}

interface DayRow {
  day: string;
  flow: string | null;
  symptoms: string;
  moods: string;
  note: string | null;
}

const parseList = (s: string): string[] => {
  try {
    const v = JSON.parse(s);
    return Array.isArray(v) ? v.filter((x) => typeof x === 'string') : [];
  } catch {
    return [];
  }
};

const toDayLog = (r: DayRow): DayLog => ({
  day: r.day,
  flow: (r.flow as DayFlow | null) ?? null,
  symptoms: parseList(r.symptoms),
  moods: parseList(r.moods),
  note: r.note,
});

export const dayLogs = {
  async get(day: DayKey): Promise<DayLog | null> {
    const d = await db();
    const r = await d.first<DayRow>('SELECT * FROM day_logs WHERE day = ?', [day]);
    return r ? toDayLog(r) : null;
  },
  async upsert(log: DayLog): Promise<void> {
    assertDay('day', log.day);
    const d = await db();
    const isEmpty =
      (!log.flow || log.flow === 'none') && !log.symptoms.length && !log.moods.length && !log.note?.trim();
    if (isEmpty) {
      await d.run('DELETE FROM day_logs WHERE day = ?', [log.day]);
      return;
    }
    await d.run(
      `INSERT INTO day_logs (day, flow, symptoms, moods, note, updated_at) VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(day) DO UPDATE SET flow = excluded.flow, symptoms = excluded.symptoms,
         moods = excluded.moods, note = excluded.note, updated_at = excluded.updated_at`,
      [
        log.day,
        log.flow ?? null,
        JSON.stringify(log.symptoms),
        JSON.stringify(log.moods),
        log.note?.trim() || null,
        nowIso(),
      ]
    );
  },
  async list(from?: DayKey, to?: DayKey): Promise<DayLog[]> {
    const d = await db();
    const rows = await d.all<DayRow>(
      'SELECT * FROM day_logs WHERE day >= ? AND day <= ? ORDER BY day ASC',
      [from ?? '0000-00-00', to ?? '9999-99-99']
    );
    return rows.map(toDayLog);
  },
};

/** Days with bleeding according to day logs (light/medium/heavy; spotting excluded). */
export function bleedingDaysFromDayLogs(logs: DayLog[]): DayKey[] {
  return logs.filter((l) => l.flow === 'light' || l.flow === 'medium' || l.flow === 'heavy').map((l) => l.day);
}

/* --------------------------------- Sleep -------------------------------- */

export interface SleepLog {
  id: number;
  start: string;
  end: string;
  quality: number | null;
}

interface SleepRow {
  id: number;
  start_time: string;
  end_time: string;
  quality: number | null;
}

export function validateSleep(start: Date, end: Date, quality: number | null) {
  if (!(end.getTime() > start.getTime()))
    throw new ValidationError('end', 'Wake time must be after bedtime.');
  if (end.getTime() - start.getTime() > SLEEP_MAX_HOURS * 3_600_000)
    throw new ValidationError('end', `That’s more than ${SLEEP_MAX_HOURS} hours — check the times.`);
  if (end.getTime() > Date.now() + 60_000) throw new ValidationError('end', 'Wake time can’t be in the future.');
  if (quality !== null && (quality < 1 || quality > 5 || !Number.isInteger(quality)))
    throw new ValidationError('quality', 'Choose a quality from 1 to 5.');
}

export const sleepLogs = {
  async add(s: { start: Date; end: Date; quality: number | null }): Promise<number> {
    validateSleep(s.start, s.end, s.quality);
    const d = await db();
    const r = await d.run(
      'INSERT INTO sleep_logs (start_time, end_time, quality, created_at) VALUES (?, ?, ?, ?)',
      [s.start.toISOString(), s.end.toISOString(), s.quality, nowIso()]
    );
    return r.lastInsertRowId;
  },
  async remove(id: number) {
    const d = await db();
    await d.run('DELETE FROM sleep_logs WHERE id = ?', [id]);
  },
  async listBetween(from: Date, to: Date): Promise<SleepLog[]> {
    const d = await db();
    const rows = await d.all<SleepRow>(
      'SELECT * FROM sleep_logs WHERE end_time >= ? AND end_time <= ? ORDER BY end_time ASC',
      [from.toISOString(), to.toISOString()]
    );
    return rows.map((r) => ({ id: r.id, start: r.start_time, end: r.end_time, quality: r.quality }));
  },
};

/* -------------------------------- Vitals -------------------------------- */

export type VitalKind = 'hr' | 'spo2';

export interface Vital {
  id: number;
  kind: VitalKind;
  value: number;
  time: string;
}

export function validateVital(kind: VitalKind, value: number, time: Date) {
  const range = kind === 'hr' ? HR_RANGE : SPO2_RANGE;
  const unit = kind === 'hr' ? 'bpm' : '%';
  if (!Number.isFinite(value)) throw new ValidationError('value', 'Enter a number.');
  if (value < range.min || value > range.max)
    throw new ValidationError('value', `Enter a value between ${range.min} and ${range.max} ${unit}.`);
  if (time.getTime() > Date.now() + 60_000) throw new ValidationError('time', 'Time can’t be in the future.');
}

export const vitals = {
  async add(v: { kind: VitalKind; value: number; time: Date }): Promise<number> {
    validateVital(v.kind, v.value, v.time);
    const d = await db();
    const r = await d.run('INSERT INTO vitals (kind, value, time, created_at) VALUES (?, ?, ?, ?)', [
      v.kind,
      v.value,
      v.time.toISOString(),
      nowIso(),
    ]);
    return r.lastInsertRowId;
  },
  async remove(id: number) {
    const d = await db();
    await d.run('DELETE FROM vitals WHERE id = ?', [id]);
  },
  async listBetween(kind: VitalKind, from: Date, to: Date): Promise<Vital[]> {
    const d = await db();
    return d.all<Vital>(
      'SELECT id, kind, value, time FROM vitals WHERE kind = ? AND time >= ? AND time <= ? ORDER BY time ASC',
      [kind, from.toISOString(), to.toISOString()]
    );
  },
  async latest(kind: VitalKind): Promise<Vital | null> {
    const d = await db();
    return d.first<Vital>('SELECT id, kind, value, time FROM vitals WHERE kind = ? ORDER BY time DESC LIMIT 1', [kind]);
  },
};

/* --------------------------------- Steps -------------------------------- */

export interface StepDay {
  day: DayKey;
  sensorSteps: number;
  manualSteps: number | null;
  /** manual override when set, otherwise sensor count. */
  steps: number;
}

interface StepRow {
  day: string;
  sensor_steps: number;
  manual_steps: number | null;
}

const toStepDay = (r: StepRow): StepDay => ({
  day: r.day,
  sensorSteps: r.sensor_steps,
  manualSteps: r.manual_steps,
  steps: r.manual_steps ?? r.sensor_steps,
});

export const MAX_DAILY_STEPS = 100_000;

export const stepDays = {
  /** Add sensor steps counted while the app was open. */
  async addSensorSteps(day: DayKey, delta: number): Promise<void> {
    if (!(delta > 0)) return;
    const d = await db();
    await d.run(
      `INSERT INTO step_days (day, sensor_steps, updated_at) VALUES (?, ?, ?)
       ON CONFLICT(day) DO UPDATE SET sensor_steps = sensor_steps + excluded.sensor_steps,
         updated_at = excluded.updated_at`,
      [day, Math.round(delta), nowIso()]
    );
  },
  /** Set (or clear with null) a manual value for a day. */
  async setManual(day: DayKey, steps: number | null): Promise<void> {
    if (steps !== null && (!Number.isFinite(steps) || steps < 0 || steps > MAX_DAILY_STEPS))
      throw new ValidationError('steps', `Enter a number between 0 and ${MAX_DAILY_STEPS.toLocaleString()}.`);
    const d = await db();
    await d.run(
      `INSERT INTO step_days (day, sensor_steps, manual_steps, updated_at) VALUES (?, 0, ?, ?)
       ON CONFLICT(day) DO UPDATE SET manual_steps = excluded.manual_steps, updated_at = excluded.updated_at`,
      [day, steps === null ? null : Math.round(steps), nowIso()]
    );
  },
  async get(day: DayKey): Promise<StepDay | null> {
    const d = await db();
    const r = await d.first<StepRow>('SELECT * FROM step_days WHERE day = ?', [day]);
    return r ? toStepDay(r) : null;
  },
  async list(from: DayKey, to: DayKey): Promise<StepDay[]> {
    const d = await db();
    return (
      await d.all<StepRow>('SELECT * FROM step_days WHERE day >= ? AND day <= ? ORDER BY day', [from, to])
    ).map(toStepDay);
  },
};

/* ----------------------------- Export / wipe ---------------------------- */

export interface BloomExport {
  app: 'Bloom';
  version: 1;
  exportedAt: string;
  periods: PeriodLog[];
  dayLogs: DayLog[];
  sleep: SleepLog[];
  vitals: Vital[];
  steps: StepDay[];
}

export async function exportAll(): Promise<BloomExport> {
  const d = await db();
  const sleep = await d.all<SleepRow>('SELECT * FROM sleep_logs ORDER BY end_time');
  return {
    app: 'Bloom',
    version: 1,
    exportedAt: nowIso(),
    periods: await periods.list(),
    dayLogs: await dayLogs.list(),
    sleep: sleep.map((r) => ({ id: r.id, start: r.start_time, end: r.end_time, quality: r.quality })),
    vitals: await d.all<Vital>('SELECT id, kind, value, time FROM vitals ORDER BY time'),
    steps: (await d.all<StepRow>('SELECT * FROM step_days ORDER BY day')).map(toStepDay),
  };
}

export async function deleteAllData(): Promise<void> {
  const d = await db();
  for (const t of ALL_TABLES) await d.run(`DELETE FROM ${t}`);
}

export async function countAll(): Promise<number> {
  const d = await db();
  let n = 0;
  for (const t of ALL_TABLES) {
    const r = await d.first<{ n: number }>(`SELECT COUNT(*) AS n FROM ${t}`);
    n += r?.n ?? 0;
  }
  return n;
}
