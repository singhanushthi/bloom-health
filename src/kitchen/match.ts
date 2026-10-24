/**
 * Recipe matcher (pure, tested): ranks recipes by what's in the kitchen and how well they fit
 * the next meal.
 *
 *  - Pantry coverage: required ingredients present (salt, water, spices and oils are always
 *    assumed; listed substitutes count, e.g. brown rice for rice, tofu for paneer).
 *  - Diet preference (veg / egg / non-veg / vegan / Jain) is a hard filter.
 *  - Meal type from the time of day gets a boost (an explicit `meal` is a hard filter).
 *  - Fit to the next meal's share of the remaining kcal (from the plan, if there is one).
 *  - Protein-rich recipes rank higher when protein is behind.
 *  - "Period comfort" recipes get a gentle boost on period days.
 */
import { RECIPE_MEAL_LABEL, type Recipe, type RecipeMeal } from '../content/recipes';
import type { DietPref } from '../plan/profile';
import { getIngredient } from './ingredients';

export interface MatchOptions {
  recipes: Recipe[];
  pantryKeys: Iterable<string>;
  diet?: DietPref | null;
  /** Hard filter (browse). */
  meal?: RecipeMeal | null;
  /** Hour of day (0–23) for the preferred meal; defaults to no preference. */
  hour?: number | null;
  /** From the plan: kcal left today (allowance − eaten). null/undefined = no plan. */
  remainingKcal?: number | null;
  remainingProtein?: number | null;
  proteinTarget?: number | null;
  onPeriod?: boolean;
}

export interface MissingIngredient {
  key: string;
  name: string;
}

export interface RecipeMatch {
  recipe: Recipe;
  missing: MissingIngredient[];
  /** Required (non-basic, non-optional) ingredient keys that are available. */
  have: string[];
  /** Number of required, non-basic ingredients. */
  required: number;
  coverage: number;
  score: number;
  /** kcal budget for the next meal, if known. */
  mealBudget: number | null;
  fitNote: string;
}

/** Same slots as the plan's mealSlotFor. */
export function mealForHour(hour: number): RecipeMeal {
  if (hour < 11) return 'breakfast';
  if (hour < 16) return 'lunch';
  if (hour < 19) return 'snack';
  return 'dinner';
}

const SLOT_ORDER: RecipeMeal[] = ['breakfast', 'lunch', 'snack', 'dinner'];
export const MEAL_SHARE: Record<RecipeMeal, number> = { breakfast: 0.25, lunch: 0.35, snack: 0.1, dinner: 0.3 };

/** This meal's share of what's left today (later meals still need room too). */
export function mealBudget(remainingKcal: number, meal: RecipeMeal): number {
  const left = SLOT_ORDER.slice(SLOT_ORDER.indexOf(meal));
  const total = left.reduce((s, m) => s + MEAL_SHARE[m], 0);
  return Math.max(0, Math.round((remainingKcal * MEAL_SHARE[meal]) / total));
}

export function fitsRecipeDiet(r: Pick<Recipe, 'diet' | 'jainOk'>, pref: DietPref | null | undefined): boolean {
  switch (pref) {
    case 'vegan':
      return r.diet === 'vegan';
    case 'veg':
      return r.diet === 'veg' || r.diet === 'vegan';
    case 'jain':
      return r.jainOk;
    case 'egg':
      return r.diet !== 'nonveg';
    default:
      return true;
  }
}

/** Whether an ingredient is available: in the pantry, a listed substitute is, or it's a basic. */
export function isAvailable(key: string, have: ReadonlySet<string>): boolean {
  if (have.has(key)) return true;
  const ing = getIngredient(key);
  if (!ing) return false;
  if (ing.basic) return true;
  return !!ing.subs?.some((s) => have.has(s));
}

export function proteinIsBehind(remainingProtein: number | null | undefined, proteinTarget: number | null | undefined): boolean {
  if (remainingProtein == null || proteinTarget == null) return false;
  return remainingProtein > Math.max(20, proteinTarget * 0.25);
}

export function coverageFor(recipe: Recipe, have: ReadonlySet<string>): { missing: MissingIngredient[]; have: string[]; required: number } {
  const req = recipe.ingredients.filter((i) => !i.optional && !getIngredient(i.key)?.basic);
  const missing: MissingIngredient[] = [];
  const got: string[] = [];
  for (const i of req) {
    if (isAvailable(i.key, have)) got.push(i.key);
    else if (!missing.some((m) => m.key === i.key)) missing.push({ key: i.key, name: getIngredient(i.key)?.name ?? i.name ?? i.key });
  }
  return { missing, have: got, required: req.length };
}

