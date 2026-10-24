/**
 * Compact 30-day data summary sent to Gemini as context.
 *
 * `buildSummary` is pure (tested). `getSummary` gathers the inputs through the normal data
 * layer and caches the text, rebuilding only when Bloom's data changes (dataVersion), the
 * day rolls over, or demo mode toggles. Only aggregates go out — never raw notes, keys or ids.
 */
import type { DayLog } from '../db/repos';
import { MOODS, SYMPTOMS } from '../db/repos';
import type { CycleResult } from '../health/cycle';
import { PHASE_LABEL } from '../health/cyclePrediction';
import type { DayKey } from '../health/dates';
import { sourceLabel } from '../health/sources';
import type { ActivityToday, HeartToday, MetricResult, SleepNight, Spo2Latest, Trends } from '../health/types';
import { dayLogs as dayLogRepo } from '../db/repos';
import { getActivityToday } from '../health/activity';
import { getCycleStatus } from '../health/cycle';
import type { ReadContext } from '../health/context';
import { addDays, todayKey } from '../health/dates';
import { getHeartToday } from '../health/heart';
import { getLastNightSleep } from '../health/sleep';
import { getLatestSpo2 } from '../health/spo2';
import { getTrends } from '../health/trends';
import { mockDayLogs } from '../data/mock';
import { loadPlanSummary, type PlanSummary } from '../plan/data';
import { subscribePlan } from '../plan/events';

export interface SummaryInput {
  today: DayKey;
  stepGoal: number;
  demo: boolean;
  cycle: MetricResult<CycleResult> | null;
  trends: MetricResult<Trends> | null;
  activity: MetricResult<ActivityToday> | null;
  sleep: MetricResult<SleepNight> | null;
  heart: MetricResult<HeartToday> | null;
  spo2: MetricResult<Spo2Latest> | null;
  dayLogs: DayLog[];
  /** Weight, food, activity and yoga aggregates (optional). */
  plan?: PlanSummary | null;
}

const fmtH = (min: number) => `${Math.floor(min / 60)}h${String(Math.round(min % 60)).padStart(2, '0')}m`;

function avg(xs: number[]) {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
}

function present(vals: { day: string; value: number | null }[]) {
  return vals.filter((v): v is { day: string; value: number } => v.value !== null);
}

const label = (list: readonly { id: string; label: string }[], id: string) =>
  list.find((x) => x.id === id)?.label.toLowerCase() ?? id;

