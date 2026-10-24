/**
 * Plan data loader: everything the Plan, Food, Activity and Weight screens (and the Today
 * cards) need for one day, from SQLite (+ optional Health Connect), or demo data.
 *
 * Also runs the weekly adaptive review (live mode only) and stores its decisions.
 */
import { FOODS } from '../content/foods';
import {
  activityLogs,
  foodEntries,
  planAdjustments,
  water as waterRepo,
  weightLogs,
  type ActivityLog,
  type FoodEntry,
  type PlanAdjustment,
} from '../db/repos';
import { getCycleStatus } from '../health/cycle';
import type { ReadContext } from '../health/context';
import { addDays, diffDays, todayKey, type DayKey } from '../health/dates';
import { nextMealIdeas, reviewWeek, type MealIdea, type WeekVerdict } from './adapt';
import { computePlan, dayAllowance, type Plan } from './engine';
import { readHcSessions, readHcWeights, planGranted, type HcSession } from './hc';
import { mockActivities, mockAdjustments, mockFood, mockHcSessions, mockProfile, mockWater, mockWeights } from './mock';
import type { Profile } from './profile';
import { loadPlanSettings, loadProfile } from './store';
import { latestTrend, progress, trendDirection, windowAverage, type Progress, type WeightPoint } from './trend';

export interface Totals {
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber: number;
}

export interface WeightRow extends WeightPoint {
  id: number | null;
}

export interface PlanState {
  demo: boolean;
  today: DayKey;
  profile: Profile | null;
  plan: Plan | null;
  weights: WeightRow[];
  trendKg: number | null;
  direction: { delta: number; dir: 'down' | 'up' | 'flat' } | null;
  latestMorning: WeightRow | null;
  progress: Progress | null;
  food: FoodEntry[];
  totals: Totals;
  waterMl: number;
  activities: ActivityLog[];
  hcSessions: HcSession[];
  activityMinutes: number;
  exerciseKcal: number;
  allowance: { kcal: number; min: number; max: number } | null;
  yogaThisWeek: number;
  adjustments: PlanAdjustment[];
  adjustKcal: number;
  cycleNote: string | null;
  ideas: MealIdea[];
}

export const CYCLE_NOTE = 'Water retention around your period can add 1–2 kg — it passes.';

export function sumTotals(list: Pick<FoodEntry, 'kcal' | 'protein' | 'carbs' | 'fat' | 'fiber'>[]): Totals {
  const t = list.reduce(
    (a, e) => ({ kcal: a.kcal + e.kcal, protein: a.protein + e.protein, carbs: a.carbs + e.carbs, fat: a.fat + e.fat, fiber: a.fiber + e.fiber }),
    { kcal: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 }
  );
  return {
    kcal: Math.round(t.kcal),
    protein: Math.round(t.protein),
    carbs: Math.round(t.carbs),
    fat: Math.round(t.fat),
    fiber: Math.round(t.fiber * 10) / 10,
  };
}

/** Monday-free week: plan weeks count from the goal's start day. */
export function weekStartFor(startDay: DayKey, day: DayKey): DayKey {
  const n = Math.floor(diffDays(startDay, day) / 7);
  return addDays(startDay, Math.max(0, n) * 7);
}

/**
 * Review every completed plan week that has enough data and isn't stored yet (live mode).
 * Returns the full stored list afterwards.
 */
