/**
 * A food the user can pick and scale: from the Indian food list, a custom food, or a recent entry.
 * Pure helpers (tested): scaling by servings or grams.
 */
import type { Food } from '../content/foods';
import type { CustomFood, FoodEntry, FoodSource, Nutrients } from '../db/repos';

export interface Pickable {
  key: string | null;
  name: string;
  servingLabel: string;
  servingGrams: number | null;
  /** Nutrients for ONE serving. */
  per: Nutrients;
  source: FoodSource;
  approx?: boolean;
}

export const fromFood = (f: Food): Pickable => ({
  key: `db:${f.id}`,
  name: f.name,
  servingLabel: f.serving.label,
  servingGrams: f.serving.grams || null,
  per: { kcal: f.per.kcal, protein: f.per.protein, carbs: f.per.carbs, fat: f.per.fat, fiber: f.per.fiber ?? 0 },
  source: 'db',
  approx: f.approx,
});

export const fromCustom = (f: CustomFood): Pickable => ({
  key: `custom:${f.id}`,
  name: f.name,
  servingLabel: f.servingLabel,
  servingGrams: f.servingGrams,
  per: { kcal: f.kcal, protein: f.protein, carbs: f.carbs, fat: f.fat, fiber: f.fiber },
  source: 'custom',
});

/** A past entry as a template (per serving = entry ÷ servings). */
export const fromEntry = (e: FoodEntry): Pickable => {
  const s = e.servings > 0 ? e.servings : 1;
  return {
    key: e.foodKey,
    name: e.name,
    servingLabel: e.grams && e.servings ? `${Math.round(e.grams / s)} g` : '1 serving',
    servingGrams: e.grams && e.servings ? Math.round(e.grams / s) : null,
    per: { kcal: e.kcal / s, protein: e.protein / s, carbs: e.carbs / s, fat: e.fat / s, fiber: e.fiber / s },
    source: e.source,
  };
};

const r1 = (n: number) => Math.round(n * 10) / 10;

export function scale(per: Nutrients, servings: number): Nutrients {
  return {
    kcal: Math.round(per.kcal * servings),
    protein: r1(per.protein * servings),
    carbs: r1(per.carbs * servings),
    fat: r1(per.fat * servings),
    fiber: r1(per.fiber * servings),
  };
}

/** Grams → servings for foods with a known serving weight. */
export function servingsFromGrams(grams: number, servingGrams: number | null): number {
  if (!servingGrams || servingGrams <= 0) return 1;
  return Math.round((grams / servingGrams) * 100) / 100;
}

/** "1 roti (30 g)" style label. */
export function quantityLabel(p: Pickable, servings: number): string {
  const q = servings === 1 ? '1' : String(servings);
  return `${q} × ${p.servingLabel}`;
}
