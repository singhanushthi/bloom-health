/**
 * 7/30-day trends from merged sources.
 *  - Steps per day: manual value > Health Connect daily aggregate (aggregateGroupByPeriod,
 *    de-duplicated across writers) > Bloom's foreground sensor count.
 *  - Sleep: Bloom logs + Health Connect sessions, merged per wake-up day (no double count).
 *  - Heart: Health Connect resting HR when available; otherwise the daily mean of HR
 *    readings logged in Bloom (labelled differently in the UI).
 */
import { mockTrendDays, MOCK_SOURCES } from '../data/mock';
import { stepDays, vitals } from '../db/repos';
import { addDays, dayStart, lastNDays, toDayKey, todayKey } from './dates';
import { ensureInitialized, hc } from './client';
import { failed, hcCan, ok, uniq, type ReadContext } from './context';
import { between, originOf, readAll } from './read';
import { mergeNights, readNights } from './sleep';
import { LOCAL_SOURCE, type DailyValue, type MetricResult, type Trends } from './types';

export type TrendRange = 7 | 30;

export async function getTrends(ctx: ReadContext, range: TrendRange): Promise<MetricResult<Trends>> {
  const now = ctx.now ?? new Date();
  if (ctx.mode === 'demo') {
    return ok(mockTrendDays(range, now), [...(MOCK_SOURCES.Steps ?? []), ...(MOCK_SOURCES.SleepSession ?? [])]);
  }

  const today = todayKey(now);
  const days = lastNDays(range, today);
  const start = dayStart(days[0]);
  const sources: string[] = [];
  const stepSrc: string[] = [];
  const sleepSrc: string[] = [];
  const heartSrc: string[] = [];

  try {
    /* ---- Steps ---- */
    const local = new Map((await stepDays.list(days[0], today)).map((s) => [s.day, s]));
    const hcByDay = new Map<string, number>();
    const m = hc();
    if (hcCan(ctx, 'Steps') && m && (await ensureInitialized())) {
      try {
        const buckets = await m.aggregateGroupByPeriod({
          recordType: 'Steps',
          timeRangeFilter: between(start, now),
          timeRangeSlicer: { period: 'DAYS', length: 1 },
        });
        for (const b of buckets) {
          // Period buckets are local-date-times without zone, e.g. "2026-10-20T00:00".
          const v = Math.round(b.result.COUNT_TOTAL);
          if (v > 0) {
            hcByDay.set(b.startTime.slice(0, 10), v);
            stepSrc.push(...b.result.dataOrigins);
          }
        }
      } catch {
        // fall through to local data
      }
    }
    let usedManual = false;
    let usedSensor = false;
    const steps: DailyValue[] = days.map((day) => {
      const l = local.get(day);
      if (l?.manualSteps != null) {
        usedManual = true;
        return { day, value: l.manualSteps };
      }
      if (hcByDay.has(day)) return { day, value: hcByDay.get(day)! };
      if (l && l.sensorSteps > 0) {
        usedSensor = true;
        return { day, value: l.sensorSteps };
      }
      return { day, value: null }; // no data ≠ zero
    });
    if (usedManual) stepSrc.push(LOCAL_SOURCE.manual);
    if (usedSensor) stepSrc.push(LOCAL_SOURCE.sensor);

    /* ---- Sleep (wake-up day attribution) ---- */
    const sStart = dayStart(addDays(days[0], -1));
    sStart.setHours(12);
    const { nights } = await readNights(ctx, sStart, now);
    sleepSrc.push(...nights.map((n) => n.source).filter((x): x is string => !!x));
    const merged = mergeNights(nights);
    const sleepMin: DailyValue[] = days.map((day) => ({ day, value: merged.get(day)?.asleepMin ?? null }));

    /* ---- Heart ---- */
    let restingHr: DailyValue[] = days.map((day) => ({ day, value: null }));
    let hrKind: Trends['hrKind'] = 'resting';
    const mean = (recs: { day: string; v: number }[]) => {
      const acc = new Map<string, { s: number; n: number }>();
      for (const r of recs) {
        const a = acc.get(r.day) ?? { s: 0, n: 0 };
        a.s += r.v;
        a.n += 1;
        acc.set(r.day, a);
      }
      return days.map((day) => {
        const a = acc.get(day);
        return { day, value: a ? Math.round(a.s / a.n) : null };
      });
    };
    let gotResting = false;
    if (hcCan(ctx, 'RestingHeartRate')) {
      try {
        const recs = await readAll('RestingHeartRate', start, now);
        if (recs.length) {
          gotResting = true;
          heartSrc.push(...recs.map(originOf).filter((x): x is string => !!x));
          restingHr = mean(recs.map((r) => ({ day: toDayKey(r.time), v: r.beatsPerMinute })));
        }
      } catch {
        // ignore
      }
    }
    if (!gotResting) {
      const logged = await vitals.listBetween('hr', start, now);
      if (logged.length) {
        hrKind = 'readings';
        heartSrc.push(...uniq(logged.map((v) => v.source || LOCAL_SOURCE.log)));
        restingHr = mean(logged.map((v) => ({ day: toDayKey(v.time), v: v.value })));
      }
    }

    sources.push(...stepSrc, ...sleepSrc, ...heartSrc);
    return ok(
      {
        steps,
        sleepMin,
        restingHr,
        hrKind,
        sourcesBy: { steps: uniq(stepSrc), sleep: uniq(sleepSrc), heart: uniq(heartSrc) },
      },
      sources
    );
  } catch (e) {
    return failed(e);
  }
}
