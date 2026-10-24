/**
 * Kitchen storage: pantry items, shopping list and "My recipes" — on this phone only.
 *
 * Tables are created lazily (CREATE TABLE IF NOT EXISTS) after src/db/schema.ts migrations, so the
 * shared schema/migrations stay untouched. Demo mode uses an in-memory store with the same API
 * (seeded with a sample kitchen) so nothing demo-related is ever written to SQLite.
 */
import type { Recipe } from '../content/recipes';
import type { SqlDriver, SqlValue } from '../db/driver';
import { db as migratedDb } from '../db/schema';
import { ValidationError } from '../db/repos';
import { addDays, diffDays, todayKey, type DayKey } from '../health/dates';
import { emitKitchenChange } from './events';
import { getIngredient, PANTRY_CATEGORIES, type Ingredient, type PantryCategory } from './ingredients';

export interface Nutrition100 {
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber: number;
  sugar: number;
  salt: number;
  /** Saturated fat, when the label/Open Food Facts provides it. */
  satFat?: number | null;
}

export type PantrySource = 'manual' | 'barcode';

export interface PantryItem {
  id: number;
  name: string;
  ingredientKey: string | null;
  quantity: number | null;
  unit: string | null;
  category: PantryCategory;
  addedAt: string;
  expiresOn: DayKey | null;
  barcode: string | null;
  nutritionPer100g: Nutrition100 | null;
  nutriscore: string | null;
  brand: string | null;
  source: PantrySource;
  usedUp: boolean;
}

export type PantryDraft = {
  name: string;
  ingredientKey?: string | null;
  quantity?: number | null;
  unit?: string | null;
  category?: PantryCategory;
  expiresOn?: DayKey | null;
  barcode?: string | null;
  nutritionPer100g?: Nutrition100 | null;
  nutriscore?: string | null;
  brand?: string | null;
  source?: PantrySource;
};

export type PantryPatch = Partial<Omit<PantryItem, 'id' | 'addedAt'>>;

export interface ShoppingItem {
  id: number;
  name: string;
  ingredientKey: string | null;
  done: boolean;
  addedAt: string;
}

/* ------------------------------ Validation ------------------------------ */

export const NAME_MAX = 80;
export const NUTRITION_LIMITS: Record<keyof Omit<Nutrition100, 'satFat'>, number> = {
  kcal: 900,
  protein: 100,
  carbs: 100,
  fat: 100,
  fiber: 100,
  sugar: 100,
  salt: 100,
};

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

export function validateDraft(d: PantryDraft): void {
  const name = (d.name ?? '').trim();
  if (!name) throw new ValidationError('name', 'Give the item a name.');
  if (name.length > NAME_MAX) throw new ValidationError('name', `Keep the name under ${NAME_MAX} characters.`);
  if (d.quantity != null && (!Number.isFinite(d.quantity) || d.quantity < 0 || d.quantity > 100000))
    throw new ValidationError('quantity', 'Enter a quantity between 0 and 100000.');
  if (d.expiresOn && !DAY_RE.test(d.expiresOn)) throw new ValidationError('expiresOn', 'Use a valid date.');
  if (d.category && !PANTRY_CATEGORIES.includes(d.category)) throw new ValidationError('category', 'Pick a category.');
  const n = d.nutritionPer100g;
  if (n) {
    for (const [k, max] of Object.entries(NUTRITION_LIMITS) as [keyof typeof NUTRITION_LIMITS, number][]) {
      const v = n[k];
      if (!Number.isFinite(v) || v < 0 || v > max) throw new ValidationError(k, `Enter ${k === 'kcal' ? 'kcal' : 'grams'} between 0 and ${max} per 100 g.`);
    }
    if (n.satFat != null && (!Number.isFinite(n.satFat) || n.satFat < 0 || n.satFat > 100))
      throw new ValidationError('satFat', 'Enter grams between 0 and 100 per 100 g.');
  }
}

/* -------------------------------- Helpers ------------------------------- */

/** Fresh items get an estimated "use by" from typical shelf life; dry goods don't. */
export function estimatedExpiry(ing: Ingredient, today: DayKey): DayKey | null {
  return ing.shelfDays && ing.shelfDays <= 30 ? addDays(today, ing.shelfDays) : null;
}

export function draftFromIngredient(ing: Ingredient, today: DayKey = todayKey()): PantryDraft {
  return { name: ing.name, ingredientKey: ing.key, category: ing.category, expiresOn: estimatedExpiry(ing, today), source: 'manual' };
}

