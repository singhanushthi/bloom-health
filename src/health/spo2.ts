/**
 * Latest blood-oxygen reading in the last 7 days — whichever is newer: a reading logged
 * in Bloom or a Health Connect record (if connected).
 */
import { mockSpo2Latest, MOCK_SOURCES } from '../data/mock';
import { vitals } from '../db/repos';
import { addDays, dayStart, todayKey } from './dates';
import { empty, failed, hcCan, ok, type ReadContext } from './context';
import { originOf, readAll } from './read';
import { LOCAL_SOURCE, type MetricResult, type Spo2Latest } from './types';

export async function getLatestSpo2(ctx: ReadContext): Promise<MetricResult<Spo2Latest>> {
  const now = ctx.now ?? new Date();
  if (ctx.mode === 'demo') return ok(mockSpo2Latest(now), MOCK_SOURCES.OxygenSaturation);
  try {
    const since = dayStart(addDays(todayKey(now), -6));
    let best: { percent: number; time: string; origin: string } | null = null;
    const local = await vitals.latest('spo2');
    if (local && new Date(local.time) >= since)
      best = { percent: Math.round(local.value), time: local.time, origin: local.source || LOCAL_SOURCE.log };

    if (hcCan(ctx, 'OxygenSaturation')) {
      try {
        const recs = await readAll('OxygenSaturation', since, now, { ascending: false, pageSize: 1, maxPages: 1 });
        const r = recs[0];
        if (r && (!best || r.time > best.time))
          best = { percent: Math.round(r.percentage), time: r.time, origin: originOf(r) ?? '' };
      } catch {
        // fall back to local
      }
    }
    if (!best) return empty();
    return ok({ percent: best.percent, time: best.time }, best.origin ? [best.origin] : []);
  } catch (e) {
    return failed(e);
  }
}
