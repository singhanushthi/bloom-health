/**
 * Barcode lookup via Open Food Facts (free, no key, open data — https://world.openfoodfacts.org).
 *
 * API v2: GET https://world.openfoodfacts.org/api/v2/product/{barcode}.json?fields=…
 * Response: { code, status: 1 | 0, status_verbose, product: { … } } (status 0 = not found).
 * Nutrition comes from product.nutriments with per-100 g keys: "energy-kcal_100g",
 * "proteins_100g", "carbohydrates_100g", "fat_100g", "saturated-fat_100g", "sugars_100g",
 * "fiber_100g", "salt_100g" (fallback "sodium_100g" × 2.5, "energy_100g" kJ ÷ 4.184).
 * Nutri-Score: product.nutriscore_grade (older field name: nutrition_grades).
 * OFF asks apps to send a descriptive User-Agent.
 *
 * Only the barcode is sent — nothing about the user.
 */
import { getIngredient, type PantryCategory } from './ingredients';
import { normalizeNutriscore } from './healthCheck';
import { guessIngredientKey } from './parse';
import type { Nutrition100, PantryDraft } from './pantry';

export const OFF_BASE = 'https://world.openfoodfacts.org/api/v2/product';
export const OFF_FIELDS = 'product_name,brands,nutriments,nutriscore_grade,nutrition_grades,ingredients_text,serving_size';
export const OFF_USER_AGENT = 'Bloom/1.1 (personal app)';

export type OffFetch = (url: string, init: { headers: Record<string, string>; signal?: AbortSignal }) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;

export interface OffProduct {
  barcode: string;
  name: string;
  brand: string | null;
  nutritionPer100g: Nutrition100 | null;
  nutriscore: string | null;
  ingredientsText: string | null;
  servingSize: string | null;
  ingredientKey: string | null;
  category: PantryCategory;
}

export type OffResult = { status: 'found'; product: OffProduct } | { status: 'not-found'; barcode: string } | { status: 'error'; message: string };

/** EAN-13, EAN-8, UPC-A (12) and UPC-E (8) are all digits only. */
export function isValidBarcode(code: string): boolean {
  return /^\d{8}$|^\d{12,14}$/.test(code.trim());
}

export function offUrl(barcode: string): string {
  return `${OFF_BASE}/${encodeURIComponent(barcode.trim())}.json?fields=${OFF_FIELDS}`;
}

const num = (v: unknown): number | null => {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v.replace(',', '.')) : NaN;
  return Number.isFinite(n) && n >= 0 ? n : null;
};
const r1 = (n: number) => Math.round(n * 10) / 10;

/** Map OFF nutriments to Bloom's per-100 g shape; null when there's not enough to be useful. */
export function mapNutriments(nm: Record<string, unknown> | null | undefined): Nutrition100 | null {
  if (!nm || typeof nm !== 'object') return null;
  let kcal = num(nm['energy-kcal_100g']);
  if (kcal === null) {
    const kj = num(nm['energy-kj_100g']) ?? num(nm['energy_100g']);
    if (kj !== null) kcal = kj / 4.184;
  }
  const protein = num(nm['proteins_100g']);
  const carbs = num(nm['carbohydrates_100g']);
  const fat = num(nm['fat_100g']);
  let salt = num(nm['salt_100g']);
  if (salt === null) {
    const sodium = num(nm['sodium_100g']);
    if (sodium !== null) salt = sodium * 2.5;
  }
  const sugar = num(nm['sugars_100g']);
  const fiber = num(nm['fiber_100g']);
  const sat = num(nm['saturated-fat_100g']);
  if (kcal === null && protein === null && carbs === null && fat === null) return null;
  const out: Nutrition100 = {
    kcal: Math.min(900, Math.round(kcal ?? 0)),
    protein: Math.min(100, r1(protein ?? 0)),
    carbs: Math.min(100, r1(carbs ?? 0)),
    fat: Math.min(100, r1(fat ?? 0)),
    fiber: Math.min(100, r1(fiber ?? 0)),
    sugar: Math.min(100, r1(sugar ?? 0)),
    salt: Math.min(100, Math.round((salt ?? 0) * 100) / 100),
  };
  if (sat !== null) out.satFat = Math.min(100, r1(sat));
  return out;
}

/** Map an OFF v2 response body. Returns null if the product isn't there. */
export function mapOffResponse(body: unknown, barcode: string): OffProduct | null {
  const b = body as { status?: unknown; product?: Record<string, unknown> } | null;
  if (!b || typeof b !== 'object') return null;
  const found = b.status === 1 || b.status === '1' || b.status === 'success' || b.status === 'success_with_warnings';
  const p = b.product;
  if (!found || !p || typeof p !== 'object') return null;
  const rawName = typeof p.product_name === 'string' ? p.product_name.trim() : '';
  const brand = typeof p.brands === 'string' && p.brands.trim() ? p.brands.split(',')[0].trim().slice(0, 60) : null;
  const name = (rawName || (brand ? `${brand} product` : `Product ${barcode}`)).slice(0, 80);
  const key = guessIngredientKey(rawName);
  const ing = key ? getIngredient(key) : undefined;
  return {
    barcode,
    name,
    brand,
    nutritionPer100g: mapNutriments(p.nutriments as Record<string, unknown> | undefined),
    nutriscore: normalizeNutriscore(p.nutriscore_grade) ?? normalizeNutriscore(p.nutrition_grades),
    ingredientsText: typeof p.ingredients_text === 'string' && p.ingredients_text.trim() ? p.ingredients_text.trim().slice(0, 600) : null,
    servingSize: typeof p.serving_size === 'string' && p.serving_size.trim() ? p.serving_size.trim().slice(0, 40) : null,
    ingredientKey: ing?.key ?? null,
    // Fresh-ish matches (paneer, curd, atta) keep their aisle; everything else is "Packaged".
    category: ing && ing.category !== 'spices-oil' ? ing.category : 'packaged',
  };
}

export function productToDraft(p: OffProduct): PantryDraft {
  return {
    name: p.name,
    brand: p.brand,
    barcode: p.barcode,
    ingredientKey: p.ingredientKey,
    category: p.category,
    nutritionPer100g: p.nutritionPer100g,
    nutriscore: p.nutriscore ? p.nutriscore.toLowerCase() : null,
    source: 'barcode',
  };
}

const defaultFetch: OffFetch = (url, init) => globalThis.fetch(url, init) as unknown as ReturnType<OffFetch>;

export async function lookupBarcode(barcode: string, opts: { fetchImpl?: OffFetch; signal?: AbortSignal } = {}): Promise<OffResult> {
  const code = barcode.trim();
  if (!isValidBarcode(code)) return { status: 'error', message: 'That doesn’t look like a product barcode. Try scanning again.' };
  try {
    const res = await (opts.fetchImpl ?? defaultFetch)(offUrl(code), {
      headers: { 'User-Agent': OFF_USER_AGENT, Accept: 'application/json' },
      signal: opts.signal,
    });
    if (res.status === 404) return { status: 'not-found', barcode: code };
    if (!res.ok) return { status: 'error', message: 'Open Food Facts didn’t answer right now. You can add the product by hand.' };
    const p = mapOffResponse(await res.json(), code);
    return p ? { status: 'found', product: p } : { status: 'not-found', barcode: code };
  } catch {
    return { status: 'error', message: 'Couldn’t reach Open Food Facts. Check your internet, or add the product by hand.' };
  }
}

