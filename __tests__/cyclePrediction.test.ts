import { addDays } from '../src/health/dates';
import {
  averageCycleLength,
  computeCycleStatus,
  cycleLengthsFromStarts,
  groupBleedingDays,
  phaseForDay,
  DEFAULT_CYCLE_DAYS,
} from '../src/health/cyclePrediction';

const period = (start: string, len = 5) =>
  Array.from({ length: len }, (_, i) => addDays(start, i));

describe('groupBleedingDays', () => {
  it('merges consecutive days and tolerates a single-day gap', () => {
    const spans = groupBleedingDays([
      '2026-01-01',
      '2026-01-02',
      '2026-01-04', // 1-day gap -> same period
      '2026-01-20', // new period
    ]);
    expect(spans).toEqual([
      { start: '2026-01-01', end: '2026-01-04', lengthDays: 4 },
      { start: '2026-01-20', end: '2026-01-20', lengthDays: 1 },
    ]);
  });

  it('deduplicates days logged by both MenstruationPeriod and MenstruationFlow', () => {
    expect(groupBleedingDays(['2026-02-01', '2026-02-01', '2026-02-02'])).toHaveLength(1);
  });
});

describe('averageCycleLength', () => {
  it('defaults to 28 with fewer than 2 cycles', () => {
    expect(averageCycleLength([])).toEqual({ value: DEFAULT_CYCLE_DAYS, used: 0 });
    expect(averageCycleLength([31])).toEqual({ value: DEFAULT_CYCLE_DAYS, used: 0 });
  });

  it('averages only the last 6 plausible cycles', () => {
    // first two (40, 40) fall outside the last-6 window; 90 is implausible (missed logging)
    const lengths = [40, 40, 30, 30, 90, 30, 30, 30, 30];
    expect(averageCycleLength(lengths)).toEqual({ value: 30, used: 6 });
  });

  it('rounds the mean', () => {
    expect(averageCycleLength([29, 30]).value).toBe(30); // 29.5 -> 30
    expect(averageCycleLength([27, 28, 28]).value).toBe(28);
  });
});

describe('cycleLengthsFromStarts', () => {
  it('computes gaps between sorted starts', () => {
    expect(cycleLengthsFromStarts(['2026-03-01', '2026-01-01', '2026-01-29'])).toEqual([28, 31]);
  });
});

describe('phaseForDay (28-day cycle, 5-day period)', () => {
  it.each([
    [1, 'menstrual'],
    [5, 'menstrual'],
    [6, 'follicular'],
    [10, 'follicular'],
    [11, 'ovulation'], // window = day 11..15 (ovulation day 14)
    [14, 'ovulation'],
    [15, 'ovulation'],
    [16, 'luteal'],
    [28, 'luteal'],
  ])('day %i -> %s', (day, phase) => {
    expect(phaseForDay(day, 28, 5)).toBe(phase);
  });
});