export function buildSummary(i: SummaryInput): string {
  const L: string[] = [];
  L.push(`Today: ${i.today}.${i.demo ? ' (DEMO MODE: sample data, not the user’s real data.)' : ''}`);

  /* Cycle */
  const c = i.cycle?.status === 'ok' ? i.cycle.data : null;
  if (c && c.hasData) {
    const parts = [
      `cycle day ${c.cycleDay}`,
      c.phase ? `phase ${PHASE_LABEL[c.phase]}` : null,
      `average cycle ${c.averageCycleLength} days${c.usedDefault ? ' (default — fewer than 2 cycles logged)' : ` (from ${c.cyclesUsed} cycles)`}`,
      `average period ${c.averagePeriodLength} days`,
      c.daysLate > 0
        ? `period ${c.daysLate} days later than estimated`
        : c.nextPeriodStart
          ? `next period estimated ${c.nextPeriodStart} (in ${c.daysUntilNextPeriod} days)`
          : null,
      `last period started ${c.lastPeriodStart}`,
    ].filter(Boolean);
    L.push(`Cycle (estimates): ${parts.join('; ')}.`);
    const recent = c.history
      .filter((h) => h.cycleLength !== null)
      .slice(0, 6)
      .map((h) => h.cycleLength);
    if (recent.length) L.push(`Recent cycle lengths (newest first): ${recent.join(', ')} days.`);
    const src = sourceLabel(i.cycle?.sources ?? []);
    if (src) L.push(`Cycle source: ${src}.`);
  } else {
    L.push('Cycle: no period data logged.');
  }

  /* Day logs */
  const logs = i.dayLogs;
  if (logs.length) {
    const count = (ids: string[]) => {
      const m = new Map<string, number>();
      for (const id of ids) m.set(id, (m.get(id) ?? 0) + 1);
      return Array.from(m.entries()).sort((a, b) => b[1] - a[1]);
    };
    const sy = count(logs.flatMap((l) => l.symptoms));
    const mo = count(logs.flatMap((l) => l.moods));
    if (sy.length) L.push(`Symptoms logged in 30 days (days): ${sy.map(([k, n]) => `${label(SYMPTOMS, k)} ${n}`).join(', ')}.`);
    if (mo.length) L.push(`Moods logged in 30 days (days): ${mo.map(([k, n]) => `${label(MOODS, k)} ${n}`).join(', ')}.`);
    const t = logs.find((l) => l.day === i.today);
    if (t && (t.symptoms.length || t.moods.length))
      L.push(
        `Today’s log: ${[...t.symptoms.map((s) => label(SYMPTOMS, s)), ...t.moods.map((m) => label(MOODS, m))].join(', ')}.`
      );
  } else {
    L.push('Symptoms/mood: nothing logged in 30 days.');
  }

  /* Steps */
  const tr = i.trends?.status === 'ok' ? i.trends.data : null;
  const a = i.activity?.status === 'ok' ? i.activity.data : null;
  L.push(`Step goal: ${i.stepGoal} steps/day.`);
  if (a) {
    L.push(
      `Steps today so far: ${a.steps} (${Math.round((a.steps / i.stepGoal) * 100)}% of goal), source ${sourceLabel(i.activity?.sources ?? []) ?? 'unknown'}; distance ${a.distanceKm} km${a.distanceEstimated ? ' (estimated from stride)' : ''}${a.activeKcal !== null ? `; active ${a.activeKcal} kcal` : ''}.`
    );
  } else {
    L.push('Steps today: no data.');
  }
  if (tr) {
    const s = present(tr.steps);
    const last7 = present(tr.steps.slice(-7));
    if (s.length) {
      const met = s.filter((v) => v.value >= i.stepGoal).length;
      L.push(
        `Steps 30 days: ${s.length} days with data, average ${Math.round(avg(s.map((v) => v.value))!)}; last 7 days average ${last7.length ? Math.round(avg(last7.map((v) => v.value))!) : 'n/a'}; goal met on ${met} of ${s.length} days.`
      );
      L.push(`Steps last 7 days: ${tr.steps.slice(-7).map((v) => `${v.day.slice(5)} ${v.value ?? '—'}`).join(', ')}.`);
    } else L.push('Steps 30 days: no data.');

    /* Sleep */
    const sl = present(tr.sleepMin);
    if (sl.length) {
      const last7s = present(tr.sleepMin.slice(-7));
      L.push(
        `Sleep 30 days: ${sl.length} nights recorded, average ${fmtH(avg(sl.map((v) => v.value))!)} asleep; last 7 nights average ${last7s.length ? fmtH(avg(last7s.map((v) => v.value))!) : 'n/a'}.`
      );
      L.push(`Sleep last 7 nights (by wake-up day): ${tr.sleepMin.slice(-7).map((v) => `${v.day.slice(5)} ${v.value === null ? '—' : fmtH(v.value)}`).join(', ')}.`);
    } else L.push('Sleep 30 days: no data.');

    /* Heart trend */
    const hr = present(tr.restingHr);
    if (hr.length) {
      L.push(
        `${tr.hrKind === 'resting' ? 'Resting heart rate' : 'Logged heart-rate readings (daily mean, not resting HR)'} 30 days: average ${Math.round(avg(hr.map((v) => v.value))!)} bpm, range ${Math.min(...hr.map((v) => v.value))}–${Math.max(...hr.map((v) => v.value))} over ${hr.length} days.`
      );
    } else L.push('Heart rate 30 days: no data.');
  }

  const sn = i.sleep?.status === 'ok' ? i.sleep.data : null;
  if (sn) {
    const stages = sn.hasStages
      ? `; stages ${Object.entries(sn.stages)
          .map(([k, v]) => `${k} ${fmtH(v ?? 0)}`)
          .join(', ')}`
      : '; no stage data';
    L.push(`Last night: ${fmtH(sn.asleepMin)} asleep${sn.quality ? `, quality ${sn.quality}/5` : ''}${stages}.`);
  }
  const h = i.heart?.status === 'ok' ? i.heart.data : null;
  if (h) {
    L.push(
      `Heart today: ${h.restingBpm !== null ? `resting ${h.restingBpm} bpm; ` : ''}${h.minBpm !== null ? `range ${h.minBpm}–${h.maxBpm} bpm` : 'no readings'}.`
    );
  }
  const o = i.spo2?.status === 'ok' ? i.spo2.data : null;
  L.push(o ? `Latest SpO2: ${o.percent}% at ${o.time.slice(0, 16).replace('T', ' ')}.` : 'SpO2: no reading in the last 7 days.');

  /* Plan: weight, food, activity, yoga (aggregates + food item names only) */
  const p = i.plan;
  if (p) {
    if (p.mode) L.push(`Plan goal: ${p.mode} weight${p.targetKg !== null ? ` (target ${p.targetKg} kg)` : ''}; daily range ${p.kcalMin ?? '?'}–${p.kcalMax ?? '?'} kcal; protein target ${p.proteinTarget ?? '?'} g.`);
    L.push(
      p.trendKg !== null
        ? `Weight trend (7-day average of morning weights): ${p.trendKg.toFixed(1)} kg${p.trendDelta7 !== null ? `, ${p.trendDelta7 > 0 ? '+' : ''}${p.trendDelta7.toFixed(1)} kg vs a week ago` : ''}; ${p.morningWeighIns7} morning weigh-ins in 7 days.`
        : 'Weight: no weights logged.'
    );
    L.push(
      p.daysWithFood7
        ? `Food last 7 days: ${p.daysWithFood7} days logged, average ${p.avgKcal7} kcal and ${p.avgProtein7} g protein per logged day.${p.topFoods.length ? ` Common items: ${p.topFoods.join(', ')}.` : ''}`
        : 'Food: nothing logged in 7 days.'
    );
    L.push(`Workouts last 7 days: ${p.activityMinutes7} minutes logged; yoga sessions: ${p.yogaSessions7}.`);
    if (p.cycleNote) L.push('Note: around the period now — water retention can add 1–2 kg temporarily.');
  }

  return L.join('\n');
}

