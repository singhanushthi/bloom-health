import { addDays } from '../src/health/dates';
import { computeCycleStatus, groupBleedingDays } from '../src/health/cyclePrediction';
import type { DayLog } from '../src/db/repos';
import {
  barsSummary,
  cycleBars,
  detectSymptomPatterns,
  frequentInPhase,
  moodSentence,
  summariseByPhase,
} from '../src/cycle/insights';
import { mockCycleLogs } from '../src/cycle/mock';
import { emptyExtras, type DayExtras } from '../src/cycle/store';
import { mockCycle } from '../src/data/mock';

const period = (start: string, len = 5) => Array.from({ length: len }, (_, i) => addDays(start, i));
const starts = ['2026-01-01', '2026-01-29', '2026-02-26', '2026-03-26'];
const periods = groupBleedingDays(starts.flatMap((s) => period(s)));
const log = (day: string, symptoms: string[] = [], moods: string[] = []): DayLog => ({ day, flow: null, symptoms, moods, note: null });

describe('symptom patterns', () => {
  it('finds "Cramps usually on days 1–2" and "Headaches often 2 days before"', () => {
    const logs: DayLog[] = [];
    starts.forEach((s, i) => {
      logs.push(log(s, ['cramps']), log(addDays(s, 1), ['cramps']));
      const next = starts[i + 1];
      if (next && i !== 1) logs.push(log(addDays(next, -2), ['headache']));
    });
    const out = detectSymptomPatterns({ periods, dayLogs: logs, extras: [], averageCycleLength: 28 });
    const cramps = out.find((p) => p.id === 'cramps')!;
    expect(cramps).toMatchObject({ anchor: 'start', from: 1, to: 2, strength: 'usually' });
    expect(cramps.text).toBe('Cramps usually on days 1–2 of your period');
    const head = out.find((p) => p.id === 'headache')!;
    expect(head).toMatchObject({ anchor: 'before', from: 2, to: 2, cycles: 2 });
    expect(head.text).toBe('Headaches often 2 days before your period');
  });

  it('needs at least 2 cycles of logs', () => {
    const logs = [log('2026-01-01', ['cramps']), log('2026-01-02', ['cramps'])];
    expect(detectSymptomPatterns({ periods, dayLogs: logs, extras: [], averageCycleLength: 28 })).toEqual([]);
  });

  it('ignores one-off symptoms', () => {
    const logs = [log('2026-01-01', ['cramps', 'acne']), log('2026-01-29', ['cramps']), log('2026-02-26', ['cramps'])];
    const ids = detectSymptomPatterns({ periods, dayLogs: logs, extras: [], averageCycleLength: 28 }).map((p) => p.id);
    expect(ids).toContain('cramps');
    expect(ids).not.toContain('acne');
  });

  it('uses extras: strong pain and cravings', () => {
    const extras: DayExtras[] = starts.slice(0, 3).flatMap((s) => [
      { ...emptyExtras(s), pain: 3 },
      { ...emptyExtras(addDays(s, -3)), cravings: ['sweet'] },
    ]);
    const out = detectSymptomPatterns({ periods, dayLogs: [], extras, averageCycleLength: 28 });
    expect(out.find((p) => p.id === 'pain_strong')).toMatchObject({ anchor: 'start', from: 1, to: 1 });
    expect(out.find((p) => p.id === 'craving_sweet')).toMatchObject({ anchor: 'before', from: 3, to: 3 });
  });
});

describe('phase summaries', () => {
  it('mood by phase and frequent symptoms per phase', () => {
    const logs: DayLog[] = [];
    starts.forEach((s, i) => {
      logs.push(log(s, ['cramps'], ['low']), log(addDays(s, 1), [], ['low']));
      logs.push(log(addDays(s, 8), [], ['energetic', 'happy']));
      const next = starts[i + 1];
      if (next) logs.push(log(addDays(next, -2), ['bloating'], ['irritable']));
    });
    const s = summariseByPhase({ periods, dayLogs: logs, extras: [], averageCycleLength: 28 });
    expect(moodSentence(s, 'menstrual')).toBe('Mostly low');
    expect(moodSentence(s, 'follicular')).toBe('Mostly energetic and happy');
    expect(moodSentence(s, 'pms')).toBe('Mostly irritable');
    expect(moodSentence(s, 'ovulation')).toBeNull();
    expect(frequentInPhase(s, 'menstrual')).toEqual(['cramps']);
    expect(frequentInPhase(s, 'pms')).toEqual(['bloating']);
  });
});

describe('cycle-length bars', () => {
  it('last 12 completed cycles, oldest first, with a spoken summary', () => {
    const many = Array.from({ length: 15 }, (_, i) => addDays('2025-01-01', i * 30));
    const status = computeCycleStatus({ bleedingDays: many.flatMap((s) => period(s)), today: addDays(many[14], 3) });
    const bars = cycleBars(status.history, 12);
    expect(bars).toHaveLength(12);
    expect(bars[0].start < bars[11].start).toBe(true);
    expect(bars.every((b) => b.length === 30)).toBe(true);
    expect(barsSummary(bars, 30)).toMatch(/last 12 cycles: 30, 30/);
    expect(barsSummary([], 28)).toBe('No completed cycles yet.');
  });
});

describe('demo data', () => {
  it('produces patterns and phase moods for insights', () => {
    const now = new Date('2026-10-24T10:00:00');
    const { dayLogs, extras } = mockCycleLogs(now);
    const ps = groupBleedingDays(mockCycle(now).bleedingDays);
    const out = detectSymptomPatterns({ periods: ps, dayLogs, extras, averageCycleLength: 29 });
    expect(out.find((p) => p.id === 'cramps')?.anchor).toBe('start');
    expect(out.find((p) => p.id === 'headache')?.anchor).toBe('before');
    expect(out.find((p) => p.id === 'bloating')).toBeTruthy();
  });
});
