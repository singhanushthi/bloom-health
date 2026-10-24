/**
 * Optional Health Connect integration for the plan: read Weight (smart scales, Google Health),
 * read today's ExerciseSessions, and — only when the user turns it on in Settings — write
 * Weight, Nutrition and ExerciseSession records. Write permissions are requested only when a
 * toggle is switched on. Every call is guarded; failures never break local logging.
 *
 * Record/permission names verified against react-native-health-connect 4.1.3 types:
 *  Weight { time, weight: Mass }, Nutrition { startTime, endTime, energy, protein,
 *  totalCarbohydrate, totalFat, dietaryFiber, name, mealType }, ExerciseSession
 *  { startTime, endTime, exerciseType, title }.
 */
import { ensureInitialized, hc } from '../health/client';
import { dayStart, toDayKey, type DayKey } from '../health/dates';
import type { WeightPoint } from './trend';
import type { ActivityType } from './met';
import type { Meal } from '../db/repos';

export type PlanPermission = 'read:Weight' | 'write:Weight' | 'write:Nutrition' | 'write:ExerciseSession' | 'read:ExerciseSession';

const toPerm = (p: PlanPermission) => {
  const [accessType, recordType] = p.split(':') as ['read' | 'write', 'Weight' | 'Nutrition' | 'ExerciseSession'];
  return { accessType, recordType };
};

export async function planGranted(): Promise<Set<PlanPermission>> {
  const m = hc();
  if (!m || !(await ensureInitialized())) return new Set();
  try {
    const perms = await m.getGrantedPermissions();
    return new Set(
      (perms as { accessType: string; recordType?: string }[])
        .filter((p) => typeof p.recordType === 'string')
        .map((p) => `${p.accessType}:${p.recordType}` as PlanPermission)
    );
  } catch {
    return new Set();
  }
}

/** Asks Health Connect for the given permissions; resolves to whether all were granted. */
export async function requestPlanPermissions(perms: PlanPermission[]): Promise<boolean> {
  const m = hc();
  if (!m || !(await ensureInitialized())) return false;
  try {
    await m.requestPermission(perms.map(toPerm));
  } catch {
    return false;
  }
  const now = await planGranted();
  return perms.every((p) => now.has(p));
}

/** Weight records from Health Connect, labelled by source app. Morning = before noon (local). */
export async function readHcWeights(from: Date, to: Date): Promise<WeightPoint[]> {
  const m = hc();
  if (!m || !(await ensureInitialized())) return [];
  try {
    const res = await m.readRecords('Weight', {
      timeRangeFilter: { operator: 'between', startTime: from.toISOString(), endTime: to.toISOString() },
      ascendingOrder: true,
      pageSize: 1000,
    });
    return res.records
      .filter((r) => r.metadata?.dataOrigin !== BLOOM_PACKAGE)
      .map((r) => {
        const t = new Date(r.time);
        return {
          day: toDayKey(t),
          slot: t.getHours() < 12 ? ('morning' as const) : ('night' as const),
          kg: Math.round(r.weight.inKilograms * 10) / 10,
          time: r.time,
          source: r.metadata?.dataOrigin ?? 'healthConnect',
        };
      });
  } catch {
    return [];
  }
}

/** Bloom's own package — records we wrote are skipped when reading back (no double counting). */
export const BLOOM_PACKAGE = 'com.bloomhealth.app';

export interface HcSession {
  title: string;
  minutes: number;
  source: string;
  exerciseType: number;
  start: string;
}

export async function readHcSessions(day: DayKey, now: Date = new Date()): Promise<HcSession[]> {
  const m = hc();
  if (!m || !(await ensureInitialized())) return [];
  try {
    const res = await m.readRecords('ExerciseSession', {
      timeRangeFilter: { operator: 'between', startTime: dayStart(day).toISOString(), endTime: now.toISOString() },
      ascendingOrder: true,
      pageSize: 200,
    });
    return res.records
      .filter((r) => r.metadata?.dataOrigin !== BLOOM_PACKAGE)
      .map((r) => ({
        title: r.title || exerciseName(r.exerciseType),
        minutes: Math.max(0, Math.round((new Date(r.endTime).getTime() - new Date(r.startTime).getTime()) / 60000)),
        source: r.metadata?.dataOrigin ?? 'healthConnect',
        exerciseType: r.exerciseType,
        start: r.startTime,
      }));
  } catch {
    return [];
  }
}

