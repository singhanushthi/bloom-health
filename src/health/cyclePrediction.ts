/**
 * Pure cycle math. No React, no Health Connect — fully unit-testable.
 *
 * Model (deliberately simple, and always labelled as an estimate in the UI):
 *  - Bleeding days come from MenstruationPeriod intervals (Flo) unioned with
 *    MenstruationFlow days. Days within MAX_GAP_DAYS of each other are merged into one period.
 *  - Cycle length = days between consecutive period starts. Implausible lengths
 *    (outside MIN/MAX_CYCLE_DAYS — usually a month the user didn't log) are ignored.
 *  - Average of the last up-to-6 cycle lengths, or DEFAULT_CYCLE_DAYS (28) when fewer
 *    than MIN_CYCLES_FOR_AVERAGE (2) cycles are known.
 *  - Ovulation is estimated at (cycleLength - LUTEAL_DAYS). The "ovulation window" shown is
 *    ovulation day - 3 … ovulation day + 1.
 */
import { addDays, diffDays, type DayKey } from './dates';

export const DEFAULT_CYCLE_DAYS = 28;
export const DEFAULT_PERIOD_DAYS = 5;
export const MAX_CYCLES_AVERAGED = 6;
export const MIN_CYCLES_FOR_AVERAGE = 2;
export const MIN_CYCLE_DAYS = 15;
export const MAX_CYCLE_DAYS = 60;
export const LUTEAL_DAYS = 14;
export const MAX_GAP_DAYS = 1; // a single unlogged day inside a period doesn't split it

export type CyclePhase = 'menstrual' | 'follicular' | 'ovulation' | 'luteal';

export const PHASE_LABEL: Record<CyclePhase, string> = {
  menstrual: 'Menstrual',
  follicular: 'Follicular',
  ovulation: 'Ovulation window',
  luteal: 'Luteal',
};

export interface PeriodSpan {
  start: DayKey;
  /** Inclusive last bleeding day. */
  end: DayKey;
  lengthDays: number;
}

export interface CycleHistoryItem {
  start: DayKey;
  /** Days until the next period started; null for the current (ongoing) cycle. */
  cycleLength: number | null;
  periodLength: number;
  /** false when the length was excluded from the average as implausible. */
  counted: boolean;
}

export interface CycleStatus {
  hasData: boolean;
  periods: PeriodSpan[];
  history: CycleHistoryItem[];
  averageCycleLength: number;
  averagePeriodLength: number;
  /** Number of cycle lengths that went into the average (0 => default used). */
  cyclesUsed: number;
  usedDefault: boolean;
  lastPeriodStart: DayKey | null;
  /** 1-based day of the current cycle; null without data. */
  cycleDay: number | null;
  phase: CyclePhase | null;
  nextPeriodStart: DayKey | null;
  /** Negative when the period is late. */
  daysUntilNextPeriod: number | null;
  daysLate: number;
  ovulationDay: number;
  ovulationWindow: { start: number; end: number };
  /** Predicted bleeding days for the next two cycles (for the calendar). */
  predictedDays: DayKey[];
  /** Predicted ovulation-window days for the next cycle. */
  predictedFertileDays: DayKey[];
}

/** Merge bleeding days into period spans. */
export function groupBleedingDays(days: Iterable<DayKey>): PeriodSpan[] {
  const sorted = Array.from(new Set(days)).sort();
  const spans: PeriodSpan[] = [];
  for (const day of sorted) {
    const last = spans[spans.length - 1];
    if (last && diffDays(last.end, day) <= MAX_GAP_DAYS + 1) {
      last.end = day;
      last.lengthDays = diffDays(last.start, day) + 1;
    } else {
      spans.push({ start: day, end: day, lengthDays: 1 });
    }
  }
  return spans;
}

/* ------------------------- Merging multiple sources ------------------------ */

export type CycleSource = 'local' | 'healthConnect';

export interface SourcedPeriod extends PeriodSpan {
  /** Every source that contributed at least one day to this period. */
  sources: CycleSource[];
}

/** Expand a logged period to its days. Open-ended logs use `defaultLen` days, capped at today. */
export function expandPeriodLog(
  log: { startDay: DayKey; endDay: DayKey | null },
  today: DayKey,
  defaultLen = DEFAULT_PERIOD_DAYS
): DayKey[] {
  let end = log.endDay ?? addDays(log.startDay, defaultLen - 1);
  if (!log.endDay && end > today) end = today;
  if (end < log.startDay) end = log.startDay;
  const n = diffDays(log.startDay, end);
  return Array.from({ length: n + 1 }, (_, i) => addDays(log.startDay, i));
}

/**
 * Merge bleeding days from Bloom's own logs and from Health Connect (Flo etc).
 * Overlapping or adjacent days from both collapse into one period, so the same period
 * logged in both places is counted once. Each merged period records its sources.
 */
export function mergeBleedingSources(input: {
  local: Iterable<DayKey>;
  healthConnect: Iterable<DayKey>;
}): { days: DayKey[]; periods: SourcedPeriod[] } {
  const bySource = new Map<DayKey, Set<CycleSource>>();
  const add = (d: DayKey, s: CycleSource) => {
    const set = bySource.get(d) ?? new Set<CycleSource>();
    set.add(s);
    bySource.set(d, set);
  };
  for (const d of input.local) add(d, 'local');
  for (const d of input.healthConnect) add(d, 'healthConnect');
  const days = Array.from(bySource.keys()).sort();
  const periods: SourcedPeriod[] = groupBleedingDays(days).map((p) => {
    const sources = new Set<CycleSource>();
    for (let d = p.start; d <= p.end; d = addDays(d, 1)) bySource.get(d)?.forEach((s) => sources.add(s));
    return { ...p, sources: Array.from(sources).sort() as CycleSource[] };
  });
  return { days, periods };
}