export type ExpiryState = 'expired' | 'today' | 'soon' | 'ok' | 'none';

export const EXPIRING_SOON_DAYS = 2;

export function expiryState(item: Pick<PantryItem, 'expiresOn'>, today: DayKey): ExpiryState {
  if (!item.expiresOn) return 'none';
  const d = diffDays(today, item.expiresOn);
  if (d < 0) return 'expired';
  if (d === 0) return 'today';
  if (d <= EXPIRING_SOON_DAYS) return 'soon';
  return 'ok';
}

/** Friendly text for the expiry chip (never alarming). */
export function expiryText(item: Pick<PantryItem, 'expiresOn'>, today: DayKey): string | null {
  if (!item.expiresOn) return null;
  const d = diffDays(today, item.expiresOn);
  if (d < 0) return 'Past its date — give it a check';
  if (d === 0) return 'Use today';
  if (d === 1) return 'Use by tomorrow';
  if (d <= EXPIRING_SOON_DAYS) return `Use within ${d} days`;
  return null;
}

/** Ingredient keys available for cooking (active items only). */
export function pantryKeys(items: PantryItem[]): string[] {
  return Array.from(new Set(items.filter((i) => !i.usedUp && i.ingredientKey).map((i) => i.ingredientKey as string)));
}

/** Items grouped by category, in category order; empty groups dropped. */
export function groupByCategory(items: PantryItem[]): { category: PantryCategory; items: PantryItem[] }[] {
  return PANTRY_CATEGORIES.map((category) => ({
    category,
    items: items.filter((i) => i.category === category).sort((a, b) => a.name.localeCompare(b.name)),
  })).filter((g) => g.items.length);
}

/* ------------------------------- Interfaces ----------------------------- */

export interface PantryRepo {
  list(opts?: { includeUsed?: boolean }): Promise<PantryItem[]>;
  get(id: number): Promise<PantryItem | null>;
  add(d: PantryDraft): Promise<number>;
  /** Adds several; skips ingredients already in the pantry (active). Returns new ids. */
  addMany(ds: PantryDraft[]): Promise<number[]>;
  update(id: number, patch: PantryPatch): Promise<void>;
  setUsedUp(id: number, usedUp: boolean): Promise<void>;
  remove(id: number): Promise<void>;
  clear(): Promise<void>;
}

export interface ShoppingRepo {
  list(): Promise<ShoppingItem[]>;
  /** Adds unless an item with the same name/ingredient is already on the list (not done). */
  add(name: string, ingredientKey?: string | null): Promise<number | null>;
  toggle(id: number): Promise<void>;
  remove(id: number): Promise<void>;
  clearDone(): Promise<void>;
}

export interface MyRecipesRepo {
  list(): Promise<Recipe[]>;
  get(id: string): Promise<Recipe | null>;
  save(r: Recipe): Promise<string>;
  remove(id: string): Promise<void>;
}

export interface KitchenRepos {
  pantry: PantryRepo;
  shopping: ShoppingRepo;
  myRecipes: MyRecipesRepo;
}

/* --------------------------------- SQLite ------------------------------- */

const TABLES = `
CREATE TABLE IF NOT EXISTS kitchen_pantry (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  ingredient_key TEXT,
  quantity REAL,
  unit TEXT,
  category TEXT NOT NULL,
  added_at TEXT NOT NULL,
  expires_on TEXT,
  barcode TEXT,
  nutrition TEXT,
  nutriscore TEXT,
  brand TEXT,
  source TEXT NOT NULL DEFAULT 'manual',
  used_up INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS kitchen_shopping (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  ingredient_key TEXT,
  done INTEGER NOT NULL DEFAULT 0,
  added_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS kitchen_recipes (
  id TEXT PRIMARY KEY,
  json TEXT NOT NULL,
  saved_at TEXT NOT NULL
);`;

let readyFor: SqlDriver | null = null;
let ready: Promise<SqlDriver> | null = null;

async function kdb(): Promise<SqlDriver> {
  // Wait for the main schema migrations first so this never races them on first launch.
  const d = await migratedDb();
  if (!ready || readyFor !== d) {
    readyFor = d;
    ready = d.exec(TABLES).then(
      () => d,
      (e) => {
        ready = null;
        readyFor = null;
        throw e;
      }
    );
  }
  return ready;
}

interface PantryRow {
  id: number;
  name: string;
  ingredient_key: string | null;
  quantity: number | null;
  unit: string | null;
  category: string;
  added_at: string;
  expires_on: string | null;
  barcode: string | null;
  nutrition: string | null;
  nutriscore: string | null;
  brand: string | null;
  source: string;
  used_up: number;
}