/* ------------------------------- Gathering ------------------------------- */

let cache: { key: string; text: string } | null = null;
// Plan writes (weight, food, activity, water) don't bump dataVersion — drop the cache on them.
subscribePlan(() => {
  cache = null;
});

export function summaryCacheKey(ctx: ReadContext, dataVersion: number, stepGoal: number, now = new Date()) {
  return `${ctx.mode}|${dataVersion}|${stepGoal}|${todayKey(now)}|${Array.from(ctx.granted).sort().join(',')}`;
}

export async function getSummary(ctx: ReadContext, dataVersion: number, stepGoal: number): Promise<string> {
  const now = new Date();
  const key = summaryCacheKey(ctx, dataVersion, stepGoal, now);
  if (cache?.key === key) return cache.text;
  const c = { ...ctx, now };
  const today = todayKey(now);
  const safe = async <T,>(p: Promise<T>): Promise<T | null> => {
    try {
      return await p;
    } catch {
      return null;
    }
  };
  const [cycle, trends, activity, sleep, heart, spo2, logs, plan] = await Promise.all([
    safe(getCycleStatus(c)),
    safe(getTrends(c, 30)),
    safe(getActivityToday(c)),
    safe(getLastNightSleep(c)),
    safe(getHeartToday(c)),
    safe(getLatestSpo2(c)),
    ctx.mode === 'demo' ? Promise.resolve(mockDayLogs(now)) : safe(dayLogRepo.list(addDays(today, -29), today)),
    safe(loadPlanSummary(c, { cycleTracked: true })),
  ]);
  const text = buildSummary({
    today,
    stepGoal,
    demo: ctx.mode === 'demo',
    cycle,
    trends,
    activity,
    sleep,
    heart,
    spo2,
    dayLogs: logs ?? [],
    plan,
  });
  cache = { key, text };
  return text;
}

export function clearSummaryCache() {
  cache = null;
}