export function cycleLengthsFromStarts(starts: DayKey[]): number[] {
  const s = [...starts].sort();
  const out: number[] = [];
  for (let i = 1; i < s.length; i++) out.push(diffDays(s[i - 1], s[i]));
  return out;
}

export function isPlausibleCycle(len: number): boolean {
  return len >= MIN_CYCLE_DAYS && len <= MAX_CYCLE_DAYS;
}

/** Average of the last up-to-6 plausible cycles, or 28 when fewer than 2 are known. */
export function averageCycleLength(lengths: number[]): { value: number; used: number } {
  const recent = lengths.filter(isPlausibleCycle).slice(-MAX_CYCLES_AVERAGED);
  if (recent.length < MIN_CYCLES_FOR_AVERAGE) return { value: DEFAULT_CYCLE_DAYS, used: 0 };
  const avg = recent.reduce((a, b) => a + b, 0) / recent.length;
  return { value: Math.round(avg), used: recent.length };
}

export function phaseForDay(
  cycleDay: number,
  cycleLength: number,
  periodLength: number
): CyclePhase {
  const ovulationDay = Math.max(periodLength + 1, cycleLength - LUTEAL_DAYS);
  const windowStart = Math.max(periodLength + 1, ovulationDay - 3);
  const windowEnd = ovulationDay + 1;
  if (cycleDay <= periodLength) return 'menstrual';
  if (cycleDay < windowStart) return 'follicular';
  if (cycleDay <= windowEnd) return 'ovulation';
  return 'luteal';
}

export interface CycleInput {
  /** Bleeding days from MenstruationPeriod intervals and MenstruationFlow records. */
  bleedingDays: Iterable<DayKey>;
  today: DayKey;
}

export function computeCycleStatus({ bleedingDays, today }: CycleInput): CycleStatus {
  // Ignore anything logged in the future.
  const days = Array.from(bleedingDays).filter((d) => d <= today);
  const periods = groupBleedingDays(days);
  const starts = periods.map((p) => p.start);
  const lengths = cycleLengthsFromStarts(starts);
  const { value: avgCycle, used } = averageCycleLength(lengths);

  // Exclude the ongoing period (which may still be growing) from the period-length average
  // unless it's the only one we have.
  const finished = periods.length > 1 ? periods.slice(0, -1) : periods;
  const recentPeriods = finished.slice(-MAX_CYCLES_AVERAGED);
  const avgPeriod = recentPeriods.length
    ? Math.round(recentPeriods.reduce((a, p) => a + p.lengthDays, 0) / recentPeriods.length)
    : DEFAULT_PERIOD_DAYS;

  const ovulationDay = Math.max(avgPeriod + 1, avgCycle - LUTEAL_DAYS);
  const ovulationWindow = {
    start: Math.max(avgPeriod + 1, ovulationDay - 3),
    end: ovulationDay + 1,
  };

  const history: CycleHistoryItem[] = periods.map((p, i) => {
    const len = i < lengths.length ? lengths[i] : null;
    return {
      start: p.start,
      cycleLength: len,
      periodLength: p.lengthDays,
      counted: len !== null && isPlausibleCycle(len),
    };
  });

  const base = {
    periods,
    history: history.reverse(),
    averageCycleLength: avgCycle,
    averagePeriodLength: avgPeriod,
    cyclesUsed: used,
    usedDefault: used === 0,
    ovulationDay,
    ovulationWindow,
  };

  if (periods.length === 0) {
    return {
      ...base,
      hasData: false,
      lastPeriodStart: null,
      cycleDay: null,
      phase: null,
      nextPeriodStart: null,
      daysUntilNextPeriod: null,
      daysLate: 0,
      predictedDays: [],
      predictedFertileDays: [],
    };
  }

  const last = periods[periods.length - 1];
  const cycleDay = diffDays(last.start, today) + 1;
  // While a period is ongoing, use its logged length so far if it is longer than average.
  const ongoingLen = diffDays(last.start, last.end) + 1;
  const currentPeriodLen = Math.max(avgPeriod, ongoingLen);
  const inLoggedPeriod = today <= last.end;
  const phase: CyclePhase =
    inLoggedPeriod || cycleDay <= currentPeriodLen
      ? 'menstrual'
      : phaseForDay(Math.min(cycleDay, avgCycle), avgCycle, currentPeriodLen);

  const nextStart = addDays(last.start, avgCycle);
  const daysUntil = diffDays(today, nextStart);
  const daysLate = daysUntil < 0 ? -daysUntil : 0;

  // If late, project predictions from today so the calendar still shows something useful.
  const firstPredicted = daysLate > 0 ? today : nextStart;
  const predictedDays: DayKey[] = [];
  for (let c = 0; c < 2; c++) {
    const s = addDays(firstPredicted, c * avgCycle);
    for (let d = 0; d < avgPeriod; d++) predictedDays.push(addDays(s, d));
  }
  const predictedFertileDays: DayKey[] = [];
  for (let d = ovulationWindow.start; d <= ovulationWindow.end; d++) {
    const day = addDays(last.start, d - 1);
    if (day > today) predictedFertileDays.push(day);
    const nextCycleDay = addDays(firstPredicted, d - 1);
    predictedFertileDays.push(nextCycleDay);
  }

  return {
    ...base,
    hasData: true,
    lastPeriodStart: last.start,
    cycleDay,
    phase,
    nextPeriodStart: nextStart,
    daysUntilNextPeriod: daysUntil,
    daysLate,
    predictedDays,
    predictedFertileDays: Array.from(new Set(predictedFertileDays)).sort(),
  };
}
