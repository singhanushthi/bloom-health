/**
 * Cycle module storage (on-device SQLite only).
 *
 * Owns two small tables, created lazily with CREATE TABLE IF NOT EXISTS (schema.ts is untouched):
 *  - cycle_kv          — cycle settings JSON (setup, goal, reminders, privacy)
 *  - cycle_day_extras  — extra day-log fields (discharge, sex drive, energy, sleep, cravings,
 *                        pain 0–3, pills/medication tags). Flow/symptoms/mood/note stay in day_logs.
 */
import type { SqlDriver } from '../db/driver';
import { periods, ValidationError, type Flow } from '../db/repos';
import { db } from '../db/schema';
import { addDays, diffDays, todayKey, type DayKey } from '../health/dates';
import { DEFAULT_CYCLE_DAYS, DEFAULT_PERIOD_DAYS } from '../health/cyclePrediction';

const nowIso = () => new Date().toISOString();

export const CYCLE_TABLES = ['cycle_kv', 'cycle_day_extras'] as const;

const CYCLE_SQL = `
CREATE TABLE IF NOT EXISTS cycle_kv (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS cycle_day_extras (
  day TEXT PRIMARY KEY,             -- YYYY-MM-DD
  discharge TEXT,                   -- none | sticky | creamy | egg_white | watery
  sex_drive TEXT,                   -- low | medium | high
  energy TEXT,                      -- low | medium | high
  sleep_quality TEXT,               -- poor | ok | good
  cravings TEXT NOT NULL DEFAULT '[]',
  pain INTEGER,                     -- 0..3
  meds TEXT NOT NULL DEFAULT '[]',  -- free-text tags
  updated_at TEXT NOT NULL
);
`;

let ensuredFor: SqlDriver | null = null;

/** Driver with the main schema and the cycle tables in place. */
export async function cycleDb(): Promise<SqlDriver> {
  const d = await db();
  if (ensuredFor !== d) {
    await d.exec(CYCLE_SQL);
    ensuredFor = d;
  }
  return d;
}

/* -------------------------------- Settings ------------------------------- */

export type CycleGoal = 'track' | 'avoid' | 'conceive';
export const CYCLE_GOALS: CycleGoal[] = ['track', 'avoid', 'conceive'];
export const CYCLE_GOAL_LABEL: Record<CycleGoal, string> = {
  track: 'Track my periods',
  avoid: 'Know my higher-chance days',
  conceive: 'Trying to conceive',
};
export const CYCLE_GOAL_HINT: Record<CycleGoal, string> = {
  track: 'Period dates, symptoms and suggestions.',
  avoid: 'Awareness only — highlights the estimated fertile window.',
  conceive: 'Highlights your estimated fertile window and ovulation day.',
};

/** "HH:MM", 24-hour. */
export type ClockTime = string;

export interface ReminderSettings {
  periodSoon: boolean;
  late: boolean;
  fertile: boolean;
  logDay: boolean;
  logTime: ClockTime;
  pill: boolean;
  pillTime: ClockTime;
}

export interface CycleSettings {
  setupDone: boolean;
  typicalPeriodLength: number;
  typicalCycleLength: number;
  irregular: boolean;
  goal: CycleGoal;
  /** Hide cycle details on the Today screen. */
  hideOnToday: boolean;
  /** Notification wording that never mentions periods (default on). */
  discreet: boolean;
  reminders: ReminderSettings;
}

export const PERIOD_LENGTH_RANGE = { min: 2, max: 10 } as const;
export const CYCLE_LENGTH_RANGE = { min: 18, max: 45 } as const;

export const DEFAULT_CYCLE_SETTINGS: CycleSettings = {
  setupDone: false,
  typicalPeriodLength: DEFAULT_PERIOD_DAYS,
  typicalCycleLength: DEFAULT_CYCLE_DAYS,
  irregular: false,
  goal: 'track',
  hideOnToday: false,
  discreet: true,
  reminders: {
    periodSoon: true,
    late: true,
    fertile: false,
    logDay: false,
    logTime: '21:00',
    pill: false,
    pillTime: '21:30',
  },
};

const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;
export const isClockTime = (t: unknown): t is ClockTime => typeof t === 'string' && TIME_RE.test(t);

const clampInt = (v: unknown, lo: number, hi: number, dflt: number) =>
  typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, Math.round(v))) : dflt;

