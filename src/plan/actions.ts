/**
 * Write actions for the plan screens: save to SQLite first (always), then — only when the
 * matching Settings toggle is on — mirror to Health Connect. HC failures never block a save.
 */
import {
  customFoods,
  favourites,
  foodEntries,
  water,
  weightLogs,
  type CustomFood,
  type NewFoodEntry,
  type WeightSlot,
} from '../db/repos';
import { type DayKey } from '../health/dates';
import { emitPlanChange } from './events';
import { writeHcNutrition, writeHcWeight } from './hc';
import { loadPlanSettings } from './store';

export async function logWeight(w: { day: DayKey; slot: WeightSlot; kg: number; time?: Date }): Promise<void> {
  await weightLogs.add({ ...w, source: 'bloom' });
  emitPlanChange();
  const s = await loadPlanSettings().catch(() => null);
  if (s?.hcWriteWeight) void writeHcWeight(Math.round(w.kg * 10) / 10, w.time ?? new Date());
}

export async function updateWeight(id: number, w: { day: DayKey; slot: WeightSlot; kg: number }): Promise<void> {
  await weightLogs.update(id, w);
  emitPlanChange();
}

export async function removeWeight(id: number): Promise<void> {
  await weightLogs.remove(id);
  emitPlanChange();
}

export async function logFood(e: NewFoodEntry): Promise<number> {
  const id = await foodEntries.add(e);
  emitPlanChange();
  const s = await loadPlanSettings().catch(() => null);
  if (s?.hcWriteNutrition) void writeHcNutrition({ ...e, time: new Date() });
  return id;
}

/** Saves several items at once (AI quick add). */
export async function logFoods(list: NewFoodEntry[]): Promise<void> {
  for (const e of list) await foodEntries.add(e);
  emitPlanChange();
  const s = await loadPlanSettings().catch(() => null);
  if (s?.hcWriteNutrition) for (const e of list) void writeHcNutrition({ ...e, time: new Date() });
}

export async function updateFood(id: number, e: NewFoodEntry): Promise<void> {
  await foodEntries.update(id, e);
  emitPlanChange();
}

export async function removeFood(id: number): Promise<void> {
  await foodEntries.remove(id);
  emitPlanChange();
}

export async function addCustomFood(f: Omit<CustomFood, 'id'>): Promise<number> {
  const id = await customFoods.add(f);
  emitPlanChange();
  return id;
}

export async function toggleFavourite(key: string): Promise<boolean> {
  const on = await favourites.toggle(key);
  emitPlanChange();
  return on;
}

export async function setWater(day: DayKey, ml: number): Promise<void> {
  await water.set(day, ml);
  emitPlanChange();
}
