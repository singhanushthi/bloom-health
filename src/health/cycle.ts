/**
 * Cycle data → bleeding days → cycle status.
 *
 * Primary source: periods and daily flow logged in Bloom (SQLite). Optional extra:
 * Health Connect MenstruationPeriod / MenstruationFlow (e.g. from Flo). Both are merged and
 * de-duplicated by overlapping/adjacent dates (see mergeBleedingSources).
 *
 * Note: react-native-health-connect's TypeScript types declare MenstruationPeriod as an
 * instantaneous record (`time`), but the native bridge actually returns `startTime` /
 * `endTime` (it is an interval record in Health Connect). We handle both shapes.
 */
import { mockCycle, MOCK_SOURCES } from '../data/mock';
import { bleedingDaysFromDayLogs, dayLogs, periods as periodRepo } from '../db/repos';
import {
  computeCycleStatus,
  expandPeriodLog,
  mergeBleedingSources,
  type CycleStatus,
  type SourcedPeriod,
} from './cyclePrediction';
import { addDays, dayStart, daysInInterval, toDayKey, todayKey, type DayKey } from './dates';
import { empty, failed, hcCan, ok, type ReadContext } from './context';
import { originOf, readAll } from './read';
import { LOCAL_SOURCE, type MetricResult } from './types';

/** How far back to read period history (needs READ_HEALTH_DATA_HISTORY beyond ~30 days). */
export const CYCLE_LOOKBACK_DAYS = 240;

interface PeriodLike {
  startTime?: string;
  endTime?: string;
  time?: string;
}

export function periodRecordDays(r: PeriodLike): DayKey[] {
  if (r.startTime && r.endTime) return daysInInterval(r.startTime, r.endTime);
  const t = r.startTime ?? r.time;
  return t ? [toDayKey(t)] : [];
}

/** MenstruationFlow values: 0 UNKNOWN, 1 LIGHT, 2 MEDIUM, 3 HEAVY — any record = a bleeding day. */
export async function readBleedingDays(
  ctx: ReadContext
): Promise<{ days: DayKey[]; sources: string[]; partialHistory: boolean }> {
  const now = ctx.now ?? new Date();
  const start = dayStart(addDays(todayKey(now), -CYCLE_LOOKBACK_DAYS));
  const days: DayKey[] = [];
  const sources: string[] = [];
  let partialHistory = false;

  const readType = async (type: 'MenstruationPeriod' | 'MenstruationFlow') => {
    if (!ctx.granted.has(type)) return;
    try {
      const recs = await readAll(type, start, now);
      for (const r of recs) {
        days.push(...periodRecordDays(r as unknown as PeriodLike));
        const o = originOf(r);
        if (o) sources.push(o);
      }
    } catch (e) {
      // Without the history permission, reads older than 30 days before the first grant
      // can fail on some Health Connect versions. Retry with a 30-day window.
      partialHistory = true;
      const recent = dayStart(addDays(todayKey(now), -29));
      const recs = await readAll(type, recent, now);
      for (const r of recs) {
        days.push(...periodRecordDays(r as unknown as PeriodLike));
        const o = originOf(r);
        if (o) sources.push(o);
      }
    }
  };

  await readType('MenstruationPeriod');
  await readType('MenstruationFlow');
  return { days, sources, partialHistory };
}

export interface CycleResult extends CycleStatus {
  partialHistory: boolean;
  /** Periods with the sources that contributed to each (for the calendar/history). */
  sourcedPeriods: SourcedPeriod[];
  /** Days that have a day log in Bloom (symptoms/mood/notes), for calendar markers. */
  loggedDays: DayKey[];
}

/** Bleeding days recorded in Bloom: period logs (expanded) + day logs with flow. */
export async function readLocalBleedingDays(today: DayKey): Promise<{ days: DayKey[]; loggedDays: DayKey[] }> {
  const [logs, dls] = await Promise.all([periodRepo.list(), dayLogs.list()]);
  const days = logs.flatMap((l) => expandPeriodLog(l, today));
  days.push(...bleedingDaysFromDayLogs(dls));
  return { days, loggedDays: dls.map((d) => d.day) };
}

export async function getCycleStatus(ctx: ReadContext): Promise<MetricResult<CycleResult>> {
  const now = ctx.now ?? new Date();
  const today = todayKey(now);
  if (ctx.mode === 'demo') {
    const days = mockCycle(now).bleedingDays;
    const merged = mergeBleedingSources({ local: [], healthConnect: days });
    const status = computeCycleStatus({ bleedingDays: merged.days, today });
    return ok(
      { ...status, partialHistory: false, sourcedPeriods: merged.periods, loggedDays: [] },
      MOCK_SOURCES.MenstruationPeriod
    );
  }
  try {
    const local = await readLocalBleedingDays(today);
    let hcDays: DayKey[] = [];
    let hcSources: string[] = [];
    let partialHistory = false;
    if (hcCan(ctx, 'MenstruationPeriod', 'MenstruationFlow')) {
      try {
        const r = await readBleedingDays(ctx);
        hcDays = r.days;
        hcSources = r.sources;
        partialHistory = r.partialHistory;
      } catch {
        // Health Connect failed — local logs still work.
      }
    }
    const merged = mergeBleedingSources({ local: local.days, healthConnect: hcDays });
    const status = computeCycleStatus({ bleedingDays: merged.days, today });
    const sources = [...(local.days.length ? [LOCAL_SOURCE.log] : []), ...hcSources];
    const result: CycleResult = {
      ...status,
      partialHistory,
      sourcedPeriods: merged.periods,
      loggedDays: local.loggedDays,
    };
    if (!status.hasData) return { status: 'empty', data: result, sources };
    return ok(result, sources);
  } catch (e) {
    return failed(e);
  }
}
