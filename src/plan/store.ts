/**
 * Persistence for the plan profile and plan settings (SQLite kv table, on-device only).
 */
import { kv, planAdjustments } from '../db/repos';
import { emitPlanChange } from './events';
import { isProfile, PROFILE_KEY, type Profile } from './profile';

export async function loadProfile(): Promise<Profile | null> {
  const p = await kv.get<Profile>(PROFILE_KEY);
  if (!isProfile(p)) return null;
  const d = p as Partial<Profile> & Profile;
  return {
    ...d,
    yogaPerWeek: d.yogaPerWeek ?? 4,
    diet: d.diet ?? 'veg',
    pace: d.pace ?? 'steady',
    activity: d.activity ?? 'light',
  };
}

/**
 * Save the profile. When the goal itself changes (target, pace or a big weight change), the
 * adaptive weeks restart from today and earlier adjustments are cleared.
 */
export async function saveProfile(next: Profile, opts: { resetAdaptation?: boolean } = {}): Promise<void> {
  const prev = await loadProfile();
  const goalChanged =
    !prev || prev.targetKg !== next.targetKg || prev.pace !== next.pace || prev.formula !== next.formula;
  if (opts.resetAdaptation ?? goalChanged) await planAdjustments.clear();
  await kv.set(PROFILE_KEY, next);
  emitPlanChange();
}

export interface PlanSettings {
  /** Read Weight records from Health Connect (smart scales, Google Health). */
  hcReadWeight: boolean;
  /** Write Bloom weights to Health Connect. */
  hcWriteWeight: boolean;
  /** Write logged food to Health Connect as Nutrition records. */
  hcWriteNutrition: boolean;
  /** Write logged activities to Health Connect as exercise sessions. */
  hcWriteExercise: boolean;
}

export const DEFAULT_PLAN_SETTINGS: PlanSettings = {
  hcReadWeight: false,
  hcWriteWeight: false,
  hcWriteNutrition: false,
  hcWriteExercise: false,
};

const SETTINGS_KEY = 'plan.settings';

export async function loadPlanSettings(): Promise<PlanSettings> {
  const s = await kv.get<Partial<PlanSettings>>(SETTINGS_KEY);
  return { ...DEFAULT_PLAN_SETTINGS, ...(s ?? {}) };
}

export async function savePlanSettings(patch: Partial<PlanSettings>): Promise<PlanSettings> {
  const next = { ...(await loadPlanSettings()), ...patch };
  await kv.set(SETTINGS_KEY, next);
  emitPlanChange();
  return next;
}
