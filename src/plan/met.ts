/**
 * MET (metabolic equivalent) values per activity and intensity.
 * Values are rounded from the 2011/2024 Compendium of Physical Activities.
 * kcal burned = MET × body weight (kg) × hours.
 */
export type ActivityType =
  | 'walk'
  | 'run'
  | 'cycling'
  | 'gym'
  | 'yoga'
  | 'dance'
  | 'swimming'
  | 'sports'
  | 'housework'
  | 'stairs'
  | 'hiit'
  | 'other';

export type Intensity = 'light' | 'moderate' | 'vigorous';

export const ACTIVITY_TYPES: ActivityType[] = [
  'walk',
  'run',
  'cycling',
  'gym',
  'yoga',
  'dance',
  'swimming',
  'sports',
  'housework',
  'stairs',
  'hiit',
  'other',
];

export const INTENSITIES: Intensity[] = ['light', 'moderate', 'vigorous'];

export const ACTIVITY_LABEL: Record<ActivityType, string> = {
  walk: 'Walk',
  run: 'Run',
  cycling: 'Cycling',
  gym: 'Gym / weights',
  yoga: 'Yoga',
  dance: 'Dance',
  swimming: 'Swimming',
  sports: 'Sports',
  housework: 'Housework',
  stairs: 'Stairs',
  hiit: 'HIIT',
  other: 'Other',
};

export const INTENSITY_LABEL: Record<Intensity, string> = {
  light: 'Light',
  moderate: 'Moderate',
  vigorous: 'Vigorous',
};

export const INTENSITY_HINT: Record<Intensity, string> = {
  light: 'Easy — you can sing',
  moderate: 'You can talk, not sing',
  vigorous: 'Only a few words at a time',
};

export const MET: Record<ActivityType, Record<Intensity, number>> = {
  walk: { light: 2.8, moderate: 3.5, vigorous: 5.0 },
  run: { light: 7.0, moderate: 9.0, vigorous: 11.0 },
  cycling: { light: 4.0, moderate: 6.8, vigorous: 10.0 },
  gym: { light: 3.5, moderate: 5.0, vigorous: 6.0 },
  yoga: { light: 2.3, moderate: 3.0, vigorous: 4.0 },
  dance: { light: 3.0, moderate: 5.0, vigorous: 7.3 },
  swimming: { light: 5.0, moderate: 7.0, vigorous: 9.8 },
  sports: { light: 4.0, moderate: 6.0, vigorous: 8.0 },
  housework: { light: 2.3, moderate: 3.3, vigorous: 4.0 },
  stairs: { light: 4.0, moderate: 6.0, vigorous: 8.8 },
  hiit: { light: 5.0, moderate: 8.0, vigorous: 10.0 },
  other: { light: 2.5, moderate: 4.0, vigorous: 6.0 },
};

/** kcal = MET × kg × hours, rounded to whole kcal. Returns 0 for invalid input. */
export function activityKcal(type: ActivityType, intensity: Intensity, minutes: number, weightKg: number): number {
  if (!(minutes > 0) || !(weightKg > 0)) return 0;
  const met = MET[type]?.[intensity] ?? MET.other.moderate;
  return Math.round(met * weightKg * (minutes / 60));
}

/** Logged exercise only counts at 50% toward the day's food allowance. */
export const EXERCISE_CREDIT = 0.5;