export async function runWeeklyReviews(profile: Profile, weights: WeightPoint[], today: DayKey): Promise<PlanAdjustment[]> {
  const stored = await planAdjustments.list();
  const byStart = new Map(stored.map((a) => [a.weekStart, a]));
  const weeksDone = Math.floor(diffDays(profile.startDay, today) / 7);
  const firstWeek = Math.max(1, weeksDone - 11); // look back at most 12 weeks
  let adjust = stored.filter((a) => a.weekNo < firstWeek).reduce((s, a) => s + a.deltaKcal, 0);
  let prevVerdict: WeekVerdict | null = null;
  for (let n = firstWeek; n <= weeksDone; n++) {
    const ws = addDays(profile.startDay, (n - 1) * 7);
    const we = addDays(ws, 6);
    const existing = byStart.get(ws);
    if (existing) {
      adjust += existing.deltaKcal;
      prevVerdict = existing.verdict as WeekVerdict;
      continue;
    }
    const cur = windowAverage(weights, ws, we, 4);
    const prev = n === 1 ? { avg: profile.weightKg, count: 1 } : windowAverage(weights, addDays(ws, -7), addDays(ws, -1), 4);
    if (!cur || !prev) {
      prevVerdict = null;
      continue; // not enough morning weights — nothing stored, re-checked next time
    }
    const base = computePlan(profile, { weightKg: profile.weightKg, adjustKcal: adjust, today });
    if (!base.targets || base.minor) break;
    const r = reviewWeek({
      weekNo: n,
      mode: base.mode,
      changeKg: Math.round((cur.avg - prev.avg) * 100) / 100,
      expectedKgWeek: base.paceKgWeek,
      currentKg: cur.avg,
      prevVerdict,
      currentTargetKcal: base.targets.kcal,
      floorKcal: base.floor,
    });
    await planAdjustments.add({ weekStart: ws, weekNo: n, deltaKcal: r.deltaKcal, verdict: r.verdict, reason: r.reason });
    adjust += r.deltaKcal;
    prevVerdict = r.verdict;
  }
  return planAdjustments.list();
}

export async function loadPlanState(ctx: ReadContext, opts: { cycleTracked: boolean }): Promise<PlanState> {
  const now = ctx.now ?? new Date();
  const today = todayKey(now);
  const demo = ctx.mode === 'demo';
  const from = addDays(today, -120);

  let profile: Profile | null;
  let weights: WeightRow[];
  let food: FoodEntry[];
  let waterMl: number;
  let acts: ActivityLog[];
  let hcSessions: HcSession[] = [];
  let adjustments: PlanAdjustment[];

  if (demo) {
    profile = mockProfile(now);
    weights = mockWeights(now).map((w) => ({ ...w, id: null }));
    food = mockFood(now);
    waterMl = mockWater(now);
    acts = mockActivities(now);
    hcSessions = mockHcSessions(now);
    adjustments = mockAdjustments(now);
  } else {
    const [p, wl, fe, wm, al, settings] = await Promise.all([
      loadProfile(),
      weightLogs.list(from, today),
      foodEntries.list(today),
      waterRepo.get(today),
      activityLogs.list(addDays(today, -6), today),
      loadPlanSettings(),
    ]);
    profile = p;
    food = fe;
    waterMl = wm;
    acts = al;
    weights = wl.map((w) => ({ day: w.day, slot: w.slot, kg: w.kg, time: w.time, source: w.source, id: w.id }));
    const hcOk = ctx.availability === 'available';
    if (hcOk) {
      const granted = settings.hcReadWeight ? await planGranted().catch(() => new Set()) : new Set();
      if (settings.hcReadWeight && granted.has('read:Weight')) {
        const hcW = await readHcWeights(new Date(`${from}T00:00:00`), now).catch(() => []);
        weights = [...weights, ...hcW.map((w) => ({ ...w, id: null }))].sort((a, b) =>
          a.day === b.day ? (a.time ?? '').localeCompare(b.time ?? '') : a.day.localeCompare(b.day)
        );
      }
      if (ctx.granted.has('ExerciseSession')) hcSessions = await readHcSessions(today, now).catch(() => []);
    }
    adjustments = profile ? await runWeeklyReviews(profile, weights, today).catch(() => planAdjustments.list()) : [];
  }

  const adjustKcal = adjustments.reduce((s, a) => s + a.deltaKcal, 0);
  const trendKg = latestTrend(weights, today);
  const direction = trendDirection(weights, today);
  const latestMorning = [...weights].reverse().find((w) => w.slot === 'morning') ?? null;
  const plan = profile ? computePlan(profile, { weightKg: trendKg ?? profile.weightKg, adjustKcal, today, now }) : null;
  const prog = profile ? progress(profile.weightKg, trendKg ?? profile.weightKg, profile.targetKg) : null;

  const todayActs = acts.filter((a) => a.day === today);
  const exerciseKcal = todayActs.reduce((s, a) => s + a.kcal, 0);
  const activityMinutes = todayActs.reduce((s, a) => s + a.minutes, 0) + hcSessions.reduce((s, h) => s + h.minutes, 0);
  // Rolling last 7 days (today included) — simple to understand and never resets mid-week.
  const yogaThisWeek = acts.filter((a) => a.source === 'bloom-yoga' && a.day >= addDays(today, -6) && a.day <= today).length;

  const totals = sumTotals(food);
  const t = plan?.targets ?? null;
  const allowance = t
    ? (() => {
        const extra = dayAllowance(t.kcal, exerciseKcal) - t.kcal;
        return { kcal: t.kcal + extra, min: t.kcalMin + extra, max: t.kcalMax + extra };
      })()
    : null;

  let cycleNote: string | null = null;
  if (opts.cycleTracked) {
    try {
      const c = await getCycleStatus({ ...ctx, now });
      const d = c.data;
      if (d && d.hasData && (d.phase === 'menstrual' || (d.phase === 'luteal' && d.daysUntilNextPeriod !== null && d.daysUntilNextPeriod <= 5)))
        cycleNote = CYCLE_NOTE;
    } catch {
      cycleNote = null;
    }
  }

  const ideas =
    profile && allowance && t
      ? nextMealIdeas({
          foods: FOODS,
          diet: profile.diet,
          remainingKcal: allowance.kcal - totals.kcal,
          remainingProtein: t.proteinG - totals.protein,
          proteinTarget: t.proteinG,
        })
      : [];

  return {
    demo,
    today,
    profile,
    plan,
    weights,
    trendKg,
    direction,
    latestMorning,
    progress: prog,
    food,
    totals,
    waterMl,
    activities: todayActs,
    hcSessions,
    activityMinutes,
    exerciseKcal,
    allowance,
    yogaThisWeek,
    adjustments,
    adjustKcal,
    cycleNote,
    ideas,
  };
}

