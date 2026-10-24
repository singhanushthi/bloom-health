/**
 * In-memory hand-off between Kitchen screens (avoids stuffing large JSON into route params):
 *  - the product found by a barcode scan → the product form;
 *  - an unsaved AI recipe → the recipe screen.
 */
import type { Recipe } from '../content/recipes';
import type { PantryDraft } from './pantry';

let pendingProduct: { draft: PantryDraft; from: 'off' | 'not-found' } | null = null;
const pendingRecipes = new Map<string, Recipe>();

export function setPendingProduct(p: { draft: PantryDraft; from: 'off' | 'not-found' } | null): void {
  pendingProduct = p;
}

export function takePendingProduct(): { draft: PantryDraft; from: 'off' | 'not-found' } | null {
  const p = pendingProduct;
  pendingProduct = null;
  return p;
}

export function putPendingRecipe(r: Recipe): void {
  pendingRecipes.set(r.id, r);
  // Keep only a handful.
  while (pendingRecipes.size > 5) pendingRecipes.delete(pendingRecipes.keys().next().value as string);
}

export function getPendingRecipe(id: string): Recipe | null {
  return pendingRecipes.get(id) ?? null;
}
