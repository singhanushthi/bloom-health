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
import { DEFAULT_CYCLE_SETTINGS, dayExtras, loadCycleSettings, type CycleSettings } from '../cycle/store';
import { mockCycle, MOCK_SOURCES } from '../data/mock';
import { bleedingDaysFromDayLogs, dayLogs, periods as periodRepo, type PeriodLog } from '../db/repos';
import {
  computeCycleStatus,
  expandPeriodLog,
  mergeBleedingSources,
  predictCycles,
  type CyclePredictions,
  type CycleStatus,
  type PhaseDetail,
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
  /** Days that have a day log in Bloom (symptoms/mood/notes/extras), for calendar markers. */
  loggedDays: DayKey[];
  /*
   * The fields below are always filled by getCycleStatus. They are optional only so code that
   * builds a CycleResult by hand (older tests, the AI summary) keeps compiling.
   */
  /** Cycle settings (typical lengths, goal, reminders, privacy). */
  settings?: CycleSettings;
  /** Next 3 periods, fertile/PMS windows, confidence, late check. */
  predictions?: CyclePredictions;
  /** Phase with the PMS days split out (null without data). */
  phaseDetail?: PhaseDetail | null;
  /** Bloom's own period logs (editable), oldest first. Empty in demo mode. */
  periodLogs?: PeriodLog[];
}

/** A CycleResult with every v2 field present. */
export type FullCycleResult = Required<CycleResult>;

/** Fill missing v2 fields (for hand-built results). */
export function withCycleDefaults(r: CycleResult, today: DayKey): FullCycleResult {
  if (r.settings && r.predictions && r.periodLogs && r.phaseDetail !== undefined) return r as FullCycleResult;
  const settings = r.settings ?? DEFAULT_CYCLE_SETTINGS;
  const predictions =
    r.predictions ??
    predictCycles(r, today, {
      cycleLength: settings.typicalCycleLength,
      periodLength: settings.typicalPeriodLength,
      irregular: settings.irregular,
    });
  return { ...r, settings, predictions, phaseDetail: r.phaseDetail ?? predictions.phaseDetail, periodLogs: r.periodLogs ?? [] };
}

/** Status + predictions with the user's settings applied. Pure. */
export function buildCycleResult(
  bleedingDays: DayKey[],
  today: DayKey,
  settings: CycleSettings
): CycleStatus & { predictions: CyclePredictions; phaseDetail: PhaseDetail | null } {
  const status = computeCycleStatus({
    bleedingDays,
    today,
    defaults: { cycleLength: settings.typicalCycleLength, periodLength: settings.typicalPeriodLength },
  });
  const predictions = predictCycles(status, today, {
    cycleLength: settings.typicalCycleLength,
    periodLength: settings.typicalPeriodLength,
    irregular: settings.irregular,
  });
  return { ...status, predictions, phaseDetail: predictions.phaseDetail };
}

/** Bleeding days recorded in Bloom: period logs (expanded) + day logs with flow. */
export async function readLocalBleedingDays(
  today: DayKey
): Promise<{ days: DayKey[]; loggedDays: DayKey[]; periodLogs: PeriodLog[] }> {
  const [logs, dls] = await Promise.all([periodRepo.list(), dayLogs.list()]);
  let extraDays: DayKey[] = [];
  try {
    extraDays = (await dayExtras.list()).map((e) => e.day);
  } catch {
    // extras are optional
  }
  const days = logs.flatMap((l) => expandPeriodLog(l, today));
  days.push(...bleedingDaysFromDayLogs(dls));
  const loggedDays = Array.from(new Set([...dls.map((d) => d.day), ...extraDays])).sort();
  return { days, loggedDays, periodLogs: logs };
}

export async function getCycleStatus(ctx: ReadContext): Promise<MetricResult<CycleResult>> {
  const now = ctx.now ?? new Date();
  const today = todayKey(now);
  if (ctx.mode === 'demo') {
    const days = mockCycle(now).bleedingDays;
    const merged = mergeBleedingSources({ local: [], healthConnect: days });
    const settings: CycleSettings = { ...DEFAULT_CYCLE_SETTINGS, setupDone: true };
    const status = buildCycleResult(merged.days, today, settings);
    return ok(
      { ...status, partialHistory: false, sourcedPeriods: merged.periods, loggedDays: [], settings, periodLogs: [] },
      MOCK_SOURCES.MenstruationPeriod
    );
  }
  try {
    const [local, settings] = await Promise.all([readLocalBleedingDays(today), loadCycleSettings()]);
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
    const status = buildCycleResult(merged.days, today, settings);
    const sources = [...(local.days.length ? [LOCAL_SOURCE.log] : []), ...hcSources];
    const result: CycleResult = {
      ...status,
      partialHistory,
      sourcedPeriods: merged.periods,
      loggedDays: local.loggedDays,
      settings,
      periodLogs: local.periodLogs,
    };
    if (!status.hasData) return { status: 'empty', data: result, sources };
    return ok(result, sources);
  } catch (e) {
    return failed(e);
  }
}