/* --------------------------- AI coach summary ---------------------------- */

export interface PlanSummary {
  mode: string | null;
  kcalMin: number | null;
  kcalMax: number | null;
  proteinTarget: number | null;
  targetKg: number | null;
  trendKg: number | null;
  trendDelta7: number | null;
  morningWeighIns7: number;
  daysWithFood7: number;
  avgKcal7: number | null;
  avgProtein7: number | null;
  activityMinutes7: number;
  yogaSessions7: number;
  topFoods: string[];
  cycleNote: boolean;
}

/** 7-day aggregates for the AI coach. Only numbers and food item names — never notes. */
export async function loadPlanSummary(ctx: ReadContext, opts: { cycleTracked: boolean }): Promise<PlanSummary | null> {
  const now = ctx.now ?? new Date();
  const today = todayKey(now);
  const from = addDays(today, -6);
  const s = await loadPlanState(ctx, opts);
  let food: FoodEntry[];
  let acts: ActivityLog[];
  if (s.demo) {
    food = s.food;
    acts = mockActivities(now);
  } else {
    [food, acts] = await Promise.all([foodEntries.list(from, today), activityLogs.list(from, today)]);
  }
  if (!s.profile && !food.length && !acts.length && !s.weights.length) return null;
  const byDay = new Map<string, { kcal: number; protein: number }>();
  for (const f of food) {
    const d = byDay.get(f.day) ?? { kcal: 0, protein: 0 };
    d.kcal += f.kcal;
    d.protein += f.protein;
    byDay.set(f.day, d);
  }
  const days = Array.from(byDay.values());
  const counts = new Map<string, number>();
  for (const f of food) counts.set(f.name, (counts.get(f.name) ?? 0) + 1);
  const t = s.plan?.targets ?? null;
  return {
    mode: s.plan?.mode ?? null,
    kcalMin: s.allowance?.min ?? t?.kcalMin ?? null,
    kcalMax: s.allowance?.max ?? t?.kcalMax ?? null,
    proteinTarget: t?.proteinG ?? null,
    targetKg: s.profile?.targetKg ?? null,
    trendKg: s.trendKg,
    trendDelta7: s.direction?.delta ?? null,
    morningWeighIns7: s.weights.filter((w) => w.slot === 'morning' && w.day >= from).length,
    daysWithFood7: days.length,
    avgKcal7: days.length ? Math.round(days.reduce((a, d) => a + d.kcal, 0) / days.length) : null,
    avgProtein7: days.length ? Math.round(days.reduce((a, d) => a + d.protein, 0) / days.length) : null,
    activityMinutes7: Math.round(acts.reduce((a, x) => a + x.minutes, 0)),
    yogaSessions7: acts.filter((a) => a.source === 'bloom-yoga' || a.type === 'yoga').length,
    topFoods: Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, 6)
      .map(([n]) => n),
    cycleNote: !!s.cycleNote,
  };
}