function parseNutrition(s: string | null): Nutrition100 | null {
  if (!s) return null;
  try {
    const j = JSON.parse(s) as Nutrition100;
    return j && typeof j.kcal === 'number' ? j : null;
  } catch {
    return null;
  }
}

const toItem = (r: PantryRow): PantryItem => ({
  id: r.id,
  name: r.name,
  ingredientKey: r.ingredient_key,
  quantity: r.quantity,
  unit: r.unit,
  category: (PANTRY_CATEGORIES as string[]).includes(r.category) ? (r.category as PantryCategory) : 'other',
  addedAt: r.added_at,
  expiresOn: r.expires_on,
  barcode: r.barcode,
  nutritionPer100g: parseNutrition(r.nutrition),
  nutriscore: r.nutriscore,
  brand: r.brand,
  source: r.source === 'barcode' ? 'barcode' : 'manual',
  usedUp: !!r.used_up,
});

function normalizeDraft(d: PantryDraft): Omit<PantryItem, 'id' | 'addedAt' | 'usedUp'> {
  const ing = d.ingredientKey ? getIngredient(d.ingredientKey) : undefined;
  return {
    name: d.name.trim(),
    ingredientKey: ing ? ing.key : null,
    quantity: d.quantity ?? null,
    unit: d.unit?.trim() || null,
    category: d.category ?? ing?.category ?? 'other',
    expiresOn: d.expiresOn ?? null,
    barcode: d.barcode ?? null,
    nutritionPer100g: d.nutritionPer100g ?? null,
    nutriscore: d.nutriscore ?? null,
    brand: d.brand?.trim() || null,
    source: d.source ?? 'manual',
  };
}

const nowIso = () => new Date().toISOString();

const sqlPantry: PantryRepo = {
  async list(opts = {}) {
    const d = await kdb();
    const rows = await d.all<PantryRow>(
      `SELECT * FROM kitchen_pantry ${opts.includeUsed ? '' : 'WHERE used_up = 0'} ORDER BY used_up, category, name COLLATE NOCASE`
    );
    return rows.map(toItem);
  },
  async get(id) {
    const d = await kdb();
    const r = await d.first<PantryRow>('SELECT * FROM kitchen_pantry WHERE id = ?', [id]);
    return r ? toItem(r) : null;
  },
  async add(draft) {
    validateDraft(draft);
    const n = normalizeDraft(draft);
    const d = await kdb();
    const r = await d.run(
      `INSERT INTO kitchen_pantry (name, ingredient_key, quantity, unit, category, added_at, expires_on, barcode, nutrition, nutriscore, brand, source, used_up)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`,
      [
        n.name,
        n.ingredientKey,
        n.quantity,
        n.unit,
        n.category,
        nowIso(),
        n.expiresOn,
        n.barcode,
        n.nutritionPer100g ? JSON.stringify(n.nutritionPer100g) : null,
        n.nutriscore,
        n.brand,
        n.source,
      ]
    );
    emitKitchenChange();
    return r.lastInsertRowId;
  },
  async addMany(ds) {
    const existing = new Set(pantryKeys(await sqlPantry.list()));
    const ids: number[] = [];
    for (const dr of ds) {
      if (dr.ingredientKey && existing.has(dr.ingredientKey)) continue;
      ids.push(await sqlPantry.add(dr));
      if (dr.ingredientKey) existing.add(dr.ingredientKey);
    }
    return ids;
  },
  async update(id, patch) {
    const cur = await sqlPantry.get(id);
    if (!cur) throw new ValidationError('id', 'That item is no longer in your kitchen.');
    const next = { ...cur, ...patch };
    validateDraft(next);
    const d = await kdb();
    const fields: [string, SqlValue][] = [
      ['name', next.name.trim()],
      ['ingredient_key', next.ingredientKey && getIngredient(next.ingredientKey) ? next.ingredientKey : null],
      ['quantity', next.quantity ?? null],
      ['unit', next.unit?.trim() || null],
      ['category', next.category],
      ['expires_on', next.expiresOn ?? null],
      ['barcode', next.barcode ?? null],
      ['nutrition', next.nutritionPer100g ? JSON.stringify(next.nutritionPer100g) : null],
      ['nutriscore', next.nutriscore ?? null],
      ['brand', next.brand?.trim() || null],
      ['source', next.source],
      ['used_up', next.usedUp ? 1 : 0],
    ];
    await d.run(`UPDATE kitchen_pantry SET ${fields.map(([k]) => `${k} = ?`).join(', ')} WHERE id = ?`, [...fields.map(([, v]) => v), id]);
    emitKitchenChange();
  },
  async setUsedUp(id, usedUp) {
    const d = await kdb();
    await d.run('UPDATE kitchen_pantry SET used_up = ? WHERE id = ?', [usedUp ? 1 : 0, id]);
    emitKitchenChange();
  },
  async remove(id) {
    const d = await kdb();
    await d.run('DELETE FROM kitchen_pantry WHERE id = ?', [id]);
    emitKitchenChange();
  },
  async clear() {
    const d = await kdb();
    await d.run('DELETE FROM kitchen_pantry');
    emitKitchenChange();
  },
};

