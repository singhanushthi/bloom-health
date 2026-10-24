/**
 * Heart rate: Health Connect (if connected) merged with readings logged in Bloom.
 *  - Resting HR comes only from Health Connect (a watch); Bloom never guesses it.
 *  - Today's min/max, sparkline and "latest" include both sources.
 * Uses aggregateRecord for Health Connect min/max (de-duplicated across writers).
 */
import { mockHeartToday, MOCK_SOURCES } from '../data/mock';
import { vitals } from '../db/repos';
import { addDays, dayStart, todayKey } from './dates';
import { ensureInitialized, hc } from './client';
import { empty, failed, hcCan, ok, type ReadContext } from './context';
import { between, originOf, readAll } from './read';
import { LOCAL_SOURCE, type HeartToday, type MetricResult } from './types';

export async function getHeartToday(ctx: ReadContext): Promise<MetricResult<HeartToday>> {
  const now = ctx.now ?? new Date();
  if (ctx.mode === 'demo') return ok(mockHeartToday(now), MOCK_SOURCES.HeartRate);

  const today = todayKey(now);
  const start = dayStart(today);
  try {
    const sources: string[] = [];
    let restingBpm: number | null = null;
    let minBpm: number | null = null;
    let maxBpm: number | null = null;
    const sums = Array(24).fill(0);
    const counts = Array(24).fill(0);
    let latest: HeartToday['latest'] = null;
    const consider = (bpm: number, time: string) => {
      const h = new Date(time).getHours();
      sums[h] += bpm;
      counts[h] += 1;
      minBpm = minBpm === null ? bpm : Math.min(minBpm, bpm);
      maxBpm = maxBpm === null ? bpm : Math.max(maxBpm, bpm);
      if (!latest || time > latest.time) latest = { bpm: Math.round(bpm), time };
    };

    // Local readings
    const logged = await vitals.listBetween('hr', start, now);
    for (const v of logged) consider(v.value, v.time);
    for (const v of logged) {
      const src = v.source || LOCAL_SOURCE.log;
      if (!sources.includes(src)) sources.push(src);
    }

    // Health Connect (optional)
    const m = hc();
    if (hcCan(ctx, 'HeartRate', 'RestingHeartRate') && m && (await ensureInitialized())) {
      if (ctx.granted.has('RestingHeartRate')) {
        try {
          const rhr = await readAll('RestingHeartRate', dayStart(addDays(today, -2)), now, {
            ascending: false,
            pageSize: 20,
            maxPages: 1,
          });
          if (rhr.length) {
            restingBpm = Math.round(rhr[0].beatsPerMinute);
            sources.push(...rhr.map(originOf).filter((x): x is string => !!x));
          }
        } catch {
          // keep going with what we have
        }
      }
      if (ctx.granted.has('HeartRate')) {
        try {
          const agg = await m.aggregateRecord({ recordType: 'HeartRate', timeRangeFilter: between(start, now) });
          if (agg.MEASUREMENTS_COUNT > 0) {
            minBpm = minBpm === null ? agg.BPM_MIN : Math.min(minBpm, agg.BPM_MIN);
            maxBpm = maxBpm === null ? agg.BPM_MAX : Math.max(maxBpm, agg.BPM_MAX);
            sources.push(...agg.dataOrigins);
          }
          const records = await readAll('HeartRate', start, now, { pageSize: 500, maxPages: 6 });
          for (const r of records) for (const s of r.samples) consider(s.beatsPerMinute, s.time);
        } catch {
          // ignore HC failure; local data still shows
        }
      }
    }

    if (restingBpm === null && minBpm === null) return empty(sources);
    const hourly = sums.map((s, h) => (counts[h] ? Math.round(s / counts[h]) : null));
    return ok(
      {
        restingBpm,
        minBpm: minBpm === null ? null : Math.round(minBpm),
        maxBpm: maxBpm === null ? null : Math.round(maxBpm),
        hourly,
        latest,
      },
      sources
    );
  } catch (e) {
    return failed(e);
  }
}
