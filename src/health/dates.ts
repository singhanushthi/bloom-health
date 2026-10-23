/**
 * Date helpers that work in *local calendar days* expressed as `YYYY-MM-DD` strings.
 * Day arithmetic is done on UTC midnights of those calendar dates so DST shifts
 * never produce off-by-one errors.
 */

export type DayKey = string; // YYYY-MM-DD

const DAY_MS = 86_400_000;

const pad = (n: number) => String(n).padStart(2, '0');

/** Local calendar day of a Date / ISO instant. */
export function toDayKey(d: Date | string): DayKey {
  const date = typeof d === 'string' ? new Date(d) : d;
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function dayKeyToUtc(key: DayKey): number {
  const [y, m, d] = key.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
}

function utcToDayKey(ms: number): DayKey {
  const d = new Date(ms);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

export function addDays(key: DayKey, n: number): DayKey {
  return utcToDayKey(dayKeyToUtc(key) + n * DAY_MS);
}

/** Whole days from `a` to `b` (b - a). */
export function diffDays(a: DayKey, b: DayKey): number {
  return Math.round((dayKeyToUtc(b) - dayKeyToUtc(a)) / DAY_MS);
}

/** Local midnight Date for a day key. */
export function dayStart(key: DayKey): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d, 0, 0, 0, 0);
}

export function todayKey(now: Date = new Date()): DayKey {
  return toDayKey(now);
}

/** Inclusive list of day keys ending at `end`, `count` long. */
export function lastNDays(count: number, end: DayKey = todayKey()): DayKey[] {
  return Array.from({ length: count }, (_, i) => addDays(end, i - (count - 1)));
}

/** Every calendar day an interval touches (end exclusive at midnight). */
export function daysInInterval(startIso: string, endIso: string): DayKey[] {
  const start = toDayKey(startIso);
  const endDate = new Date(endIso);
  // An interval ending exactly at local midnight does not include that day.
  const endAdj = new Date(endDate.getTime() - 1);
  const end = endAdj.getTime() < new Date(startIso).getTime() ? start : toDayKey(endAdj);
  const n = Math.max(0, diffDays(start, end));
  return Array.from({ length: n + 1 }, (_, i) => addDays(start, i));
}

export function formatDay(key: DayKey, opts: Intl.DateTimeFormatOptions): string {
  return dayStart(key).toLocaleDateString(undefined, opts);
}

export function weekdayShort(key: DayKey): string {
  return formatDay(key, { weekday: 'narrow' });
}

export function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  if (h === 0) return `${m}m`;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

export function formatDurationLong(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  const hs = h === 1 ? '1 hour' : `${h} hours`;
  const ms = m === 1 ? '1 minute' : `${m} minutes`;
  if (h === 0) return ms;
  return m === 0 ? hs : `${hs} ${ms}`;
}
