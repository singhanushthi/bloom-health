/**
 * Weight trend (pure, tested).
 *
 * Only MORNING weights drive the trend: night weights are usually 0.5–1.5 kg higher because of
 * the day's food and water. If there are no morning weights at all, any weights are used.
 * The trend for a day is the mean of the morning weights in the 7 days ending that day.
 */
import { addDays, diffDays, type DayKey } from '../health/dates';

export interface WeightPoint {
  day: DayKey;
  slot: 'morning' | 'night';
  kg: number;
  /** ISO instant; used to pick the earliest morning value of a day. */
  time?: string;
  source?: string;
}

export const TREND_WINDOW = 7;

/** One value per day: the earliest morning weight (or earliest any weight when `anySlot`). */
export function dailyWeights(points: WeightPoint[], anySlot = false): Map<DayKey, number> {
  const out = new Map<DayKey, { kg: number; time: string }>();
  for (const p of points) {
    if (!anySlot && p.slot !== 'morning') continue;
    const t = p.time ?? `${p.day}T00:00:00`;
    const cur = out.get(p.day);
    if (!cur || t < cur.time) out.set(p.day, { kg: p.kg, time: t });
  }
  return new Map(Array.from(out.entries()).map(([d, v]) => [d, v.kg]));
}

/** True when the trend is built from mornings; false when it falls back to any weight. */
export function usesMornings(points: WeightPoint[]): boolean {
  return points.some((p) => p.slot === 'morning');
}

/** Moving-average trend for each requested day (null when no weights in the window). */
export function trendSeries(points: WeightPoint[], days: DayKey[], window = TREND_WINDOW): (number | null)[] {
  const daily = dailyWeights(points, !usesMornings(points));
  return days.map((d) => {
    const vals: number[] = [];
    for (let i = 0; i < window; i++) {
      const v = daily.get(addDays(d, -i));
      if (v !== undefined) vals.push(v);
    }
    return vals.length ? Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 100) / 100 : null;
  });
}

/** Latest trend value up to `today` (looks back up to 60 days for the last weight). */
export function latestTrend(points: WeightPoint[], today: DayKey): number | null {
  if (!points.length) return null;
  const daily = dailyWeights(points, !usesMornings(points));
  const daysWith = Array.from(daily.keys()).filter((d) => d <= today).sort();
  if (!daysWith.length) return null;
  const last = daysWith[daysWith.length - 1];
  if (diffDays(last, today) > 60) return null;
  return trendSeries(points, [last])[0];
}

/** Direction of the trend over the last week: compares today's trend with 7 days earlier. */
export function trendDirection(points: WeightPoint[], today: DayKey): { delta: number; dir: 'down' | 'up' | 'flat' } | null {
  const [now, before] = trendSeries(points, [today, addDays(today, -7)]);
  if (now === null || before === null) return null;
  const delta = Math.round((now - before) * 10) / 10;
  return { delta, dir: delta <= -0.1 ? 'down' : delta >= 0.1 ? 'up' : 'flat' };
}

export interface Progress {
  startKg: number;
  nowKg: number;
  targetKg: number;
  /** kg still to go (absolute). */
  toGoKg: number;
  /** 0–100. */
  percent: number;
}

export function progress(startKg: number, nowKg: number, targetKg: number): Progress {
  const total = targetKg - startKg;
  const done = nowKg - startKg;
  const pct = Math.abs(total) < 0.05 ? 100 : Math.max(0, Math.min(100, (done / total) * 100));
  return {
    startKg,
    nowKg,
    targetKg,
    toGoKg: Math.round(Math.abs(targetKg - nowKg) * 10) / 10,
    percent: Math.round(pct),
  };
}

/** Mean of morning weights in [from, to] (falls back to any slot). Null when fewer than `min`. */
export function windowAverage(points: WeightPoint[], from: DayKey, to: DayKey, min = 4): { avg: number; count: number } | null {
  const daily = dailyWeights(points, !usesMornings(points));
  const vals = Array.from(daily.entries())
    .filter(([d]) => d >= from && d <= to)
    .map(([, v]) => v);
  if (vals.length < min) return null;
  return { avg: vals.reduce((a, b) => a + b, 0) / vals.length, count: vals.length };
}

/** Morning/Night preselected by the time of day (before 2 pm → morning). */
export function defaultWeightSlot(d: Date): 'morning' | 'night' {
  return d.getHours() < 14 ? 'morning' : 'night';
}