describe('computeCycleStatus', () => {
  it('reports no data when nothing is logged', () => {
    const s = computeCycleStatus({ bleedingDays: [], today: '2026-05-01' });
    expect(s.hasData).toBe(false);
    expect(s.cycleDay).toBeNull();
    expect(s.averageCycleLength).toBe(28);
    expect(s.usedDefault).toBe(true);
  });

  it('uses the default 28 days with a single logged period', () => {
    const s = computeCycleStatus({ bleedingDays: period('2026-05-01'), today: '2026-05-10' });
    expect(s.cycleDay).toBe(10);
    expect(s.phase).toBe('follicular');
    expect(s.nextPeriodStart).toBe('2026-05-29');
    expect(s.daysUntilNextPeriod).toBe(19);
    expect(s.usedDefault).toBe(true);
  });

  it('predicts from the average of recent cycles', () => {
    const days = [
      ...period('2026-01-01'),
      ...period('2026-01-31'), // 30
      ...period('2026-03-02'), // 30
      ...period('2026-04-01'), // 30
    ];
    const s = computeCycleStatus({ bleedingDays: days, today: '2026-04-20' });
    expect(s.averageCycleLength).toBe(30);
    expect(s.cyclesUsed).toBe(3);
    expect(s.cycleDay).toBe(20);
    expect(s.phase).toBe('luteal'); // ovulation ~day 16, window 13..17
    expect(s.nextPeriodStart).toBe('2026-05-01');
    expect(s.daysUntilNextPeriod).toBe(11);
    expect(s.predictedDays.slice(0, 5)).toEqual(period('2026-05-01'));
    expect(s.history[0]).toMatchObject({ start: '2026-04-01', cycleLength: null });
    expect(s.history[1]).toMatchObject({ start: '2026-03-02', cycleLength: 30, counted: true });
  });

  it('is menstrual during a logged period and reports lateness', () => {
    const days = [...period('2026-01-01'), ...period('2026-01-29'), ...period('2026-02-26')];
    const during = computeCycleStatus({ bleedingDays: days, today: '2026-02-28' });
    expect(during.phase).toBe('menstrual');
    expect(during.cycleDay).toBe(3);

    const late = computeCycleStatus({ bleedingDays: days, today: '2026-03-29' });
    expect(late.nextPeriodStart).toBe('2026-03-26');
    expect(late.daysLate).toBe(3);
    expect(late.daysUntilNextPeriod).toBe(-3);
    expect(late.phase).toBe('luteal');
  });

  it('ignores future-dated entries', () => {
    const s = computeCycleStatus({
      bleedingDays: [...period('2026-01-01'), '2026-12-01'],
      today: '2026-01-10',
    });
    expect(s.periods).toHaveLength(1);
  });
});

describe('merging local logs with Health Connect', () => {
  const {
    mergeBleedingSources,
    expandPeriodLog,
  } = require('../src/health/cyclePrediction') as typeof import('../src/health/cyclePrediction');

  it('expands an open-ended log to the default 5 days, capped at today', () => {
    expect(expandPeriodLog({ startDay: '2026-03-01', endDay: null }, '2026-03-20')).toEqual(period('2026-03-01'));
    expect(expandPeriodLog({ startDay: '2026-03-01', endDay: null }, '2026-03-02')).toEqual([
      '2026-03-01',
      '2026-03-02',
    ]);
    expect(expandPeriodLog({ startDay: '2026-03-01', endDay: '2026-03-03' }, '2026-03-20')).toHaveLength(3);
  });

  it('de-duplicates the same period logged in Bloom and in Flo', () => {
    const { periods, days } = mergeBleedingSources({
      local: period('2026-01-01', 5),
      healthConnect: period('2026-01-02', 5), // overlaps, shifted by one day
    });
    expect(periods).toHaveLength(1);
    expect(periods[0]).toMatchObject({ start: '2026-01-01', end: '2026-01-06', sources: ['healthConnect', 'local'] });
    expect(days).toHaveLength(6);
  });

  it('keeps separate periods from different sources and tracks where each came from', () => {
    const { periods } = mergeBleedingSources({
      local: period('2026-02-01'),
      healthConnect: [...period('2026-01-03'), ...period('2026-03-02')],
    });
    expect(periods.map((p) => [p.start, p.sources])).toEqual([
      ['2026-01-03', ['healthConnect']],
      ['2026-02-01', ['local']],
      ['2026-03-02', ['healthConnect']],
    ]);
  });

  it('predicts from the merged history', () => {
    const { days } = mergeBleedingSources({
      local: [...period('2026-01-01'), ...period('2026-03-02')],
      healthConnect: [...period('2026-01-31'), ...period('2026-03-02')],
    });
    const s = computeCycleStatus({ bleedingDays: days, today: '2026-03-10' });
    expect(s.averageCycleLength).toBe(30);
    expect(s.cyclesUsed).toBe(2);
    expect(s.nextPeriodStart).toBe('2026-04-01');
  });

  it('works with only local logs (no Health Connect)', () => {
    const { days } = mergeBleedingSources({ local: period('2026-05-01'), healthConnect: [] });
    const s = computeCycleStatus({ bleedingDays: days, today: '2026-05-03' });
    expect(s.phase).toBe('menstrual');
    expect(s.cycleDay).toBe(3);
  });
});
