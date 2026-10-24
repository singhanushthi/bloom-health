/**
 * Adaptive plan (pure, tested).
 *
 *  - Diet filtering (incl. Jain: vegetarian without onion, garlic or root vegetables — by name).
 *  - "Next meal ideas": 2–4 suggestions that fit the remaining budget, preferring protein when
 *    protein is behind.
 *  - Weekly review: compares the actual weekly change with the planned pace and nudges the
 *    daily target by ±100 kcal (never below the floor).
 */
import type { Food } from '../content/foods';
import type { DietPref } from './profile';
import type { GoalMode } from './engine';

/* --------------------------------- Diet --------------------------------- */

/** Name keywords Jain diets avoid (onion, garlic and root/underground vegetables). */
export const JAIN_EXCLUDE = [
  'onion',
  'pyaz',
  'pyaaz',
  'kanda',
  'garlic',
  'lahsun',
  'lehsun',
  'potato',
  'aloo',
  'alu ',
  'batata',
  'carrot',
  'gajar',
  'beetroot',
  'beet',
  'chukandar',
  'radish',
  'mooli',
  'ginger',
  'adrak',
  'sweet potato',
  'shakarkandi',
  'yam',
  'suran',
  'jimikand',
  'arbi',
  'colocasia',
  'turnip',
  'shalgam',
  'leek',
  'shallot',
  'scallion',
  'spring onion',
];

type DietFood = Pick<Food, 'name' | 'aliases' | 'diet'>;

export function isJainFriendly(f: DietFood): boolean {
  const hay = ` ${[f.name, ...(f.aliases ?? [])].join(' | ').toLowerCase()} `;
  return !JAIN_EXCLUDE.some((k) => hay.includes(k));
}

/** Whether a food fits the user's diet preference. */
export function fitsDiet(f: DietFood, pref: DietPref): boolean {
  switch (pref) {
    case 'vegan':
      return f.diet === 'vegan';
    case 'veg':
      return f.diet === 'veg' || f.diet === 'vegan';
    case 'jain':
      return (f.diet === 'veg' || f.diet === 'vegan') && isJainFriendly(f);
    case 'egg':
      return f.diet !== 'nonveg';
    case 'nonveg':
    default:
      return true;
  }
}

/** Diet tag to pass to searchFoods (Jain searches as veg, then filters by name). */
export function searchDietFor(pref: DietPref): Food['diet'] {
  return pref === 'jain' ? 'veg' : pref;
}

/* ---------------------------- Next meal ideas --------------------------- */

export interface MealIdea {
  title: string;
  items: { food: Food; servings: number }[];
  kcal: number;
  protein: number;
  why: string;
}

const STAPLE_RE = /\b(roti|chapati|phulka|rice|paratha|dosa|idli|bread|toast|poha|upma|millet|bajra|jowar|ragi|daliya|oats)\b/i;

const proteinDensity = (f: Food) => (f.per.kcal > 0 ? (f.per.protein * 4) / f.per.kcal : 0);

/** Meal slot from the clock, for picking sensible foods (no curries at 7 am). */
export function mealSlotFor(hour: number): 'breakfast' | 'lunch' | 'snack' | 'dinner' {
  if (hour < 11) return 'breakfast';
  if (hour < 16) return 'lunch';
  if (hour < 19) return 'snack';
  return 'dinner';
}

const r = (n: number) => Math.round(n);

/**
 * Suggest 2–4 ideas fitting `remainingKcal`. When protein is behind (more than 25% of the protein
 * target still to go while under half of the kcal remain, or > 20 g to go), protein-rich foods rank first.
 * Deterministic for the same inputs.
 */