const MANUAL_ENTRY = 3; // RecordingMethod.RECORDING_METHOD_MANUAL_ENTRY

export async function writeHcWeight(kg: number, time: Date): Promise<boolean> {
  const m = hc();
  if (!m || !(await ensureInitialized())) return false;
  try {
    await m.insertRecords([
      { recordType: 'Weight', time: time.toISOString(), weight: { value: kg, unit: 'kilograms' }, metadata: { recordingMethod: MANUAL_ENTRY } },
    ]);
    return true;
  } catch {
    return false;
  }
}

const MEAL_TYPE: Record<Meal, number> = { breakfast: 1, lunch: 2, dinner: 3, snack: 4, other: 0 };

export async function writeHcNutrition(e: {
  name: string;
  meal: Meal;
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber: number;
  time: Date;
}): Promise<boolean> {
  const m = hc();
  if (!m || !(await ensureInitialized())) return false;
  try {
    const end = new Date(e.time.getTime() + 60_000);
    await m.insertRecords([
      {
        recordType: 'Nutrition',
        startTime: e.time.toISOString(),
        endTime: end.toISOString(),
        name: e.name.slice(0, 100),
        mealType: MEAL_TYPE[e.meal],
        energy: { value: e.kcal, unit: 'kilocalories' },
        protein: { value: e.protein, unit: 'grams' },
        totalCarbohydrate: { value: e.carbs, unit: 'grams' },
        totalFat: { value: e.fat, unit: 'grams' },
        dietaryFiber: { value: e.fiber, unit: 'grams' },
        metadata: { recordingMethod: MANUAL_ENTRY },
      },
    ]);
    return true;
  } catch {
    return false;
  }
}

/** ExerciseType constants (react-native-health-connect ExerciseType). */
export const HC_EXERCISE: Record<ActivityType, number> = {
  walk: 79, // WALKING
  run: 56, // RUNNING
  cycling: 8, // BIKING
  gym: 70, // STRENGTH_TRAINING
  yoga: 83, // YOGA
  dance: 16, // DANCING
  swimming: 74, // SWIMMING_POOL
  sports: 0, // OTHER_WORKOUT (no generic "sports")
  housework: 0,
  stairs: 68, // STAIR_CLIMBING
  hiit: 36, // HIGH_INTENSITY_INTERVAL_TRAINING
  other: 0,
};

export function exerciseName(type: number): string {
  const found = (Object.keys(HC_EXERCISE) as ActivityType[]).find((k) => HC_EXERCISE[k] === type && type !== 0);
  const names: Partial<Record<ActivityType, string>> = { walk: 'Walk', run: 'Run', cycling: 'Cycling', gym: 'Strength training', yoga: 'Yoga', dance: 'Dance', swimming: 'Swimming', stairs: 'Stairs', hiit: 'HIIT' };
  return (found && names[found]) || 'Workout';
}

export async function writeHcExercise(a: { type: ActivityType; title?: string | null; minutes: number; end: Date }): Promise<boolean> {
  const m = hc();
  if (!m || !(await ensureInitialized())) return false;
  try {
    const start = new Date(a.end.getTime() - a.minutes * 60_000);
    await m.insertRecords([
      {
        recordType: 'ExerciseSession',
        startTime: start.toISOString(),
        endTime: a.end.toISOString(),
        exerciseType: HC_EXERCISE[a.type],
        title: a.title ?? undefined,
        metadata: { recordingMethod: MANUAL_ENTRY },
      },
    ]);
    return true;
  } catch {
    return false;
  }
}