/** Merge unknown stored JSON with defaults, clamping everything. */
export function normalizeSettings(raw: unknown): CycleSettings {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Partial<CycleSettings>;
  const rr = (r.reminders && typeof r.reminders === 'object' ? r.reminders : {}) as Partial<ReminderSettings>;
  const D = DEFAULT_CYCLE_SETTINGS;
  const bool = (v: unknown, d: boolean) => (typeof v === 'boolean' ? v : d);
  return {
    setupDone: bool(r.setupDone, D.setupDone),
    typicalPeriodLength: clampInt(r.typicalPeriodLength, PERIOD_LENGTH_RANGE.min, PERIOD_LENGTH_RANGE.max, D.typicalPeriodLength),
    typicalCycleLength: clampInt(r.typicalCycleLength, CYCLE_LENGTH_RANGE.min, CYCLE_LENGTH_RANGE.max, D.typicalCycleLength),
    irregular: bool(r.irregular, D.irregular),
    goal: CYCLE_GOALS.includes(r.goal as CycleGoal) ? (r.goal as CycleGoal) : D.goal,
    hideOnToday: bool(r.hideOnToday, D.hideOnToday),
    discreet: bool(r.discreet, D.discreet),
    reminders: {
      periodSoon: bool(rr.periodSoon, D.reminders.periodSoon),
      late: bool(rr.late, D.reminders.late),
      fertile: bool(rr.fertile, D.reminders.fertile),
      logDay: bool(rr.logDay, D.reminders.logDay),
      logTime: isClockTime(rr.logTime) ? rr.logTime : D.reminders.logTime,
      pill: bool(rr.pill, D.reminders.pill),
      pillTime: isClockTime(rr.pillTime) ? rr.pillTime : D.reminders.pillTime,
    },
  };
}

const SETTINGS_KEY = 'settings';
const listeners = new Set<() => void>();

/** Subscribe to cycle settings / extras changes. Returns an unsubscribe function. */
export function onCycleChange(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}
export function emitCycleChange(): void {
  listeners.forEach((fn) => {
    try {
      fn();
    } catch {
      // a listener failing must not break saving
    }
  });
}

export async function loadCycleSettings(): Promise<CycleSettings> {
  try {
    const d = await cycleDb();
    const row = await d.first<{ value: string }>('SELECT value FROM cycle_kv WHERE key = ?', [SETTINGS_KEY]);
    return normalizeSettings(row ? JSON.parse(row.value) : null);
  } catch {
    return normalizeSettings(null);
  }
}

export type CycleSettingsPatch = Partial<Omit<CycleSettings, 'reminders'>> & { reminders?: Partial<ReminderSettings> };

export async function saveCycleSettings(patch: CycleSettingsPatch): Promise<CycleSettings> {
  const cur = await loadCycleSettings();
  const next = normalizeSettings({ ...cur, ...patch, reminders: { ...cur.reminders, ...(patch.reminders ?? {}) } });
  const d = await cycleDb();
  await d.run(
    `INSERT INTO cycle_kv (key, value, updated_at) VALUES (?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
    [SETTINGS_KEY, JSON.stringify(next), nowIso()]
  );
  emitCycleChange();
  return next;
}

/** Small internal key/value helpers (e.g. how many reminders are scheduled). */
export async function getCycleKv(key: string): Promise<string | null> {
  try {
    const d = await cycleDb();
    return (await d.first<{ value: string }>('SELECT value FROM cycle_kv WHERE key = ?', [key]))?.value ?? null;
  } catch {
    return null;
  }
}
export async function setCycleKv(key: string, value: string): Promise<void> {
  const d = await cycleDb();
  await d.run(
    `INSERT INTO cycle_kv (key, value, updated_at) VALUES (?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
    [key, value, nowIso()]
  );
}

/* ------------------------------ Setup / quick ----------------------------- */

export interface SetupInput {
  lastPeriodStart: DayKey;
  periodLength: number;
  cycleLength: number;
  irregular: boolean;
  goal: CycleGoal;
}

export function validateSetup(s: SetupInput, today: DayKey = todayKey()): Partial<Record<keyof SetupInput, string>> {
  const errors: Partial<Record<keyof SetupInput, string>> = {};
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s.lastPeriodStart)) errors.lastPeriodStart = 'Pick a date.';
  else if (s.lastPeriodStart > today) errors.lastPeriodStart = 'This date can’t be in the future.';
  else if (diffDays(s.lastPeriodStart, today) > 120) errors.lastPeriodStart = 'Pick a date in the last 4 months, or skip this.';
  if (!Number.isInteger(s.periodLength) || s.periodLength < PERIOD_LENGTH_RANGE.min || s.periodLength > PERIOD_LENGTH_RANGE.max)
    errors.periodLength = `Between ${PERIOD_LENGTH_RANGE.min} and ${PERIOD_LENGTH_RANGE.max} days.`;
  if (!Number.isInteger(s.cycleLength) || s.cycleLength < CYCLE_LENGTH_RANGE.min || s.cycleLength > CYCLE_LENGTH_RANGE.max)
    errors.cycleLength = `Between ${CYCLE_LENGTH_RANGE.min} and ${CYCLE_LENGTH_RANGE.max} days.`;
  return errors;
}

