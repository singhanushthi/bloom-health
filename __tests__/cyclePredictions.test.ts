import { addDays } from '../src/health/dates';
import {
  computeCycleStatus,
  confidenceFor,
  ovulationDayFor,
  phaseDetailForDay,
  predictCycles,
  type CycleSettingsInput,
} from '../src/health/cyclePrediction';
import { buildCycleResult } from '../src/health/cycle';
import { DEFAULT_CYCLE_SETTINGS } from '../src/cycle/store';

const period = (start: string, len = 5) => Array.from({ length: len }, (_, i) => addDays(start, i));
const regular: CycleSettingsInput = { cycleLength: 28, periodLength: 5, irregular: false };

/** Periods with the given cycle lengths, starting at `first`. */
function history(first: string, lengths: number[], len = 5): { days: string[]; lastStart: string } {
  let s = first;
  const days = [...period(s, len)];
  for (const l of lengths) {
    s = addDays(s, l);
    days.push(...period(s, len));
  }
  return { days, lastStart: s };
}

describe('ovulation, fertile and PMS windows', () => {
  it('ovulation = cycle length − 14, clamped inside the cycle', () => {
    expect(ovulationDayFor(28, 5)).toBe(14);
    expect(ovulationDayFor(35, 5)).toBe(21);
    expect(ovulationDayFor(18, 5)).toBe(6); // 4 → clamped after the period
    expect(ovulationDayFor(16, 7)).toBe(8);
  });

  it('regular 28-day cycle: next 3 periods, fertile −5…+1 around ovulation, PMS −5…−1', () => {
    const { days, lastStart } = history('2026-01-01', [28, 28, 28]);
    const status = computeCycleStatus({ bleedingDays: days, today: addDays(lastStart, 3) });
    const p = predictCycles(status, addDays(lastStart, 3), regular);
    expect(p.upcoming).toHaveLength(3);
    expect(p.upcoming.map((u) => u.start)).toEqual([addDays(lastStart, 28), addDays(lastStart, 56), addDays(lastStart, 84)]);
    const u = p.upcoming[0];
    expect(u.earliest).toBe(u.start);
    expect(u.latest).toBe(u.start);
    expect(u.ovulation).toBe(addDays(lastStart, 13)); // cycle day 14
    expect(u.fertileStart).toBe(addDays(lastStart, 8)); // day 9
    expect(u.fertileEnd).toBe(addDays(lastStart, 14)); // day 15
    expect(u.pmsStart).toBe(addDays(u.start, -5));
    expect(u.pmsEnd).toBe(addDays(u.start, -1));
    expect(p.calendar.ovulation).toContain(u.ovulation);
    expect(p.calendar.fertile).toHaveLength(7 * 3);
    expect(p.calendar.pms).toContain(addDays(u.start, -1));
    expect(p.calendar.predicted.slice(0, 5)).toEqual(period(u.start));
    expect(p.irregular).toBe(false);
    expect(p.range).toBeNull();
  });

  it('phaseDetail splits the last 5 days of the cycle as PMS', () => {
    expect(phaseDetailForDay(20, 28, 5)).toBe('luteal');
    expect(phaseDetailForDay(24, 28, 5)).toBe('pms');
    expect(phaseDetailForDay(28, 28, 5)).toBe('pms');
    expect(phaseDetailForDay(2, 28, 5)).toBe('menstrual');
    const { days, lastStart } = history('2026-01-01', [28, 28]);
    const today = addDays(lastStart, 25);
    const p = predictCycles(computeCycleStatus({ bleedingDays: days, today }), today, regular);
    expect(p.phaseDetail).toBe('pms');
  });
});

describe('irregular cycles', () => {
  it('shows a range from the shortest to the longest of the last 6 cycles', () => {
    const { days, lastStart } = history('2025-10-01', [26, 34, 29, 31, 25, 33]);
    const today = addDays(lastStart, 4);
    const status = computeCycleStatus({ bleedingDays: days, today });
    const p = predictCycles(status, today, { ...regular, irregular: true });
    expect(p.irregular).toBe(true);
    expect(p.irregularSource).toBe('setting');
    expect(p.range).toEqual({ min: 25, max: 34 });
    expect(p.upcoming[0].earliest).toBe(addDays(lastStart, 25));
    expect(p.upcoming[0].latest).toBe(addDays(lastStart, 34));
    expect(p.upcoming[0].ovulationEarliest < p.upcoming[0].ovulationLatest).toBe(true);
    expect(p.calendar.possible.length).toBeGreaterThan(0);
    expect(p.calendar.possible.some((d) => p.calendar.predicted.includes(d))).toBe(false);
  });

  it('detects irregular cycles automatically when they vary by 8+ days', () => {
    const { days, lastStart } = history('2025-10-01', [24, 36, 28]);
    const today = addDays(lastStart, 2);
    const p = predictCycles(computeCycleStatus({ bleedingDays: days, today }), today, regular);
    expect(p.irregular).toBe(true);
    expect(p.irregularSource).toBe('detected');
  });

  it('uses typical length ±3 days as the range with too few cycles', () => {
    const today = '2026-03-05';
    const s = computeCycleStatus({ bleedingDays: period('2026-03-01'), today, defaults: { cycleLength: 30 } });
    const p = predictCycles(s, today, { cycleLength: 30, periodLength: 5, irregular: true });
    expect(p.range).toEqual({ min: 27, max: 33 });
    expect(p.upcoming[0].start).toBe('2026-03-31');
  });
});

