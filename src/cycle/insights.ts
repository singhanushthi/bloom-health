/**
 * Cycle insights (pure, tested in __tests__/cycleInsights.test.ts).
 *
 *  - Cycle-length bars (last 12 completed cycles) with the average.
 *  - Symptom patterns from ≥2 cycles of logs, e.g. "Cramps usually on days 1–2" or
 *    "Headaches often 2 days before your period".
 *  - Mood by phase and "what you usually log in this phase" (used to personalise tips).
 */
import type { DayLog } from '../db/repos';
import {
  DEFAULT_PERIOD_DAYS,
  phaseDetailForDay,
  type CycleHistoryItem,
  type PeriodSpan,
  type PhaseDetail,
} from '../health/cyclePrediction';
import { diffDays, type DayKey } from '../health/dates';
import type { DayExtras } from './store';

/* --------------------------------- Labels -------------------------------- */

/** Things a pattern can be about: day-log symptoms plus a few extras. */
export const PATTERN_LABEL: Record<string, { one: string; many: string }> = {
  cramps: { one: 'cramps', many: 'Cramps' },
  headache: { one: 'a headache', many: 'Headaches' },
  bloating: { one: 'bloating', many: 'Bloating' },
  acne: { one: 'acne', many: 'Acne' },
  tender_breasts: { one: 'tender breasts', many: 'Tender breasts' },
  fatigue: { one: 'tiredness', many: 'Tiredness' },
  back_pain: { one: 'back pain', many: 'Back pain' },
  pain_strong: { one: 'strong pain', many: 'Moderate or strong pain' },
  craving_sweet: { one: 'sweet cravings', many: 'Sweet cravings' },
  craving_salty: { one: 'salty cravings', many: 'Salty cravings' },
  craving_chocolate: { one: 'chocolate cravings', many: 'Chocolate cravings' },
  low_energy: { one: 'low energy', many: 'Low energy' },
  poor_sleep: { one: 'poor sleep', many: 'Poor sleep' },
};

export const MOOD_LABEL: Record<string, string> = {
  calm: 'Calm',
  happy: 'Happy',
  energetic: 'Energetic',
  irritable: 'Irritable',
  anxious: 'Anxious',
  low: 'Low',
};

/** Everything "symptom-like" logged on a day (day-log symptoms + extras). */
export function itemsForDay(log: DayLog | undefined, extra: DayExtras | undefined): string[] {
  const out = new Set<string>(log?.symptoms ?? []);
  if (extra) {
    if (extra.pain !== null && extra.pain >= 2) out.add('pain_strong');
    for (const c of extra.cravings) if (`craving_${c}` in PATTERN_LABEL) out.add(`craving_${c}`);
    if (extra.energy === 'low') out.add('low_energy');
    if (extra.sleepQuality === 'poor') out.add('poor_sleep');
  }
  return Array.from(out);
}

/* ----------------------------- Cycle lengths ----------------------------- */

export interface CycleBar {
  start: DayKey;
  length: number;
  counted: boolean;
}

/** Last `n` completed cycles, oldest first. `history` is CycleStatus.history (newest first). */
export function cycleBars(history: CycleHistoryItem[], n = 12): CycleBar[] {
  return history
    .filter((h) => h.cycleLength !== null)
    .slice(0, n)
    .reverse()
    .map((h) => ({ start: h.start, length: h.cycleLength as number, counted: h.counted }));
}

export function barsSummary(bars: CycleBar[], avg: number): string {
  if (!bars.length) return 'No completed cycles yet.';
  const ls = bars.map((b) => b.length);
  const min = Math.min(...ls);
  const max = Math.max(...ls);
  return `Cycle lengths for your last ${bars.length} ${bars.length === 1 ? 'cycle' : 'cycles'}: ${ls.join(', ')} days. Shortest ${min}, longest ${max}, average ${avg} days.`;
}

/* ------------------------------ Day → cycle ------------------------------ */

interface CycleSpan {
  start: DayKey;
  /** Start of the next period, or null for the current cycle. */
  next: DayKey | null;
  length: number;
  periodLength: number;
}

function spans(periods: PeriodSpan[], fallbackLength: number): CycleSpan[] {
  return periods.map((p, i) => {
    const next = periods[i + 1]?.start ?? null;
    return {
      start: p.start,
      next,
      length: next ? diffDays(p.start, next) : fallbackLength,
      periodLength: p.lengthDays || DEFAULT_PERIOD_DAYS,
    };
  });
}

