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

/** Average of the last up-to-6 plausible cycles, or `fallback` (28) when fewer than 2 are known. */
export function averageCycleLength(lengths: number[], fallback = DEFAULT_CYCLE_DAYS): { value: number; used: number } {
  const recent = lengths.filter(isPlausibleCycle).slice(-MAX_CYCLES_AVERAGED);
  if (recent.length < MIN_CYCLES_FOR_AVERAGE) return { value: fallback, used: 0 };
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
  /**
   * The user's typical lengths from cycle settings. Used instead of 28 / 5 until enough
   * history is logged (cycle: fewer than 2 cycles; period: only one, possibly ongoing, period).
   */
  defaults?: { cycleLength?: number; periodLength?: number };
}

export function computeCycleStatus({ bleedingDays, today, defaults }: CycleInput): CycleStatus {
  // Ignore anything logged in the future.
  const days = Array.from(bleedingDays).filter((d) => d <= today);
  const periods = groupBleedingDays(days);
  const starts = periods.map((p) => p.start);
  const lengths = cycleLengthsFromStarts(starts);
  const { value: avgCycle, used } = averageCycleLength(lengths, defaults?.cycleLength ?? DEFAULT_CYCLE_DAYS);

  // Exclude the ongoing period (which may still be growing) from the period-length average
  // unless it's the only one we have.
  const finished = periods.length > 1 ? periods.slice(0, -1) : periods;
  const recentPeriods = finished.slice(-MAX_CYCLES_AVERAGED);
  const onlyPeriodMayBeOngoing =
    periods.length === 1 && diffDays(periods[0].end, today) <= 1 && defaults?.periodLength !== undefined;
  const avgPeriod = onlyPeriodMayBeOngoing
    ? Math.max(defaults!.periodLength!, periods[0].lengthDays)
    : recentPeriods.length
      ? Math.round(recentPeriods.reduce((a, p) => a + p.lengthDays, 0) / recentPeriods.length)
      : (defaults?.periodLength ?? DEFAULT_PERIOD_DAYS);

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

/* ------------------------- Predictions (v2, Flo-free) ------------------------ */
/*
 * Built on top of CycleStatus. Pure and tested (__tests__/cyclePredictions.test.ts).
 *  - Next 3 periods. Regular: a single start day each. Irregular (setting, or detected when
 *    the last cycles differ by 8+ days): a start *range* from the shortest to the longest of
 *    the last 6 cycles.
 *  - Ovulation = cycle length − 14 (clamped inside the cycle); fertile window = ovulation −5…+1;
 *    PMS window = the 5 days before the period (−5…−1).
 *  - Confidence: Low (<3 cycles), Medium (3–5, or 6+ that vary a lot), High (6+ cycles, SD ≤ 3).
 *  - Late: more than LATE_BANNER_DAYS after the expected start (latest start when irregular)
 *    with no period logged.
 */

export type CycleConfidence = 'low' | 'medium' | 'high';
export const CONFIDENCE_LABEL: Record<CycleConfidence, string> = {
  low: 'Low confidence',
  medium: 'Medium confidence',
  high: 'High confidence',
};

/** Phase with the late-luteal (PMS) days split out — used for suggestions and insights. */
export type PhaseDetail = CyclePhase | 'pms';
export const PHASE_DETAIL_LABEL: Record<PhaseDetail, string> = {
  menstrual: 'Period',
  follicular: 'Follicular',
  ovulation: 'Ovulation window',
  luteal: 'Luteal',
  pms: 'Before your period',
};

export const PREDICTED_CYCLES = 3;
export const FERTILE_BEFORE_OVULATION = 5;
export const FERTILE_AFTER_OVULATION = 1;
export const PMS_DAYS = 5;
export const LATE_BANNER_DAYS = 3;
export const IRREGULAR_SPREAD_DAYS = 8;
export const HIGH_CONFIDENCE_MAX_SD = 3;

export interface PredictedCycle {
  /** 1 = the next period. */
  index: number;
  /** Most likely start (average cycle). */
  start: DayKey;
  /** Inclusive last predicted bleeding day. */
  end: DayKey;
  /** Start range; equals `start` when cycles are regular. */
  earliest: DayKey;
  latest: DayKey;
  /** Estimated ovulation before this period (and its range when irregular). */
  ovulation: DayKey;
  ovulationEarliest: DayKey;
  ovulationLatest: DayKey;
  fertileStart: DayKey;
  fertileEnd: DayKey;
  pmsStart: DayKey;
  pmsEnd: DayKey;
}

export interface CycleSettingsInput {
  cycleLength: number;
  periodLength: number;
  irregular: boolean;
}

export interface CyclePredictions {
  cycleLength: number;
  periodLength: number;
  /** Plausible cycle lengths used (newest last, up to 6). */
  recentLengths: number[];
  cyclesUsed: number;
  sd: number | null;
  confidence: CycleConfidence;
  irregular: boolean;
  irregularSource: 'setting' | 'detected' | null;
  /** Shortest–longest of the recent cycles (or ±3 days of the typical length when unknown). */
  range: { min: number; max: number } | null;
  upcoming: PredictedCycle[];
  /** Expected start the late check is measured from. */
  expectedStart: DayKey | null;
  daysLate: number;
  showLateBanner: boolean;
  phaseDetail: PhaseDetail | null;
  calendar: {
    predicted: DayKey[];
    /** Days inside an irregular start range that aren't the most likely period days. */
    possible: DayKey[];
    fertile: DayKey[];
    ovulation: DayKey[];
    pms: DayKey[];
  };
}

export function ovulationDayFor(cycleLength: number, periodLength: number): number {
  const lo = Math.min(periodLength + 1, cycleLength - 1);
  return Math.min(cycleLength - 1, Math.max(lo, cycleLength - LUTEAL_DAYS));
}

/** Late-luteal (PMS) days are the last PMS_DAYS days of a cycle. */
export function phaseDetailForDay(cycleDay: number, cycleLength: number, periodLength: number): PhaseDetail {
  const base = phaseForDay(cycleDay, cycleLength, periodLength);
  if (base === 'luteal' && cycleLength - cycleDay + 1 <= PMS_DAYS) return 'pms';
  return base;
}

export function standardDeviation(xs: number[]): number | null {
  if (xs.length < 2) return null;
  const m = xs.reduce((a, b) => a + b, 0) / xs.length;
  return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / xs.length);
}