interface ShopRow {
  id: number;
  name: string;
  ingredient_key: string | null;
  done: number;
  added_at: string;
}
const toShop = (r: ShopRow): ShoppingItem => ({ id: r.id, name: r.name, ingredientKey: r.ingredient_key, done: !!r.done, addedAt: r.added_at });

const sameItem = (a: { name: string; ingredientKey: string | null }, name: string, key: string | null) =>
  (key && a.ingredientKey === key) || a.name.trim().toLowerCase() === name.trim().toLowerCase();

const sqlShopping: ShoppingRepo = {
  async list() {
    const d = await kdb();
    return (await d.all<ShopRow>('SELECT * FROM kitchen_shopping ORDER BY done, id')).map(toShop);
  },
  async add(name, ingredientKey = null) {
    const n = name.trim();
    if (!n) throw new ValidationError('name', 'Type what you need to buy.');
    if (n.length > NAME_MAX) throw new ValidationError('name', `Keep it under ${NAME_MAX} characters.`);
    const list = await sqlShopping.list();
    if (list.some((s) => !s.done && sameItem(s, n, ingredientKey))) return null;
    const d = await kdb();
    const r = await d.run('INSERT INTO kitchen_shopping (name, ingredient_key, done, added_at) VALUES (?, ?, 0, ?)', [n, ingredientKey, nowIso()]);
    emitKitchenChange();
    return r.lastInsertRowId;
  },
  async toggle(id) {
    const d = await kdb();
    await d.run('UPDATE kitchen_shopping SET done = 1 - done WHERE id = ?', [id]);
    emitKitchenChange();
  },
  async remove(id) {
    const d = await kdb();
    await d.run('DELETE FROM kitchen_shopping WHERE id = ?', [id]);
    emitKitchenChange();
  },
  async clearDone() {
    const d = await kdb();
    await d.run('DELETE FROM kitchen_shopping WHERE done = 1');
    emitKitchenChange();
  },
};

const sqlMyRecipes: MyRecipesRepo = {
  async list() {
    const d = await kdb();
    const rows = await d.all<{ json: string }>('SELECT json FROM kitchen_recipes ORDER BY saved_at DESC');
    return rows.flatMap((r) => {
      try {
        return [JSON.parse(r.json) as Recipe];
      } catch {
        return [];
      }
    });
  },
  async get(id) {
    const d = await kdb();
    const r = await d.first<{ json: string }>('SELECT json FROM kitchen_recipes WHERE id = ?', [id]);
    if (!r) return null;
    try {
      return JSON.parse(r.json) as Recipe;
    } catch {
      return null;
    }
  },
  async save(r) {
    const d = await kdb();
    await d.run(
      `INSERT INTO kitchen_recipes (id, json, saved_at) VALUES (?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET json = excluded.json, saved_at = excluded.saved_at`,
      [r.id, JSON.stringify(r), nowIso()]
    );
    emitKitchenChange();
    return r.id;
  },
  async remove(id) {
    const d = await kdb();
    await d.run('DELETE FROM kitchen_recipes WHERE id = ?', [id]);
    emitKitchenChange();
  },
};

export const sqlKitchen: KitchenRepos = { pantry: sqlPantry, shopping: sqlShopping, myRecipes: sqlMyRecipes };

/** Removes everything the Kitchen stored (for "Delete all my data"). */
export async function clearKitchenData(): Promise<void> {
  const d = await kdb();
  await d.exec('DELETE FROM kitchen_pantry; DELETE FROM kitchen_shopping; DELETE FROM kitchen_recipes;');
  emitKitchenChange();
}