/** First-time setup: saves settings and logs the last period (end = start + length − 1, if past). */
export async function completeSetup(s: SetupInput, today: DayKey = todayKey()): Promise<void> {
  const errors = validateSetup(s, today);
  const first = Object.keys(errors)[0] as keyof SetupInput | undefined;
  if (first) throw new ValidationError(first, errors[first]!);
  const end = addDays(s.lastPeriodStart, s.periodLength - 1);
  const existing = await periods.list();
  if (!existing.some((p) => p.startDay === s.lastPeriodStart)) {
    await periods.add({ startDay: s.lastPeriodStart, endDay: end < today ? end : null, flow: null });
  }
  await saveCycleSettings({
    setupDone: true,
    typicalPeriodLength: s.periodLength,
    typicalCycleLength: s.cycleLength,
    irregular: s.irregular,
    goal: s.goal,
  });
}

/** The newest Bloom period log with no end date, if any. */
export async function openPeriodLog() {
  const list = await periods.list();
  const open = list.filter((p) => !p.endDay);
  return open.length ? open[open.length - 1] : null;
}

/** One tap: "Period started today". No-op if a period log already starts today. */
export async function startPeriodToday(today: DayKey = todayKey(), flow: Flow | null = 'medium'): Promise<number | null> {
  const list = await periods.list();
  if (list.some((p) => p.startDay === today)) return null;
  // Close any older open log first so it doesn't run on.
  for (const p of list) {
    if (!p.endDay && p.startDay < today) {
      const end = addDays(p.startDay, DEFAULT_PERIOD_DAYS - 1);
      await periods.update(p.id, { startDay: p.startDay, endDay: end < today ? end : addDays(today, -1), flow: p.flow });
    }
  }
  const id = await periods.add({ startDay: today, endDay: null, flow });
  emitCycleChange();
  return id;
}

/** One tap: "Period ended" — closes the newest open log at `day` (today by default). */
export async function endPeriodToday(today: DayKey = todayKey()): Promise<boolean> {
  const open = await openPeriodLog();
  if (!open) return false;
  const end = today < open.startDay ? open.startDay : today;
  await periods.update(open.id, { startDay: open.startDay, endDay: end, flow: open.flow });
  emitCycleChange();
  return true;
}

/* ------------------------------- Day extras ------------------------------ */

export type Discharge = 'none' | 'sticky' | 'creamy' | 'egg_white' | 'watery';
export const DISCHARGES: { id: Discharge; label: string }[] = [
  { id: 'none', label: 'None' },
  { id: 'sticky', label: 'Sticky' },
  { id: 'creamy', label: 'Creamy' },
  { id: 'egg_white', label: 'Egg-white' },
  { id: 'watery', label: 'Watery' },
];
export type Level3 = 'low' | 'medium' | 'high';
export const LEVELS: { id: Level3; label: string }[] = [
  { id: 'low', label: 'Low' },
  { id: 'medium', label: 'Medium' },
  { id: 'high', label: 'High' },
];
export type SleepQ = 'poor' | 'ok' | 'good';
export const SLEEP_QS: { id: SleepQ; label: string }[] = [
  { id: 'poor', label: 'Poor' },
  { id: 'ok', label: 'Okay' },
  { id: 'good', label: 'Good' },
];
export const CRAVINGS = [
  { id: 'sweet', label: 'Sweet' },
  { id: 'salty', label: 'Salty' },
  { id: 'carbs', label: 'Carbs' },
  { id: 'chocolate', label: 'Chocolate' },
  { id: 'spicy', label: 'Spicy' },
] as const;
export const PAIN_LEVELS = [
  { value: 0, label: 'None' },
  { value: 1, label: 'Mild' },
  { value: 2, label: 'Moderate' },
  { value: 3, label: 'Strong' },
] as const;
export const MED_TAG_MAX = 40;
export const MED_TAGS_MAX = 8;

export interface DayExtras {
  day: DayKey;
  discharge: Discharge | null;
  sexDrive: Level3 | null;
  energy: Level3 | null;
  sleepQuality: SleepQ | null;
  cravings: string[];
  pain: number | null;
  meds: string[];
}

export const emptyExtras = (day: DayKey): DayExtras => ({
  day,
  discharge: null,
  sexDrive: null,
  energy: null,
  sleepQuality: null,
  cravings: [],
  pain: null,
  meds: [],
});