export function confidenceFor(cyclesUsed: number, sd: number | null): CycleConfidence {
  if (cyclesUsed < 3) return 'low';
  if (cyclesUsed < MAX_CYCLES_AVERAGED) return 'medium';
  return sd !== null && sd <= HIGH_CONFIDENCE_MAX_SD ? 'high' : 'medium';
}

function daysBetween(a: DayKey, b: DayKey): DayKey[] {
  const out: DayKey[] = [];
  for (let d = a; d <= b; d = addDays(d, 1)) out.push(d);
  return out;
}

export function predictCycles(
  status: CycleStatus,
  today: DayKey,
  settings: CycleSettingsInput,
  count = PREDICTED_CYCLES
): CyclePredictions {
  // history is newest first; the current cycle has cycleLength null.
  const recentLengths = status.history
    .filter((h) => h.counted && h.cycleLength !== null)
    .slice(0, MAX_CYCLES_AVERAGED)
    .map((h) => h.cycleLength as number)
    .reverse();
  const cyclesUsed = recentLengths.length;
  const L = cyclesUsed >= MIN_CYCLES_FOR_AVERAGE ? status.averageCycleLength : settings.cycleLength;
  const P = status.hasData ? status.averagePeriodLength : settings.periodLength;
  const sd = standardDeviation(recentLengths);
  const confidence = confidenceFor(cyclesUsed, sd);
  const spread = cyclesUsed >= 2 ? Math.max(...recentLengths) - Math.min(...recentLengths) : 0;
  const detected = cyclesUsed >= 3 && spread >= IRREGULAR_SPREAD_DAYS;
  const irregular = settings.irregular || detected;
  const irregularSource = settings.irregular ? 'setting' : detected ? 'detected' : null;
  const range = irregular
    ? cyclesUsed >= 2
      ? { min: Math.min(...recentLengths), max: Math.max(...recentLengths) }
      : { min: L - 3, max: L + 3 }
    : null;

  const empty: CyclePredictions = {
    cycleLength: L,
    periodLength: P,
    recentLengths,
    cyclesUsed,
    sd,
    confidence,
    irregular,
    irregularSource,
    range,
    upcoming: [],
    expectedStart: null,
    daysLate: 0,
    showLateBanner: false,
    phaseDetail: null,
    calendar: { predicted: [], possible: [], fertile: [], ovulation: [], pms: [] },
  };
  if (!status.hasData || !status.lastPeriodStart) return empty;

  const S = status.lastPeriodStart;
  const lastEnd = status.periods[status.periods.length - 1]?.end ?? S;
  const minLen = range?.min ?? L;
  const maxLen = range?.max ?? L;
  const expectedStart = addDays(S, irregular ? maxLen : L);
  const daysLate = Math.max(0, diffDays(expectedStart, today));
  // Once the most likely day has passed with no period logged, project from today.
  const late = diffDays(addDays(S, L), today) > 0;
  const ovOffset = L - ovulationDayFor(L, P); // days from ovulation to the next period

  const upcoming: PredictedCycle[] = [];
  for (let k = 1; k <= count; k++) {
    const start = late ? addDays(today, (k - 1) * L) : addDays(S, k * L);
    let earliest = start;
    let latest = start;
    if (range) {
      earliest = late ? addDays(today, (k - 1) * minLen) : addDays(S, k * minLen);
      latest = late ? addDays(today, (k - 1) * maxLen) : addDays(S, k * maxLen);
      if (earliest > start) earliest = start;
      if (latest < start) latest = start;
    }
    const ovulation = addDays(start, -ovOffset);
    const ovulationEarliest = addDays(earliest, -ovOffset);
    const ovulationLatest = addDays(latest, -ovOffset);
    upcoming.push({
      index: k,
      start,
      end: addDays(start, P - 1),
      earliest,
      latest,
      ovulation,
      ovulationEarliest,
      ovulationLatest,
      fertileStart: addDays(ovulationEarliest, -FERTILE_BEFORE_OVULATION),
      fertileEnd: addDays(ovulationLatest, FERTILE_AFTER_OVULATION),
      pmsStart: addDays(earliest, -PMS_DAYS),
      pmsEnd: addDays(earliest, -1),
    });
  }

  const after = (d: DayKey) => d > lastEnd;
  const predicted = new Set<DayKey>();
  const possible = new Set<DayKey>();
  const fertile = new Set<DayKey>();
  const ovulation = new Set<DayKey>();
  const pms = new Set<DayKey>();
  for (const u of upcoming) {
    daysBetween(u.start, u.end).forEach((d) => predicted.add(d));
    if (u.earliest !== u.latest) daysBetween(u.earliest, addDays(u.latest, P - 1)).forEach((d) => possible.add(d));
    // When late, the projected cycle's ovulation and PMS days would be in the past — skip them.
    if (!(late && u.index === 1)) {
      daysBetween(u.fertileStart, u.fertileEnd).filter(after).forEach((d) => fertile.add(d));
      daysBetween(u.ovulationEarliest, u.ovulationLatest).filter(after).forEach((d) => ovulation.add(d));
      daysBetween(u.pmsStart, u.pmsEnd).filter(after).forEach((d) => pms.add(d));
    }
  }
  predicted.forEach((d) => possible.delete(d));
  const sorted = (s: Set<DayKey>) => Array.from(s).sort();

  let phaseDetail: PhaseDetail | null = status.phase;
  if (status.phase === 'luteal') {
    const next = upcoming[0];
    if (late || diffDays(today, next.earliest) <= PMS_DAYS) phaseDetail = 'pms';
  }

  return {
    ...empty,
    upcoming,
    expectedStart,
    daysLate,
    showLateBanner: daysLate > LATE_BANNER_DAYS,
    phaseDetail,
    calendar: {
      predicted: sorted(predicted),
      possible: sorted(possible),
      fertile: sorted(fertile),
      ovulation: sorted(ovulation),
      pms: sorted(pms),
    },
  };
}
