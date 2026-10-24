/** Optional Health Connect sharing toggles (Settings → Health Connect sharing). Off by default. */
import type { PlanPermission } from '../plan/hc';
import type { PlanSettings } from '../plan/store';

export interface SharingToggle {
  key: keyof PlanSettings;
  perm: PlanPermission;
  title: string;
  body: string;
}

export const SHARING_TOGGLES: SharingToggle[] = [
  { key: 'hcReadWeight', perm: 'read:Weight', title: 'Read my weight', body: 'From a smart scale or Google Health. Shown with its source.' },
  { key: 'hcWriteWeight', perm: 'write:Weight', title: 'Save my weights', body: 'So other apps can see weights you log in Bloom.' },
  { key: 'hcWriteNutrition', perm: 'write:Nutrition', title: 'Save my meals', body: 'Each food you log, as a nutrition record.' },
  { key: 'hcWriteExercise', perm: 'write:ExerciseSession', title: 'Save my workouts', body: 'Activities and yoga sessions you log in Bloom.' },
];

/** "read:Weight" → the library permission object. */
export function toLibraryPermission(p: PlanPermission): { accessType: 'read' | 'write'; recordType: string } {
  const [accessType, recordType] = p.split(':') as ['read' | 'write', string];
  return { accessType, recordType };
}
