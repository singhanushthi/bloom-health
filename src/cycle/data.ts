/**
 * One reader for the Cycle tab, insights and the Today card: cycle status + predictions,
 * day logs (+ extras), symptom patterns and per-phase summaries, diet and yoga level.
 */
import { dayLogs as dayLogRepo, type DayLog } from '../db/repos';
import type { ReadContext } from '../health/context';
import { getCycleStatus, withCycleDefaults, type FullCycleResult } from '../health/cycle';
import { todayKey } from '../health/dates';
import type { MetricResult } from '../health/types';
import type { YogaLevel } from '../content/yoga';
import type { DietPref } from '../plan/profile';
import { loadProfile } from '../plan/store';
import { loadPrefs } from '../yoga/store';
import { detectSymptomPatterns, summariseByPhase, type PhaseSummaries, type SymptomPattern } from './insights';
import { mockCycleLogs } from './mock';
import { dayExtras, type DayExtras } from './store';

export interface CycleOverview {
  cycle: FullCycleResult;
  dayLogs: DayLog[];
  extras: DayExtras[];
  patterns: SymptomPattern[];
  byPhase: PhaseSummaries;
  diet: DietPref | null;
  yogaLevel: YogaLevel | null;
}

export async function getCycleOverview(ctx: ReadContext): Promise<MetricResult<CycleOverview>> {
  const now = ctx.now ?? new Date();
  const today = todayKey(now);
  const res = await getCycleStatus(ctx);
  if (!res.data) return { ...res, data: null };
  const cycle = withCycleDefaults(res.data, today);
  let logs: DayLog[] = [];
  let extras: DayExtras[] = [];
  let diet: DietPref | null = null;
  let yogaLevel: YogaLevel | null = null;
  if (ctx.mode === 'demo') {
    const m = mockCycleLogs(now);
    logs = m.dayLogs;
    extras = m.extras;
  } else {
    [logs, extras] = await Promise.all([dayLogRepo.list().catch(() => []), dayExtras.list().catch(() => [])]);
  }
  try {
    diet = (await loadProfile())?.diet ?? null;
  } catch {
    diet = null;
  }
  try {
    yogaLevel = (await loadPrefs()).level;
  } catch {
    yogaLevel = null;
  }
  const input = { periods: cycle.periods, dayLogs: logs, extras, averageCycleLength: cycle.averageCycleLength };
  return {
    ...res,
    data: {
      cycle,
      dayLogs: logs,
      extras,
      patterns: detectSymptomPatterns(input),
      byPhase: summariseByPhase(input),
      diet,
      yogaLevel,
    },
  };
}