export function rankRecipes(o: MatchOptions): RecipeMatch[] {
  const have = new Set(o.pantryKeys);
  const preferred = o.hour != null ? mealForHour(o.hour) : null;
  const slot = o.meal ?? preferred;
  const budget = o.remainingKcal != null && slot ? mealBudget(o.remainingKcal, slot) : null;
  const behind = proteinIsBehind(o.remainingProtein, o.proteinTarget);

  const out: RecipeMatch[] = [];
  for (const recipe of o.recipes) {
    if (!fitsRecipeDiet(recipe, o.diet)) continue;
    if (o.meal && !recipe.meal.includes(o.meal)) continue;
    const cov = coverageFor(recipe, have);
    const coverage = cov.required ? cov.have.length / cov.required : 1;
    const { kcal, protein } = recipe.perServing;

    let score = 50 * coverage - 4 * cov.missing.length;
    if (preferred && recipe.meal.includes(preferred)) score += 15;
    if (budget != null) {
      if (kcal <= budget * 1.1) score += 12;
      else if (budget < 80) score -= 20;
      else score -= Math.min(20, ((kcal - budget) / Math.max(1, budget)) * 30);
    }
    score += behind ? Math.min(15, protein * 0.6) : Math.min(5, protein * 0.2);
    if (o.onPeriod) {
      if (recipe.tags.includes('period-comfort')) score += 10;
      if (recipe.tags.includes('iron-rich')) score += 4;
    }
    if (recipe.tags.includes('high-fibre')) score += 2;
    if (recipe.tags.includes('low-oil')) score += 2;

    out.push({
      recipe,
      missing: cov.missing,
      have: cov.have,
      required: cov.required,
      coverage: Math.round(coverage * 100) / 100,
      score: Math.round(score * 10) / 10,
      mealBudget: budget,
      fitNote: fitNote(recipe, { budget, slot, behind, onPeriod: !!o.onPeriod }),
    });
  }
  return out.sort((a, b) => b.score - a.score || a.recipe.title.localeCompare(b.recipe.title));
}

export function fitNote(
  recipe: Recipe,
  o: { budget: number | null; slot: RecipeMeal | null; behind: boolean; onPeriod: boolean }
): string {
  const { kcal, protein } = recipe.perServing;
  const parts: string[] = [];
  const mealName = o.slot ? RECIPE_MEAL_LABEL[o.slot].toLowerCase() : 'next meal';
  if (o.budget != null && o.budget > 0) {
    if (kcal <= o.budget * 1.1) parts.push(`Fits your ${mealName} (~${kcal} of ~${o.budget} kcal)`);
    else parts.push(`A bit more than your ${mealName} room (~${o.budget} kcal) — a smaller portion works`);
  } else if (o.budget === 0) {
    parts.push(`~${kcal} kcal — you’ve about reached today’s range, so a small portion if you’re hungry`);
  } else {
    parts.push(`~${kcal} kcal · ${Math.round(protein)} g protein per serving`);
  }
  if (o.behind && protein >= 12) parts.push(`helps you catch up on protein (${Math.round(protein)} g)`);
  if (o.onPeriod && recipe.tags.includes('period-comfort')) parts.push('comforting on period days');
  return parts.join(' · ');
}

/** Everything is in the kitchen (basics assumed). */
export function cookNow(matches: RecipeMatch[], limit = 5): RecipeMatch[] {
  return matches.filter((m) => m.required > 0 && m.missing.length === 0).slice(0, limit);
}

/** Exactly one ingredient short. */
export function almostThere(matches: RecipeMatch[], limit = 5): RecipeMatch[] {
  return matches.filter((m) => m.missing.length === 1).slice(0, limit);
}

/** Unique missing ingredients across matches (for "Add missing to shopping list"). */
export function missingForShopping(matches: RecipeMatch[]): MissingIngredient[] {
  const seen = new Map<string, MissingIngredient>();
  for (const m of matches) for (const x of m.missing) if (!seen.has(x.key)) seen.set(x.key, x);
  return Array.from(seen.values());
}

/** Plain text for the share sheet. */
export function shoppingListText(items: { name: string; done?: boolean }[]): string {
  const open = items.filter((i) => !i.done);
  if (!open.length) return 'Shopping list — all done!';
  return ['Shopping list (from Bloom)', ...open.map((i) => `• ${i.name}`)].join('\n');
}
