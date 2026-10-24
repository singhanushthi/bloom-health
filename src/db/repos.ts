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

/* ------------------------------ Plan: k/v ------------------------------ */

export const kv = {
  async get<T>(key: string): Promise<T | null> {
    const d = await db();
    const r = await d.first<{ value: string }>('SELECT value FROM kv WHERE key = ?', [key]);
    if (!r) return null;
    try {
      return JSON.parse(r.value) as T;
    } catch {
      return null;
    }
  },
  async set(key: string, value: unknown): Promise<void> {
    const d = await db();
    await d.run(
      `INSERT INTO kv (key, value, updated_at) VALUES (?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
      [key, JSON.stringify(value), nowIso()]
    );
  },
  async remove(key: string): Promise<void> {
    const d = await db();
    await d.run('DELETE FROM kv WHERE key = ?', [key]);
  },
};

/* -------------------------------- Weight -------------------------------- */

export const WEIGHT_RANGE = { min: 25, max: 300 } as const;
export type WeightSlot = 'morning' | 'night';

export interface WeightLog {
  id: number;
  day: DayKey;
  slot: WeightSlot;
  kg: number;
  time: string;
  /** 'bloom' for Bloom's own logs; otherwise a Health Connect dataOrigin. */
  source: string;
}

interface WeightRow {
  id: number;
  day: string;
  slot: string;
  kg: number;
  time: string;
  source: string;
}

const toWeight = (r: WeightRow): WeightLog => ({
  id: r.id,
  day: r.day,
  slot: r.slot === 'night' ? 'night' : 'morning',
  kg: r.kg,
  time: r.time,
  source: r.source,
});

export function validateWeight(kg: number) {
  if (!Number.isFinite(kg)) throw new ValidationError('kg', 'Enter your weight in kg.');
  if (kg < WEIGHT_RANGE.min || kg > WEIGHT_RANGE.max)
    throw new ValidationError('kg', `Enter a weight between ${WEIGHT_RANGE.min} and ${WEIGHT_RANGE.max} kg.`);
}

export const weightLogs = {
  async add(w: { day: DayKey; slot: WeightSlot; kg: number; time?: Date; source?: string }): Promise<number> {
    assertDay('day', w.day);
    validateWeight(w.kg);
    const d = await db();
    const r = await d.run(
      'INSERT INTO weight_logs (day, slot, kg, time, source, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      [w.day, w.slot, Math.round(w.kg * 10) / 10, (w.time ?? new Date()).toISOString(), w.source ?? 'bloom', nowIso()]
    );
    return r.lastInsertRowId;
  },
  async update(id: number, w: { kg: number; slot: WeightSlot; day: DayKey }) {
    assertDay('day', w.day);
    validateWeight(w.kg);
    const d = await db();
    await d.run('UPDATE weight_logs SET kg = ?, slot = ?, day = ? WHERE id = ?', [
      Math.round(w.kg * 10) / 10,
      w.slot,
      w.day,
      id,
    ]);
  },
  async remove(id: number) {
    const d = await db();
    await d.run('DELETE FROM weight_logs WHERE id = ?', [id]);
  },
  async list(from?: DayKey, to?: DayKey): Promise<WeightLog[]> {
    const d = await db();
    return (
      await d.all<WeightRow>('SELECT * FROM weight_logs WHERE day >= ? AND day <= ? ORDER BY day ASC, time ASC', [
        from ?? '0000-00-00',
        to ?? '9999-99-99',
      ])
    ).map(toWeight);
  },
  async latest(slot?: WeightSlot): Promise<WeightLog | null> {
    const d = await db();
    const r = slot
      ? await d.first<WeightRow>('SELECT * FROM weight_logs WHERE slot = ? ORDER BY day DESC, time DESC LIMIT 1', [slot])
      : await d.first<WeightRow>('SELECT * FROM weight_logs ORDER BY day DESC, time DESC LIMIT 1');
    return r ? toWeight(r) : null;
  },
};

/* --------------------------------- Food --------------------------------- */

export type Meal = 'breakfast' | 'lunch' | 'snack' | 'dinner' | 'other';
export const MEALS: Meal[] = ['breakfast', 'lunch', 'snack', 'dinner', 'other'];
export const MEAL_LABEL: Record<Meal, string> = {
  breakfast: 'Breakfast',
  lunch: 'Lunch',
  snack: 'Evening snack',
  dinner: 'Dinner',
  other: 'Other',
};

export type FoodSource = 'db' | 'custom' | 'ai';

export interface Nutrients {
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber: number;
}

export interface FoodEntry extends Nutrients {
  id: number;
  day: DayKey;
  meal: Meal;
  foodKey: string | null;
  name: string;
  servings: number;
  grams: number | null;
  source: FoodSource;
  createdAt: string;
}

interface FoodRow {
  id: number;
  day: string;
  meal: string;
  food_key: string | null;
  name: string;
  servings: number;
  grams: number | null;
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber: number;
  source: string;
  created_at: string;
}

const toFood = (r: FoodRow): FoodEntry => ({
  id: r.id,
  day: r.day,
  meal: (MEALS as string[]).includes(r.meal) ? (r.meal as Meal) : 'other',
  foodKey: r.food_key,
  name: r.name,
  servings: r.servings,
  grams: r.grams,
  kcal: r.kcal,
  protein: r.protein,
  carbs: r.carbs,
  fat: r.fat,
  fiber: r.fiber,
  source: (r.source as FoodSource) ?? 'db',
  createdAt: r.created_at,
});

export type NewFoodEntry = Omit<FoodEntry, 'id' | 'createdAt' | 'grams' | 'foodKey'> & {
  grams?: number | null;
  foodKey?: string | null;
};

export function validateFood(e: { name: string; kcal: number; servings: number }) {
  if (!e.name.trim()) throw new ValidationError('name', 'Give the food a name.');
  if (!Number.isFinite(e.kcal) || e.kcal < 0 || e.kcal > 5000)
    throw new ValidationError('kcal', 'Enter calories between 0 and 5000.');
  if (!(e.servings > 0) || e.servings > 50) throw new ValidationError('servings', 'Enter a quantity above 0.');
}

const r1 = (n: number) => Math.round((Number.isFinite(n) ? n : 0) * 10) / 10;

export const foodEntries = {
  async add(e: NewFoodEntry): Promise<number> {
    assertDay('day', e.day);
    validateFood(e);
    const d = await db();
    const r = await d.run(
      `INSERT INTO food_entries (day, meal, food_key, name, servings, grams, kcal, protein, carbs, fat, fiber, source, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        e.day,
        e.meal,
        e.foodKey ?? null,
        e.name.trim(),
        e.servings,
        e.grams ?? null,
        Math.round(e.kcal),
        r1(e.protein),
        r1(e.carbs),
        r1(e.fat),
        r1(e.fiber),
        e.source,
        nowIso(),
      ]
    );
    return r.lastInsertRowId;
  },
  async update(id: number, e: NewFoodEntry): Promise<void> {
    validateFood(e);
    const d = await db();
    await d.run(
      `UPDATE food_entries SET meal = ?, name = ?, servings = ?, grams = ?, kcal = ?, protein = ?, carbs = ?,
         fat = ?, fiber = ? WHERE id = ?`,
      [e.meal, e.name.trim(), e.servings, e.grams ?? null, Math.round(e.kcal), r1(e.protein), r1(e.carbs), r1(e.fat), r1(e.fiber), id]
    );
  },
  async remove(id: number) {
    const d = await db();
    await d.run('DELETE FROM food_entries WHERE id = ?', [id]);
  },
  async get(id: number): Promise<FoodEntry | null> {
    const d = await db();
    const r = await d.first<FoodRow>('SELECT * FROM food_entries WHERE id = ?', [id]);
    return r ? toFood(r) : null;
  },
  async list(from: DayKey, to: DayKey = from): Promise<FoodEntry[]> {
    const d = await db();
    return (
      await d.all<FoodRow>('SELECT * FROM food_entries WHERE day >= ? AND day <= ? ORDER BY day ASC, id ASC', [from, to])
    ).map(toFood);
  },
  /** Most recently logged distinct foods (by key, else name). */
  async recent(limit = 12): Promise<FoodEntry[]> {
    const d = await db();
    const rows = await d.all<FoodRow>('SELECT * FROM food_entries ORDER BY id DESC LIMIT 200');
    const seen = new Set<string>();
    const out: FoodEntry[] = [];
    for (const r of rows) {
      const k = r.food_key ?? `name:${r.name.toLowerCase()}`;
      if (seen.has(k)) continue;
      seen.add(k);
      out.push(toFood(r));
      if (out.length >= limit) break;
    }
    return out;
  },
};