function locate(day: DayKey, cs: CycleSpan[]): { span: CycleSpan; index: number; cycleDay: number } | null {
  for (let i = cs.length - 1; i >= 0; i--) {
    if (day >= cs[i].start) {
      const cycleDay = diffDays(cs[i].start, day) + 1;
      if (cs[i].next && day >= cs[i].next!) return null;
      if (!cs[i].next && cycleDay > 60) return null;
      return { span: cs[i], index: i, cycleDay };
    }
  }
  return null;
}

/* -------------------------------- Patterns ------------------------------- */

export interface SymptomPattern {
  id: string;
  anchor: 'start' | 'before';
  /** Cycle days (anchor start) or days before the period (anchor before), inclusive. */
  from: number;
  to: number;
  /** Cycles where it happened in this window / cycles with any log. */
  cycles: number;
  outOf: number;
  strength: 'usually' | 'often';
  text: string;
}

export interface PatternInput {
  periods: PeriodSpan[];
  dayLogs: DayLog[];
  extras: DayExtras[];
  /** Used for the current cycle's length (not used for "before" patterns). */
  averageCycleLength: number;
}

const MAX_START_DAY = 10;
const MAX_BEFORE_DAY = 10;
export const MIN_PATTERN_CYCLES = 2;

function rangeText(from: number, to: number) {
  return from === to ? `${from}` : `${from}–${to}`;
}

/**
 * Find, for each symptom, the 1–2-day window (from period start, or before the next period)
 * where it shows up in the most cycles. A pattern needs ≥2 cycles and at least half of the
 * cycles you logged in. "usually" = ≥75% of those cycles, otherwise "often".
 */
export function detectSymptomPatterns(input: PatternInput): SymptomPattern[] {
  const cs = spans(input.periods, input.averageCycleLength);
  const logBy = new Map(input.dayLogs.map((l) => [l.day, l]));
  const exBy = new Map(input.extras.map((e) => [e.day, e]));
  const days = Array.from(new Set([...logBy.keys(), ...exBy.keys()])).sort();

  // symptom -> anchor -> offset -> set of cycle indexes
  const hits = new Map<string, { start: Map<number, Set<number>>; before: Map<number, Set<number>> }>();
  const loggedCycles = new Set<number>();
  for (const day of days) {
    const loc = locate(day, cs);
    if (!loc) continue;
    const items = itemsForDay(logBy.get(day), exBy.get(day));
    const anyLog =
      items.length > 0 || (logBy.get(day)?.moods.length ?? 0) > 0 || !!logBy.get(day)?.note || exBy.has(day);
    if (anyLog) loggedCycles.add(loc.index);
    for (const id of items) {
      if (!(id in PATTERN_LABEL)) continue;
      const h = hits.get(id) ?? { start: new Map(), before: new Map() };
      hits.set(id, h);
      if (loc.cycleDay <= MAX_START_DAY) {
        const s = h.start.get(loc.cycleDay) ?? new Set<number>();
        s.add(loc.index);
        h.start.set(loc.cycleDay, s);
      }
      if (loc.span.next) {
        const before = diffDays(day, loc.span.next);
        if (before >= 1 && before <= MAX_BEFORE_DAY) {
          const s = h.before.get(before) ?? new Set<number>();
          s.add(loc.index);
          h.before.set(before, s);
        }
      }
    }
  }
  const outOf = loggedCycles.size;
  if (outOf < MIN_PATTERN_CYCLES) return [];

  const best = (m: Map<number, Set<number>>, max: number) => {
    let top: { from: number; to: number; n: number } | null = null;
    for (let d = 1; d <= max; d++) {
      const one = m.get(d)?.size ?? 0;
      const two = new Set([...(m.get(d) ?? []), ...(m.get(d + 1) ?? [])]).size;
      // Prefer the single day when it explains as many cycles as the pair.
      const cand = one >= two ? { from: d, to: d, n: one } : { from: d, to: d + 1, n: two };
      if (!top || cand.n > top.n || (cand.n === top.n && cand.to - cand.from < top.to - top.from)) top = cand;
    }
    return top;
  };

  const out: SymptomPattern[] = [];
  for (const [id, h] of hits) {
    const s = best(h.start, MAX_START_DAY);
    const b = best(h.before, MAX_BEFORE_DAY);
    // Prefer period-start anchoring for early-cycle symptoms; otherwise the better-supported one.
    let pick: { anchor: 'start' | 'before'; w: { from: number; to: number; n: number } } | null = null;
    if (s && (!b || s.n > b.n || (s.n === b.n && s.from <= 3))) pick = { anchor: 'start', w: s };
    else if (b) pick = { anchor: 'before', w: b };
    if (!pick) continue;
    const n = pick.w.n;
    if (n < MIN_PATTERN_CYCLES || n * 2 < outOf) continue;
    const strength = n * 4 >= outOf * 3 ? 'usually' : 'often';
    const label = PATTERN_LABEL[id].many;
    const text =
      pick.anchor === 'start'
        ? `${label} ${strength} on ${pick.w.from === pick.w.to ? 'day' : 'days'} ${rangeText(pick.w.from, pick.w.to)} of your period`
        : `${label} ${strength} ${rangeText(pick.w.from, pick.w.to)} ${pick.w.to === 1 ? 'day' : 'days'} before your period`;
    out.push({ id, anchor: pick.anchor, from: pick.w.from, to: pick.w.to, cycles: n, outOf, strength, text });
  }
  return out.sort((a, b) => b.cycles - a.cycles || a.id.localeCompare(b.id));
}

