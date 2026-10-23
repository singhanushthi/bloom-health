/**
 * Sleep: Bloom's own sleep logs merged with Health Connect sessions (if connected).
 *
 * Health Connect SleepStageType: 0 UNKNOWN, 1 AWAKE, 2 SLEEPING, 3 OUT_OF_BED,
 * 4 LIGHT, 5 DEEP, 6 REM. Stages are shown only when a source wrote them; Bloom's own
 * logs never have stages, so those show duration only.
 */
import type { RecordResult } from 'react-native-health-connect';
import { mockSleepForDay, MOCK_SOURCES } from '../data/mock';
import { sleepLogs, type SleepLog } from '../db/repos';
import { addDays, dayStart, toDayKey, todayKey, type DayKey } from './dates';
import { empty, failed, hcCan, ok, type ReadContext } from './context';
import { originOf, readAll } from './read';
import { LOCAL_SOURCE, type MetricResult, type SleepNight, type SleepStageKind } from './types';

const STAGE_MAP: Record<number, SleepStageKind | null> = {
  0: 'asleep',
  1: 'awake',
  2: 'asleep',
  3: 'awake',
  4: 'light',
  5: 'deep',
  6: 'rem',
};

const minutes = (a: string, b: string) => (new Date(b).getTime() - new Date(a).getTime()) / 60_000;

export function toSleepNight(s: RecordResult<'SleepSession'>): SleepNight {
  const durationMin = Math.max(0, minutes(s.startTime, s.endTime));
  const stages: Partial<Record<SleepStageKind, number>> = {};
  const hasDetailedStages = (s.stages ?? []).some((st) => [4, 5, 6].includes(st.stage));
  for (const st of s.stages ?? []) {
    const kind = STAGE_MAP[st.stage] ?? 'asleep';
    stages[kind] = (stages[kind] ?? 0) + Math.max(0, minutes(st.startTime, st.endTime));
  }
  const awake = stages.awake ?? 0;
  return {
    day: toDayKey(s.endTime),
    start: s.startTime,
    end: s.endTime,
    durationMin: Math.round(durationMin),
    asleepMin: Math.round(Math.max(0, durationMin - awake)),
    stages: hasDetailedStages ? roundAll(stages) : {},
    hasStages: hasDetailedStages,
    source: originOf(s),
  };
}

export function logToSleepNight(l: SleepLog): SleepNight {
  const d = Math.round(Math.max(0, minutes(l.start, l.end)));
  return {
    day: toDayKey(l.end),
    start: l.start,
    end: l.end,
    durationMin: d,
    asleepMin: d,
    stages: {},
    hasStages: false,
    quality: l.quality,
    source: LOCAL_SOURCE.log,
  };
}

function roundAll<T extends Record<string, number | undefined>>(o: T): T {
  const out = {} as Record<string, number>;
  for (const [k, v] of Object.entries(o)) if (v) out[k] = Math.round(v);
  return out as T;
}

/**
 * Merge nights per wake-up day. Overlapping entries (the same night from two sources —
 * e.g. logged in Bloom and recorded by a watch) are NOT summed: prefer the one with stages,
 * then the longer one, keeping a logged quality rating. Non-overlapping entries on the same
 * day (a nap, split sleep) are added together.
 */
export function mergeNights(nights: SleepNight[]): Map<DayKey, SleepNight> {
  const map = new Map<DayKey, SleepNight>();
  const sorted = [...nights].sort((a, b) => a.start.localeCompare(b.start));
  for (const night of sorted) {
    const prev = map.get(night.day);
    if (!prev) {
      map.set(night.day, night);
      continue;
    }
    const overlaps =
      new Date(night.start) < new Date(prev.end) && new Date(prev.start) < new Date(night.end);
    if (overlaps) {
      const better =
        night.hasStages !== prev.hasStages
          ? night.hasStages
            ? night
            : prev
          : night.durationMin > prev.durationMin
            ? night
            : prev;
      map.set(night.day, { ...better, quality: better.quality ?? prev.quality ?? night.quality ?? null });
    } else {
      const main = night.durationMin > prev.durationMin ? night : prev;
      map.set(night.day, {
        ...main,
        durationMin: prev.durationMin + night.durationMin,
        asleepMin: prev.asleepMin + night.asleepMin,
      });
    }
  }
  return map;
}

/** Back-compat helper used by older callers/tests: Health Connect sessions only. */
export function nightsByDay(sessions: RecordResult<'SleepSession'>[]): Map<DayKey, SleepNight> {
  return mergeNights(sessions.map(toSleepNight));
}

/** All nights (local + Health Connect) whose wake-up falls in [from, to]. */
export async function readNights(
  ctx: ReadContext,
  from: Date,
  to: Date
): Promise<{ nights: SleepNight[]; hcError?: string }> {
  const nights: SleepNight[] = (await sleepLogs.listBetween(from, to)).map(logToSleepNight);
  let hcError: string | undefined;
  if (hcCan(ctx, 'SleepSession')) {
    try {
      const sessions = await readAll('SleepSession', from, to);
      nights.push(...sessions.map(toSleepNight));
    } catch (e) {
      hcError = e instanceof Error ? e.message : String(e);
    }
  }
  return { nights, hcError };
}

export async function getLastNightSleep(ctx: ReadContext): Promise<MetricResult<SleepNight>> {
  const now = ctx.now ?? new Date();
  const today = todayKey(now);
  if (ctx.mode === 'demo') return ok(mockSleepForDay(today), MOCK_SOURCES.SleepSession);
  try {
    // Look back to 18:00 two days ago so a session ending this morning is fully covered.
    const start = dayStart(addDays(today, -2));
    start.setHours(18);
    const { nights } = await readNights(ctx, start, now);
    if (!nights.length) return empty();
    const merged = mergeNights(nights);
    const night = merged.get(today) ?? merged.get(addDays(today, -1));
    if (!night) return empty();
    // Report every source that contributed to this night.
    const contributing = nights
      .filter((n) => n.day === night.day)
      .map((n) => n.source)
      .filter((x): x is string => !!x);
    return ok(night, contributing);
  } catch (e) {
    return failed(e);
  }
}
