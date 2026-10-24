/**
 * Demo-mode day logs for the cycle module (insights and suggestions).
 * Deterministic and aligned with mockCycle() so patterns look realistic:
 *  - cramps on days 1–2 (most cycles), fatigue on day 1
 *  - headaches ~2 days before the period (4 of 7 cycles), bloating in the last 3 days
 *  - energetic/happy mid-cycle, irritable/low before the period
 */
import { mockCycle } from '../data/mock';
import type { DayLog } from '../db/repos';
import { groupBleedingDays } from '../health/cyclePrediction';
import { addDays, todayKey, type DayKey } from '../health/dates';
import type { DayExtras } from './store';

export function mockCycleLogs(now = new Date()): { dayLogs: DayLog[]; extras: DayExtras[] } {
  const today = todayKey(now);
  const starts = groupBleedingDays(mockCycle(now).bleedingDays).map((p) => p.start);
  const logs = new Map<DayKey, DayLog>();
  const extras = new Map<DayKey, DayExtras>();
  const log = (day: DayKey, patch: { symptoms?: string[]; moods?: string[] }) => {
    if (day > today) return;
    const cur = logs.get(day) ?? { day, flow: null, symptoms: [], moods: [], note: null };
    cur.symptoms = Array.from(new Set([...cur.symptoms, ...(patch.symptoms ?? [])]));
    cur.moods = Array.from(new Set([...cur.moods, ...(patch.moods ?? [])]));
    logs.set(day, cur);
  };
  const extra = (day: DayKey, patch: Partial<DayExtras>) => {
    if (day > today) return;
    const cur: DayExtras = extras.get(day) ?? {
      day,
      discharge: null,
      sexDrive: null,
      energy: null,
      sleepQuality: null,
      cravings: [],
      pain: null,
      meds: [],
    };
    extras.set(day, { ...cur, ...patch });
  };

  starts.forEach((s, i) => {
    if (i % 4 !== 3) log(s, { symptoms: ['cramps', 'fatigue'], moods: ['low'] });
    else log(s, { symptoms: ['fatigue'], moods: ['calm'] });
    if (i % 4 !== 3) log(addDays(s, 1), { symptoms: ['cramps'], moods: ['calm'] });
    extra(s, { pain: i % 4 === 3 ? 1 : 2, energy: 'low', meds: i % 2 ? ['Meftal Spas'] : [] });
    extra(addDays(s, 1), { pain: 1, energy: 'low' });
    log(addDays(s, 8), { moods: ['energetic', 'happy'] });
    extra(addDays(s, 8), { energy: 'high', discharge: 'creamy' });
    log(addDays(s, 13), { moods: ['happy'] });
    extra(addDays(s, 13), { discharge: 'egg_white', sexDrive: 'high', energy: 'high' });
    const next = starts[i + 1];
    if (next) {
      if (i % 2 === 0 || i === 1) log(addDays(next, -2), { symptoms: ['headache'], moods: ['irritable'] });
      log(addDays(next, -3), { symptoms: ['bloating'], moods: ['irritable'] });
      log(addDays(next, -1), { symptoms: ['bloating', 'tender_breasts'], moods: ['low'] });
      extra(addDays(next, -3), { cravings: ['sweet', 'chocolate'], sleepQuality: 'poor' });
    }
  });

  const sort = <T extends { day: DayKey }>(m: Map<DayKey, T>) => Array.from(m.values()).sort((a, b) => (a.day < b.day ? -1 : 1));
  return { dayLogs: sort(logs), extras: sort(extras) };
}