/* ----------------------------- Phase summaries ---------------------------- */

const PHASES: PhaseDetail[] = ['menstrual', 'follicular', 'ovulation', 'luteal', 'pms'];

export interface PhaseCount {
  id: string;
  /** Distinct cycles it was logged in during this phase. */
  cycles: number;
  days: number;
}

export interface PhaseSummaries {
  moods: Record<PhaseDetail, PhaseCount[]>;
  symptoms: Record<PhaseDetail, PhaseCount[]>;
}

/** Moods and symptoms per phase (each sorted by cycles, then days). */
export function summariseByPhase(input: PatternInput): PhaseSummaries {
  const cs = spans(input.periods, input.averageCycleLength);
  const logBy = new Map(input.dayLogs.map((l) => [l.day, l]));
  const exBy = new Map(input.extras.map((e) => [e.day, e]));
  const days = Array.from(new Set([...logBy.keys(), ...exBy.keys()])).sort();
  type Acc = Map<string, { cycles: Set<number>; days: number }>;
  const mk = () => Object.fromEntries(PHASES.map((p) => [p, new Map()])) as Record<PhaseDetail, Acc>;
  const moods = mk();
  const symptoms = mk();
  const add = (acc: Acc, id: string, cycle: number) => {
    const v = acc.get(id) ?? { cycles: new Set<number>(), days: 0 };
    v.cycles.add(cycle);
    v.days += 1;
    acc.set(id, v);
  };
  for (const day of days) {
    const loc = locate(day, cs);
    if (!loc) continue;
    const phase = phaseDetailForDay(Math.min(loc.cycleDay, loc.span.length), loc.span.length, loc.span.periodLength);
    for (const m of logBy.get(day)?.moods ?? []) add(moods[phase], m, loc.index);
    for (const s of itemsForDay(logBy.get(day), exBy.get(day))) add(symptoms[phase], s, loc.index);
  }
  const fin = (acc: Acc): PhaseCount[] =>
    Array.from(acc.entries())
      .map(([id, v]) => ({ id, cycles: v.cycles.size, days: v.days }))
      .sort((a, b) => b.cycles - a.cycles || b.days - a.days || a.id.localeCompare(b.id));
  return {
    moods: Object.fromEntries(PHASES.map((p) => [p, fin(moods[p])])) as Record<PhaseDetail, PhaseCount[]>,
    symptoms: Object.fromEntries(PHASES.map((p) => [p, fin(symptoms[p])])) as Record<PhaseDetail, PhaseCount[]>,
  };
}

/** Symptoms you logged in this phase in at least 2 cycles (most frequent first). */
export function frequentInPhase(s: PhaseSummaries, phase: PhaseDetail, minCycles = MIN_PATTERN_CYCLES): string[] {
  return s.symptoms[phase].filter((x) => x.cycles >= minCycles).map((x) => x.id);
}

/** "Mostly calm and happy" style sentence for a phase, or null without enough logs. */
export function moodSentence(s: PhaseSummaries, phase: PhaseDetail): string | null {
  const top = s.moods[phase].filter((x) => x.cycles >= 1).slice(0, 2);
  if (!top.length || top[0].days < 2) return null;
  const words = top.map((t) => (MOOD_LABEL[t.id] ?? t.id).toLowerCase());
  return `Mostly ${words.join(' and ')}`;
}