export function isEmptyExtras(e: DayExtras): boolean {
  return !e.discharge && !e.sexDrive && !e.energy && !e.sleepQuality && !e.cravings.length && e.pain === null && !e.meds.length;
}

/** Trim, de-duplicate (case-insensitive) and cap medication tags. */
export function cleanMedTags(tags: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const t of tags) {
    const v = t.trim().replace(/\s+/g, ' ').slice(0, MED_TAG_MAX);
    if (!v || seen.has(v.toLowerCase())) continue;
    seen.add(v.toLowerCase());
    out.push(v);
    if (out.length >= MED_TAGS_MAX) break;
  }
  return out;
}

interface ExtrasRow {
  day: string;
  discharge: string | null;
  sex_drive: string | null;
  energy: string | null;
  sleep_quality: string | null;
  cravings: string;
  pain: number | null;
  meds: string;
}

const parseList = (s: string): string[] => {
  try {
    const v = JSON.parse(s);
    return Array.isArray(v) ? v.filter((x) => typeof x === 'string') : [];
  } catch {
    return [];
  }
};

const toExtras = (r: ExtrasRow): DayExtras => ({
  day: r.day,
  discharge: (r.discharge as Discharge | null) ?? null,
  sexDrive: (r.sex_drive as Level3 | null) ?? null,
  energy: (r.energy as Level3 | null) ?? null,
  sleepQuality: (r.sleep_quality as SleepQ | null) ?? null,
  cravings: parseList(r.cravings),
  pain: r.pain ?? null,
  meds: parseList(r.meds),
});

export const dayExtras = {
  async get(day: DayKey): Promise<DayExtras | null> {
    const d = await cycleDb();
    const r = await d.first<ExtrasRow>('SELECT * FROM cycle_day_extras WHERE day = ?', [day]);
    return r ? toExtras(r) : null;
  },
  async upsert(e: DayExtras): Promise<void> {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(e.day)) throw new ValidationError('day', 'Use a valid date.');
    if (e.pain !== null && (!Number.isInteger(e.pain) || e.pain < 0 || e.pain > 3))
      throw new ValidationError('pain', 'Pain level is 0 to 3.');
    const meds = cleanMedTags(e.meds);
    const d = await cycleDb();
    if (isEmptyExtras({ ...e, meds })) {
      await d.run('DELETE FROM cycle_day_extras WHERE day = ?', [e.day]);
      emitCycleChange();
      return;
    }
    await d.run(
      `INSERT INTO cycle_day_extras (day, discharge, sex_drive, energy, sleep_quality, cravings, pain, meds, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(day) DO UPDATE SET discharge = excluded.discharge, sex_drive = excluded.sex_drive,
         energy = excluded.energy, sleep_quality = excluded.sleep_quality, cravings = excluded.cravings,
         pain = excluded.pain, meds = excluded.meds, updated_at = excluded.updated_at`,
      [
        e.day,
        e.discharge,
        e.sexDrive,
        e.energy,
        e.sleepQuality,
        JSON.stringify(e.cravings),
        e.pain,
        JSON.stringify(meds),
        nowIso(),
      ]
    );
    emitCycleChange();
  },
  async list(from?: DayKey, to?: DayKey): Promise<DayExtras[]> {
    const d = await cycleDb();
    const rows = await d.all<ExtrasRow>('SELECT * FROM cycle_day_extras WHERE day >= ? AND day <= ? ORDER BY day ASC', [
      from ?? '0000-00-00',
      to ?? '9999-99-99',
    ]);
    return rows.map(toExtras);
  },
  /** Recently used medication tags, most recent first (for quick re-use). */
  async recentMeds(limit = 8): Promise<string[]> {
    const all = await this.list();
    const out: string[] = [];
    for (let i = all.length - 1; i >= 0 && out.length < limit; i--) {
      for (const m of all[i].meds) if (!out.some((x) => x.toLowerCase() === m.toLowerCase())) out.push(m);
    }
    return out.slice(0, limit);
  },
};

/* ----------------------------- Export / wipe ----------------------------- */

/** For "Export my data": cycle settings + day extras. */
export async function exportCycleExtras(): Promise<{ settings: CycleSettings; dayExtras: DayExtras[] }> {
  return { settings: await loadCycleSettings(), dayExtras: await dayExtras.list() };
}

/** For "Delete all my data": removes the cycle module's own tables' rows. */
export async function deleteCycleData(): Promise<void> {
  const d = await cycleDb();
  for (const t of CYCLE_TABLES) await d.run(`DELETE FROM ${t}`);
  emitCycleChange();
}
