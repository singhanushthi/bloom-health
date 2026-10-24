/**
 * Demo kitchen: a realistic home pantry (fresh produce with "use soon" dates, staples and two
 * scanned packaged products) so every Kitchen screen can be previewed in demo mode.
 */
import { addDays, todayKey } from '../health/dates';
import { getIngredient } from './ingredients';
import { draftFromIngredient, memoryKitchen, type KitchenRepos, type PantryDraft } from './pantry';

const KEYS = [
  'onion',
  'tomato',
  'spinach',
  'capsicum',
  'cucumber',
  'peas',
  'green-chilli',
  'ginger',
  'garlic',
  'lemon',
  'coriander-leaves',
  'banana',
  'apple',
  'atta',
  'rice',
  'poha',
  'oats',
  'besan',
  'moong-dal',
  'toor-dal',
  'kabuli-chana',
  'sprouts',
  'paneer',
  'curd',
  'milk',
  'egg',
  'peanuts',
  'almonds',
  'makhana',
];

export function demoPantryDrafts(now: Date = new Date()): PantryDraft[] {
  const today = todayKey(now);
  const drafts: PantryDraft[] = KEYS.map((k) => draftFromIngredient(getIngredient(k)!, today));
  // A couple of items close to their date, so "use soon" shows up.
  for (const d of drafts) {
    if (d.ingredientKey === 'spinach') d.expiresOn = addDays(today, 1);
    if (d.ingredientKey === 'paneer') d.expiresOn = addDays(today, 2);
    if (d.ingredientKey === 'paneer') {
      d.quantity = 200;
      d.unit = 'g';
    }
    if (d.ingredientKey === 'egg') {
      d.quantity = 6;
      d.unit = 'pcs';
    }
  }
  drafts.push(
    {
      name: 'Rolled oats',
      brand: 'Demo Mills',
      ingredientKey: 'oats',
      category: 'grains',
      barcode: '8901234567890',
      source: 'barcode',
      nutriscore: 'a',
      nutritionPer100g: { kcal: 380, protein: 13.2, carbs: 58, fat: 6.5, fiber: 10.1, sugar: 1.0, salt: 0.01, satFat: 1.2 },
    },
    {
      name: 'Cream biscuits',
      brand: 'Demo Bakes',
      ingredientKey: 'biscuits',
      category: 'packaged',
      barcode: '8909876543210',
      source: 'barcode',
      nutriscore: 'e',
      nutritionPer100g: { kcal: 492, protein: 5.8, carbs: 70, fat: 21, fiber: 1.5, sugar: 32, salt: 0.6, satFat: 10.5 },
    }
  );
  return drafts;
}

let demo: KitchenRepos | null = null;

/** One in-memory demo kitchen per app run (changes in demo mode are never saved). */
export function demoKitchen(now: Date = new Date()): KitchenRepos {
  if (!demo) demo = memoryKitchen(demoPantryDrafts(now), now);
  return demo;
}

/** For tests. */
export function resetDemoKitchen(): void {
  demo = null;
}