/** Everything the Kitchen stored, for the JSON export. */
export async function exportKitchenData(): Promise<{ pantry: PantryItem[]; shopping: ShoppingItem[]; myRecipes: Recipe[] }> {
  const [pantry, shopping, myRecipes] = await Promise.all([sqlPantry.list({ includeUsed: true }), sqlShopping.list(), sqlMyRecipes.list()]);
  return { pantry, shopping, myRecipes };
}

/* ------------------------------ In-memory ------------------------------- */

/** Same API in memory — used for demo mode (and handy in tests). */
export function memoryKitchen(seed: PantryDraft[] = [], now: Date = new Date()): KitchenRepos {
  let pantry: PantryItem[] = [];
  let shopping: ShoppingItem[] = [];
  const recipes = new Map<string, { r: Recipe; at: number }>();
  let nextId = 1;
  let tick = 0;
  const stamp = () => new Date(now.getTime() + tick++).toISOString();

  const pantryRepo: PantryRepo = {
    async list(opts = {}) {
      return pantry
        .filter((i) => opts.includeUsed || !i.usedUp)
        .sort((a, b) => Number(a.usedUp) - Number(b.usedUp) || a.category.localeCompare(b.category) || a.name.localeCompare(b.name))
        .map((i) => ({ ...i }));
    },
    async get(id) {
      const i = pantry.find((x) => x.id === id);
      return i ? { ...i } : null;
    },
    async add(d) {
      validateDraft(d);
      const item: PantryItem = { ...normalizeDraft(d), id: nextId++, addedAt: stamp(), usedUp: false };
      pantry.push(item);
      emitKitchenChange();
      return item.id;
    },
    async addMany(ds) {
      const existing = new Set(pantryKeys(pantry));
      const ids: number[] = [];
      for (const d of ds) {
        if (d.ingredientKey && existing.has(d.ingredientKey)) continue;
        ids.push(await pantryRepo.add(d));
        if (d.ingredientKey) existing.add(d.ingredientKey);
      }
      return ids;
    },
    async update(id, patch) {
      const i = pantry.findIndex((x) => x.id === id);
      if (i < 0) throw new ValidationError('id', 'That item is no longer in your kitchen.');
      const next = { ...pantry[i], ...patch };
      validateDraft(next);
      pantry[i] = { ...next, ...normalizeDraft(next), id, addedAt: pantry[i].addedAt, usedUp: !!next.usedUp };
      emitKitchenChange();
    },
    async setUsedUp(id, usedUp) {
      pantry = pantry.map((x) => (x.id === id ? { ...x, usedUp } : x));
      emitKitchenChange();
    },
    async remove(id) {
      pantry = pantry.filter((x) => x.id !== id);
      emitKitchenChange();
    },
    async clear() {
      pantry = [];
      emitKitchenChange();
    },
  };

  const shoppingRepo: ShoppingRepo = {
    async list() {
      return [...shopping].sort((a, b) => Number(a.done) - Number(b.done) || a.id - b.id).map((s) => ({ ...s }));
    },
    async add(name, ingredientKey = null) {
      const n = name.trim();
      if (!n) throw new ValidationError('name', 'Type what you need to buy.');
      if (shopping.some((s) => !s.done && sameItem(s, n, ingredientKey))) return null;
      const s: ShoppingItem = { id: nextId++, name: n, ingredientKey, done: false, addedAt: stamp() };
      shopping.push(s);
      emitKitchenChange();
      return s.id;
    },
    async toggle(id) {
      shopping = shopping.map((s) => (s.id === id ? { ...s, done: !s.done } : s));
      emitKitchenChange();
    },
    async remove(id) {
      shopping = shopping.filter((s) => s.id !== id);
      emitKitchenChange();
    },
    async clearDone() {
      shopping = shopping.filter((s) => !s.done);
      emitKitchenChange();
    },
  };

  const myRecipesRepo: MyRecipesRepo = {
    async list() {
      return Array.from(recipes.values())
        .sort((a, b) => b.at - a.at)
        .map((x) => x.r);
    },
    async get(id) {
      return recipes.get(id)?.r ?? null;
    },
    async save(r) {
      recipes.set(r.id, { r, at: tick++ });
      emitKitchenChange();
      return r.id;
    },
    async remove(id) {
      recipes.delete(id);
      emitKitchenChange();
    },
  };

  // Seed synchronously so the first list() already has the demo kitchen.
  for (const d of seed) {
    validateDraft(d);
    pantry.push({ ...normalizeDraft(d), id: nextId++, addedAt: stamp(), usedUp: false });
  }

  return { pantry: pantryRepo, shopping: shoppingRepo, myRecipes: myRecipesRepo };
}
