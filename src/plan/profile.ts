/**
 * Plan profile: the few facts the calorie engine needs, plus the user's preferences.
 * Stored on-device in SQLite (kv 'plan.profile'). Pure helpers here; persistence in store.ts.
 */
import type { DayKey } from '../health/dates';

/** Which Mifflin–St Jeor formula to use (asked plainly, never assumed). */
export type Formula = 'female' | 'male';
export type ActivityLevel = 'sedentary' | 'light' | 'moderate' | 'active';
export type DietPref = 'veg' | 'egg' | 'nonveg' | 'vegan' | 'jain';
export type Pace = 'gentle' | 'steady' | 'faster';

export interface Profile {
  formula: Formula;
  birthYear: number;
  heightCm: number;
  /** Weight entered in the profile (the start weight for the current goal). */
  weightKg: number;
  targetKg: number;
  activity: ActivityLevel;
  diet: DietPref;
  pace: Pace;
  /** Day the current goal started (adaptive weeks count from here). */
  startDay: DayKey;
  /** Sessions per week the user wants to do yoga. */
  yogaPerWeek: number;
}

export const ACTIVITY_LEVELS: ActivityLevel[] = ['sedentary', 'light', 'moderate', 'active'];
export const ACTIVITY_FACTOR: Record<ActivityLevel, number> = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  active: 1.725,
};
export const ACTIVITY_COPY: Record<ActivityLevel, { label: string; body: string }> = {
  sedentary: { label: 'Mostly sitting', body: 'Desk job or studies, little walking, no regular exercise.' },
  light: { label: 'Lightly active', body: 'Some walking every day, or light exercise 1–3 days a week.' },
  moderate: { label: 'Moderately active', body: 'On your feet a lot, or exercise 3–5 days a week.' },
  active: { label: 'Very active', body: 'Physical job, or hard exercise 6–7 days a week.' },
};

export const DIETS: DietPref[] = ['veg', 'egg', 'nonveg', 'vegan', 'jain'];
export const DIET_LABEL: Record<DietPref, string> = {
  veg: 'Vegetarian',
  egg: 'Eggetarian',
  nonveg: 'Non-veg',
  vegan: 'Vegan',
  jain: 'Jain',
};
export const DIET_HINT: Record<DietPref, string> = {
  veg: 'Dairy is fine, no egg, meat or fish',
  egg: 'Vegetarian plus eggs',
  nonveg: 'Everything, including meat and fish',
  vegan: 'No animal products at all',
  jain: 'Vegetarian without onion, garlic or root vegetables',
};

export const PACES: Pace[] = ['gentle', 'steady', 'faster'];
export const PACE_LABEL: Record<Pace, string> = { gentle: 'Gentle', steady: 'Steady', faster: 'Faster' };

export const PROFILE_KEY = 'plan.profile';

export const HEIGHT_RANGE = { min: 120, max: 230 } as const;

export function cmToFtIn(cm: number): { ft: number; inch: number } {
  const totalIn = cm / 2.54;
  let ft = Math.floor(totalIn / 12);
  let inch = Math.round(totalIn - ft * 12);
  if (inch === 12) {
    ft += 1;
    inch = 0;
  }
  return { ft, inch };
}

export function ftInToCm(ft: number, inch: number): number {
  return Math.round((ft * 12 + inch) * 2.54 * 10) / 10;
}

export function ageFrom(birthYear: number, now: Date = new Date()): number {
  return now.getFullYear() - birthYear;
}

export function birthYearRange(now: Date = new Date()) {
  const y = now.getFullYear();
  return { min: y - 100, max: y - 10 };
}

export function isProfile(v: unknown): v is Profile {
  const p = v as Profile;
  return (
    !!p &&
    typeof p === 'object' &&
    (p.formula === 'female' || p.formula === 'male') &&
    typeof p.birthYear === 'number' &&
    typeof p.heightCm === 'number' &&
    typeof p.weightKg === 'number' &&
    typeof p.targetKg === 'number'
  );
}
