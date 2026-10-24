/**
 * Demo-mode data for the plan: profile, five weeks of morning (and some night) weights,
 * today's meals, water, activities, a Health Connect session and weekly plan updates.
 * Deterministic per calendar day.
 */
import type { ActivityLog, FoodEntry, PlanAdjustment } from '../db/repos';
import { addDays, todayKey, type DayKey } from '../health/dates';
import type { HcSession } from './hc';
import type { Profile } from './profile';
import type { WeightPoint } from './trend';

function seeded(seed: string) {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return ((h ^= h >>> 16) >>> 0) / 4294967296;
  };
}

export const DEMO_START_OFFSET = -35;

export function mockProfile(now = new Date()): Profile {
  return {
    formula: 'female',
    birthYear: now.getFullYear() - 29,
    heightCm: 162,
    weightKg: 72,
    targetKg: 64,
    activity: 'light',
    diet: 'veg',
    pace: 'steady',
    startDay: addDays(todayKey(now), DEMO_START_OFFSET),
    yogaPerWeek: 4,
  };
}

export function mockWeights(now = new Date()): WeightPoint[] {
  const today = todayKey(now);
  const out: WeightPoint[] = [];
  for (let off = DEMO_START_OFFSET; off <= 0; off++) {
    const day = addDays(today, off);
    const r = seeded(`w-${day}`);
    if (r() < 0.18 && off !== 0) continue; // skipped a few mornings
    const progress = (off - DEMO_START_OFFSET) / -DEMO_START_OFFSET; // 0 → 1
    const base = 72 - progress * 2.3;
    const kg = Math.round((base + (r() - 0.5) * 0.6) * 10) / 10;
    out.push({ day, slot: 'morning', kg, time: `${day}T07:10:00`, source: 'bloom' });
    if (r() < 0.3) out.push({ day, slot: 'night', kg: Math.round((kg + 0.6 + r() * 0.7) * 10) / 10, time: `${day}T22:15:00`, source: 'bloom' });
  }
  return out;
}

const F = (
  id: number,
  day: DayKey,
  meal: FoodEntry['meal'],
  name: string,
  servings: number,
  kcal: number,
  protein: number,
  carbs: number,
  fat: number,
  fiber: number
): FoodEntry => ({
  id,
  day,
  meal,
  foodKey: null,
  name,
  servings,
  grams: null,
  kcal,
  protein,
  carbs,
  fat,
  fiber,
  source: 'db',
  createdAt: `${day}T08:00:00.000Z`,
});

export function mockFood(now = new Date()): FoodEntry[] {
  const day = todayKey(now);
  const h = now.getHours();
  const list: FoodEntry[] = [
    F(-1, day, 'breakfast', 'Poha', 1, 250, 5, 45, 6, 2.5),
    F(-2, day, 'breakfast', 'Masala chai (less sugar)', 1, 90, 3, 12, 3, 0),
  ];
  if (h >= 12) {
    list.push(F(-3, day, 'lunch', 'Roti', 2, 240, 7, 44, 4, 6));
    list.push(F(-4, day, 'lunch', 'Dal tadka', 1, 180, 9, 22, 6, 5));
    list.push(F(-5, day, 'lunch', 'Cucumber salad', 1, 30, 1, 6, 0, 1.5));
  }
  if (h >= 17) list.push(F(-6, day, 'snack', 'Apple', 1, 95, 0.5, 25, 0.3, 4.4));
  return list;
}

export function mockWater(now = new Date()): number {
  const h = now.getHours();
  return Math.min(2500, Math.max(250, Math.round((h - 6) / 2) * 250));
}

export function mockActivities(now = new Date()): ActivityLog[] {
  const today = todayKey(now);
  const list: ActivityLog[] = [];
  // Yoga sessions this week (from the Yoga tab) + today's walk.
  [-6, -4, -2].forEach((off, i) =>
    list.push({ id: -10 - i, day: addDays(today, off), type: 'yoga', title: 'Morning flow', minutes: 20, intensity: 'light', kcal: 56, source: 'bloom-yoga' })
  );
  list.push({ id: -1, day: today, type: 'walk', title: 'Evening walk', minutes: 30, intensity: 'moderate', kcal: 123, source: 'manual' });
  return list;
}

export function mockHcSessions(now = new Date()): HcSession[] {
  const start = new Date(now);
  start.setHours(7, 0, 0, 0);
  return [{ title: 'Morning walk', minutes: 25, source: 'com.google.android.apps.fitness', exerciseType: 79, start: start.toISOString() }];
}

export function mockAdjustments(now = new Date()): PlanAdjustment[] {
  const start = addDays(todayKey(now), DEMO_START_OFFSET);
  return [
    { id: -1, weekStart: start, weekNo: 1, deltaKcal: 0, verdict: 'on-track', reason: 'Week 1: right on track — no change needed.' },
    {
      id: -2,
      weekStart: addDays(start, 7),
      weekNo: 2,
      deltaKcal: 100,
      verdict: 'fast',
      reason: 'Week 2: added 100 kcal because you lost faster than planned — slow and steady keeps the weight off.',
    },
    { id: -3, weekStart: addDays(start, 14), weekNo: 3, deltaKcal: 0, verdict: 'on-track', reason: 'Week 3: right on track — no change needed.' },
    {
      id: -4,
      weekStart: addDays(start, 21),
      weekNo: 4,
      deltaKcal: 0,
      verdict: 'slow',
      reason: 'Week 4: a bit slower than planned — no change yet. Weight wobbles; we look at two weeks before adjusting.',
    },
  ];
}