export interface CustomFood extends Nutrients {
  id: number;
  name: string;
  servingLabel: string;
  servingGrams: number | null;
}

interface CustomFoodRow {
  id: number;
  name: string;
  serving_label: string;
  serving_grams: number | null;
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber: number;
}

export const customFoods = {
  async add(f: Omit<CustomFood, 'id'>): Promise<number> {
    if (!f.name.trim()) throw new ValidationError('name', 'Give the food a name.');
    if (!f.servingLabel.trim()) throw new ValidationError('servingLabel', 'Describe one serving, e.g. “1 bowl”.');
    if (!Number.isFinite(f.kcal) || f.kcal < 0 || f.kcal > 3000)
      throw new ValidationError('kcal', 'Enter calories per serving between 0 and 3000.');
    const d = await db();
    const r = await d.run(
      `INSERT INTO custom_foods (name, serving_label, serving_grams, kcal, protein, carbs, fat, fiber, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [f.name.trim(), f.servingLabel.trim(), f.servingGrams ?? null, Math.round(f.kcal), r1(f.protein), r1(f.carbs), r1(f.fat), r1(f.fiber), nowIso()]
    );
    return r.lastInsertRowId;
  },
  async remove(id: number) {
    const d = await db();
    await d.run('DELETE FROM custom_foods WHERE id = ?', [id]);
  },
  async list(): Promise<CustomFood[]> {
    const d = await db();
    return (await d.all<CustomFoodRow>('SELECT * FROM custom_foods ORDER BY name COLLATE NOCASE')).map((r) => ({
      id: r.id,
      name: r.name,
      servingLabel: r.serving_label,
      servingGrams: r.serving_grams,
      kcal: r.kcal,
      protein: r.protein,
      carbs: r.carbs,
      fat: r.fat,
      fiber: r.fiber,
    }));
  },
};

export const favourites = {
  async list(): Promise<string[]> {
    const d = await db();
    return (await d.all<{ food_key: string }>('SELECT food_key FROM food_favourites ORDER BY created_at DESC')).map(
      (r) => r.food_key
    );
  },
  async toggle(key: string): Promise<boolean> {
    const d = await db();
    const r = await d.first<{ food_key: string }>('SELECT food_key FROM food_favourites WHERE food_key = ?', [key]);
    if (r) {
      await d.run('DELETE FROM food_favourites WHERE food_key = ?', [key]);
      return false;
    }
    await d.run('INSERT INTO food_favourites (food_key, created_at) VALUES (?, ?)', [key, nowIso()]);
    return true;
  },
};

/* --------------------------------- Water -------------------------------- */

export const WATER_GLASS_ML = 250;

export const water = {
  async get(day: DayKey): Promise<number> {
    const d = await db();
    const r = await d.first<{ ml: number }>('SELECT ml FROM water_days WHERE day = ?', [day]);
    return r?.ml ?? 0;
  },
  async set(day: DayKey, ml: number): Promise<void> {
    assertDay('day', day);
    const d = await db();
    const v = Math.max(0, Math.min(10_000, Math.round(ml)));
    await d.run(
      `INSERT INTO water_days (day, ml, updated_at) VALUES (?, ?, ?)
       ON CONFLICT(day) DO UPDATE SET ml = excluded.ml, updated_at = excluded.updated_at`,
      [day, v, nowIso()]
    );
  },
  async list(from: DayKey, to: DayKey): Promise<{ day: DayKey; ml: number }[]> {
    const d = await db();
    return d.all('SELECT day, ml FROM water_days WHERE day >= ? AND day <= ? ORDER BY day', [from, to]);
  },
};

/* ------------------------------- Activity ------------------------------- */

export type ActivitySource = 'manual' | 'bloom-yoga' | 'health-connect';

export interface ActivityLog {
  id: number;
  day: DayKey;
  type: string;
  title: string | null;
  minutes: number;
  intensity: 'light' | 'moderate' | 'vigorous';
  kcal: number;
  source: ActivitySource;
}

interface ActivityRow {
  id: number;
  day: string;
  type: string;
  title: string | null;
  minutes: number;
  intensity: string;
  kcal: number;
  source: string;
}

const toActivity = (r: ActivityRow): ActivityLog => ({
  id: r.id,
  day: r.day,
  type: r.type,
  title: r.title,
  minutes: r.minutes,
  intensity: r.intensity === 'light' || r.intensity === 'vigorous' ? r.intensity : 'moderate',
  kcal: r.kcal,
  source: (r.source as ActivitySource) ?? 'manual',
});

export const ACTIVITY_MAX_MINUTES = 600;

export function validateActivity(a: { minutes: number }) {
  if (!Number.isFinite(a.minutes) || a.minutes < 1 || a.minutes > ACTIVITY_MAX_MINUTES)
    throw new ValidationError('minutes', `Enter between 1 and ${ACTIVITY_MAX_MINUTES} minutes.`);
}

export const activityLogs = {
  async add(a: Omit<ActivityLog, 'id'>): Promise<number> {
    assertDay('day', a.day);
    validateActivity(a);
    const d = await db();
    const r = await d.run(
      `INSERT INTO activity_logs (day, type, title, minutes, intensity, kcal, source, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [a.day, a.type, a.title?.trim() || null, Math.round(a.minutes), a.intensity, Math.round(a.kcal), a.source, nowIso()]
    );
    return r.lastInsertRowId;
  },
  async update(id: number, a: Omit<ActivityLog, 'id' | 'source'>): Promise<void> {
    validateActivity(a);
    const d = await db();
    await d.run('UPDATE activity_logs SET day = ?, type = ?, title = ?, minutes = ?, intensity = ?, kcal = ? WHERE id = ?', [
      a.day,
      a.type,
      a.title?.trim() || null,
      Math.round(a.minutes),
      a.intensity,
      Math.round(a.kcal),
      id,
    ]);
  },
  async remove(id: number) {
    const d = await db();
    await d.run('DELETE FROM activity_logs WHERE id = ?', [id]);
  },
  async get(id: number): Promise<ActivityLog | null> {
    const d = await db();
    const r = await d.first<ActivityRow>('SELECT * FROM activity_logs WHERE id = ?', [id]);
    return r ? toActivity(r) : null;
  },
  async list(from: DayKey, to: DayKey = from): Promise<ActivityLog[]> {
    const d = await db();
    return (
      await d.all<ActivityRow>('SELECT * FROM activity_logs WHERE day >= ? AND day <= ? ORDER BY day ASC, id ASC', [from, to])
    ).map(toActivity);
  },
};

/* --------------------------- Plan adjustments --------------------------- */

export interface PlanAdjustment {
  id: number;
  weekStart: DayKey;
  weekNo: number;
  deltaKcal: number;
  verdict: string;
  reason: string;
}

export const planAdjustments = {
  /** One decision per week (re-running for the same week is a no-op). */
  async add(a: Omit<PlanAdjustment, 'id'>): Promise<boolean> {
    const d = await db();
    const r = await d.run(
      'INSERT OR IGNORE INTO plan_adjustments (week_start, week_no, delta_kcal, verdict, reason, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      [a.weekStart, a.weekNo, Math.round(a.deltaKcal), a.verdict, a.reason, nowIso()]
    );
    return r.changes > 0;
  },
  async list(): Promise<PlanAdjustment[]> {
    const d = await db();
    return (
      await d.all<{ id: number; week_start: string; week_no: number; delta_kcal: number; verdict: string; reason: string }>(
        'SELECT * FROM plan_adjustments ORDER BY week_start ASC'
      )
    ).map((r) => ({
      id: r.id,
      weekStart: r.week_start,
      weekNo: r.week_no,
      deltaKcal: r.delta_kcal,
      verdict: r.verdict,
      reason: r.reason,
    }));
  },
  async clear() {
    const d = await db();
    await d.run('DELETE FROM plan_adjustments');
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
  plan?: {
    profile: unknown;
    weights: WeightLog[];
    food: FoodEntry[];
    customFoods: CustomFood[];
    water: { day: DayKey; ml: number }[];
    activities: ActivityLog[];
    adjustments: PlanAdjustment[];
  };
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
    plan: {
      profile: await kv.get('plan.profile'),
      weights: await weightLogs.list(),
      food: await foodEntries.list('0000-00-00', '9999-99-99'),
      customFoods: await customFoods.list(),
      water: await water.list('0000-00-00', '9999-99-99'),
      activities: await activityLogs.list('0000-00-00', '9999-99-99'),
      adjustments: await planAdjustments.list(),
    },
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