export function nextMealIdeas(o: {
  foods: Food[];
  diet: DietPref;
  remainingKcal: number;
  remainingProtein: number;
  proteinTarget: number;
  max?: number;
}): MealIdea[] {
  const max = o.max ?? 4;
  const budget = Math.max(0, o.remainingKcal);
  if (budget < 60) return [];
  const pool = o.foods.filter((f) => f.per.kcal > 0 && fitsDiet(f, o.diet));
  const proteinBehind = o.remainingProtein > Math.max(20, o.proteinTarget * 0.25);

  const proteins = pool
    .filter((f) => proteinDensity(f) >= 0.2 && !STAPLE_RE.test(f.name))
    .sort((a, b) => proteinDensity(b) - proteinDensity(a) || a.name.localeCompare(b.name));
  const staples = pool
    .filter((f) => STAPLE_RE.test(f.name) || f.aliases?.some((a: string) => STAPLE_RE.test(a)))
    .sort((a, b) => a.per.kcal - b.per.kcal || a.name.localeCompare(b.name));
  const light = pool
    .filter((f) => f.per.kcal <= 150 && !STAPLE_RE.test(f.name))
    .sort((a, b) => proteinDensity(b) - proteinDensity(a) || a.per.kcal - b.per.kcal || a.name.localeCompare(b.name));

  const ideas: MealIdea[] = [];
  const used = new Set<string>();
  const push = (items: { food: Food; servings: number }[], why: string) => {
    const key = items.map((i) => i.food.id).join('+');
    if (used.has(key) || items.some((i) => used.has(i.food.id))) return;
    const kcal = items.reduce((s, i) => s + i.food.per.kcal * i.servings, 0);
    if (kcal > budget + 50) return;
    const protein = items.reduce((s, i) => s + i.food.per.protein * i.servings, 0);
    const title = items
      .map((i) => (i.servings === 1 ? i.food.name : `${i.food.name} ×${i.servings}`))
      .join(' + ');
    ideas.push({ title, items, kcal: r(kcal), protein: r(protein), why });
    items.forEach((i) => used.add(i.food.id));
  };

  // 1) Protein + staple combos (e.g. "Paneer bhurji + 1 roti").
  const lightestStaple = staples[0];
  for (const p of proteins) {
    if (ideas.length >= max) break;
    if (lightestStaple && p.per.kcal + lightestStaple.per.kcal <= budget + 50 && budget >= 250)
      push([{ food: p, servings: 1 }, { food: lightestStaple, servings: 1 }], proteinBehind ? 'Protein-rich, fits what’s left' : 'Balanced and fits what’s left');
    else if (p.per.kcal <= budget + 50) push([{ food: p, servings: 1 }], proteinBehind ? 'Helps you catch up on protein' : 'Fits what’s left');
    if (ideas.length >= (proteinBehind ? max - 1 : 2)) break;
  }
  // 2) Lighter options.
  for (const f of light) {
    if (ideas.length >= max) break;
    push([{ food: f, servings: 1 }], 'A light option');
  }
  return ideas.slice(0, max);
}

/* ----------------------------- Weekly review ---------------------------- */

export type WeekVerdict = 'slow' | 'fast' | 'on-track' | 'not-enough-data';

export interface WeekReview {
  verdict: WeekVerdict;
  deltaKcal: number;
  reason: string;
}

export const WEEKLY_STEP_KCAL = 100;

/**
 * Review one completed plan week.
 * @param changeKg  average morning weight this week − previous week (negative = lost). null = not enough data.
 * @param expectedKgWeek planned pace (positive number).
 * @param prevVerdict verdict of the previous week (for "too slow two weeks in a row").
 * @param currentTargetKcal target including earlier adjustments.
 */
export function reviewWeek(o: {
  weekNo: number;
  mode: GoalMode;
  changeKg: number | null;
  expectedKgWeek: number;
  currentKg: number;
  prevVerdict: WeekVerdict | null;
  currentTargetKcal: number;
  floorKcal: number;
}): WeekReview {
  const W = `Week ${o.weekNo}`;
  if (o.changeKg === null)
    return {
      verdict: 'not-enough-data',
      deltaKcal: 0,
      reason: `${W}: not enough morning weigh-ins (4 needed) — no change. A few mornings a week is plenty.`,
    };
  const ch = o.changeKg;
  if (o.mode === 'lose') {
    const lost = -ch;
    if (lost > o.currentKg * 0.01) {
      return {
        verdict: 'fast',
        deltaKcal: WEEKLY_STEP_KCAL,
        reason: `${W}: added ${WEEKLY_STEP_KCAL} kcal because you lost faster than planned — slow and steady keeps the weight off.`,
      };
    }
    if (lost < o.expectedKgWeek * 0.5) {
      if (o.prevVerdict === 'slow') {
        if (o.currentTargetKcal - WEEKLY_STEP_KCAL < o.floorKcal)
          return {
            verdict: 'slow',
            deltaKcal: 0,
            reason: `${W}: progress was slower than planned, but your plan is already at the ${o.floorKcal} kcal floor. A little extra walking or yoga can help — and slow weeks are normal.`,
          };
        return {
          verdict: 'slow',
          deltaKcal: -WEEKLY_STEP_KCAL,
          reason: `${W}: trimmed ${WEEKLY_STEP_KCAL} kcal because the trend has been slower than planned for two weeks. Still plenty of room for treats.`,
        };
      }
      return {
        verdict: 'slow',
        deltaKcal: 0,
        reason: `${W}: a bit slower than planned — no change yet. Weight wobbles; we look at two weeks before adjusting.`,
      };
    }
    return { verdict: 'on-track', deltaKcal: 0, reason: `${W}: right on track — no change needed.` };
  }
  if (o.mode === 'gain') {
    if (ch < o.expectedKgWeek * 0.5) {
      if (o.prevVerdict === 'slow')
        return {
          verdict: 'slow',
          deltaKcal: WEEKLY_STEP_KCAL,
          reason: `${W}: added ${WEEKLY_STEP_KCAL} kcal because gaining has been slower than planned for two weeks.`,
        };
      return {
        verdict: 'slow',
        deltaKcal: 0,
        reason: `${W}: a bit slower than planned — no change yet. We look at two weeks before adjusting.`,
      };
    }
    return { verdict: 'on-track', deltaKcal: 0, reason: `${W}: right on track — no change needed.` };
  }
  return { verdict: 'on-track', deltaKcal: 0, reason: `${W}: maintaining nicely — no change needed.` };
}