describe('few cycles and settings defaults', () => {
  it('uses the typical cycle length from settings until 2 cycles are logged', () => {
    const today = '2026-05-10';
    const s = computeCycleStatus({ bleedingDays: period('2026-05-01'), today, defaults: { cycleLength: 32, periodLength: 6 } });
    expect(s.averageCycleLength).toBe(32);
    expect(s.nextPeriodStart).toBe('2026-06-02');
    const p = predictCycles(s, today, { cycleLength: 32, periodLength: 6, irregular: false });
    expect(p.confidence).toBe('low');
    expect(p.cyclesUsed).toBe(0);
    expect(p.upcoming[0].start).toBe('2026-06-02');
  });

  it('uses the typical period length for a single, still-going period', () => {
    const r = buildCycleResult(period('2026-05-01', 2), '2026-05-02', { ...DEFAULT_CYCLE_SETTINGS, typicalPeriodLength: 6 });
    expect(r.averagePeriodLength).toBe(6);
    expect(r.predictions.upcoming[0].end).toBe(addDays(r.predictions.upcoming[0].start, 5));
  });

  it('returns no predictions without data', () => {
    const s = computeCycleStatus({ bleedingDays: [], today: '2026-05-01' });
    const p = predictCycles(s, '2026-05-01', regular);
    expect(p.upcoming).toEqual([]);
    expect(p.showLateBanner).toBe(false);
    expect(p.phaseDetail).toBeNull();
  });
});

describe('confidence', () => {
  it('Low <3 cycles, Medium 3–5, High ≥6 with SD ≤3', () => {
    expect(confidenceFor(0, null)).toBe('low');
    expect(confidenceFor(2, 1)).toBe('low');
    expect(confidenceFor(3, 0)).toBe('medium');
    expect(confidenceFor(5, 0.5)).toBe('medium');
    expect(confidenceFor(6, 2.9)).toBe('high');
    expect(confidenceFor(6, 3.5)).toBe('medium');
  });

  it('is computed from the logged history', () => {
    const steady = history('2025-09-01', [28, 29, 28, 27, 28, 29]);
    const today = addDays(steady.lastStart, 3);
    expect(predictCycles(computeCycleStatus({ bleedingDays: steady.days, today }), today, regular).confidence).toBe('high');
    const varied = history('2025-09-01', [22, 34, 23, 33, 24, 30]);
    const today2 = addDays(varied.lastStart, 3);
    const p = predictCycles(computeCycleStatus({ bleedingDays: varied.days, today: today2 }), today2, regular);
    expect(p.confidence).toBe('medium');
    expect(p.sd!).toBeGreaterThan(3);
  });
});

describe('late detection', () => {
  const { days, lastStart } = history('2026-01-01', [28, 28, 28]);
  const expected = addDays(lastStart, 28);

  it('no banner up to 3 days late', () => {
    const today = addDays(expected, 3);
    const p = predictCycles(computeCycleStatus({ bleedingDays: days, today }), today, regular);
    expect(p.daysLate).toBe(3);
    expect(p.showLateBanner).toBe(false);
  });

  it('banner when more than 3 days late, predictions projected from today', () => {
    const today = addDays(expected, 5);
    const p = predictCycles(computeCycleStatus({ bleedingDays: days, today }), today, regular);
    expect(p.expectedStart).toBe(expected);
    expect(p.daysLate).toBe(5);
    expect(p.showLateBanner).toBe(true);
    expect(p.upcoming[0].start).toBe(today);
    expect(p.upcoming[1].start).toBe(addDays(today, 28));
    expect(p.phaseDetail).toBe('pms');
    // The projected cycle's fertile days would be in the past — not shown.
    expect(p.calendar.fertile.every((d) => d > today)).toBe(true);
  });

  it('irregular: lateness counts from the latest expected start', () => {
    const v = history('2025-10-01', [26, 32, 27, 31]);
    const today = addDays(v.lastStart, 36);
    const p = predictCycles(computeCycleStatus({ bleedingDays: v.days, today }), today, { ...regular, irregular: true });
    expect(p.expectedStart).toBe(addDays(v.lastStart, 32));
    expect(p.daysLate).toBe(4);
    expect(p.showLateBanner).toBe(true);
  });

  it('logging the period clears it', () => {
    const today = addDays(expected, 6);
    const withNew = [...days, ...period(addDays(expected, 5), 2)];
    const p = predictCycles(computeCycleStatus({ bleedingDays: withNew, today }), today, regular);
    expect(p.daysLate).toBe(0);
    expect(p.showLateBanner).toBe(false);
  });
});
