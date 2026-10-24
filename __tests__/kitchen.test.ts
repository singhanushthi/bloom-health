jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

import { RECIPES, getRecipe, type Recipe } from '../src/content/recipes';
import { setDriver } from '../src/db/driver';
import { ValidationError } from '../src/db/repos';
import { aiMakeRecipe, AiRecipeError, buildRecipePrompt, parseAiRecipe } from '../src/kitchen/aiRecipe';
import { demoKitchen, demoPantryDrafts, resetDemoKitchen } from '../src/kitchen/demo';
import { healthCheck, levelOf, THRESHOLDS } from '../src/kitchen/healthCheck';
import { getIngredient } from '../src/kitchen/ingredients';
import {
  almostThere,
  cookNow,
  fitsRecipeDiet,
  isAvailable,
  mealBudget,
  mealForHour,
  missingForShopping,
  rankRecipes,
  shoppingListText,
} from '../src/kitchen/match';
import { isValidBarcode, lookupBarcode, mapNutriments, mapOffResponse, offUrl, OFF_USER_AGENT, productToDraft } from '../src/kitchen/off';
import {
  clearKitchenData,
  draftFromIngredient,
  expiryState,
  expiryText,
  groupByCategory,
  memoryKitchen,
  pantryKeys,
  sqlKitchen,
  validateDraft,
} from '../src/kitchen/pantry';
import { guessIngredientKey, parseFreeText } from '../src/kitchen/parse';
import { memoryDriver } from '../test-utils/memoryDriver';

/* ---------------------------- Health check ----------------------------- */

describe('product health check', () => {
  const base = { kcal: 100, protein: 2, carbs: 10, fat: 1, fiber: 1, sugar: 1, salt: 0.1 };

  it('uses the FSA thresholds (boundaries inclusive on the low side)', () => {
    expect(levelOf(5, THRESHOLDS.sugar)).toBe('low');
    expect(levelOf(5.1, THRESHOLDS.sugar)).toBe('medium');
    expect(levelOf(22.5, THRESHOLDS.sugar)).toBe('medium');
    expect(levelOf(22.6, THRESHOLDS.sugar)).toBe('high');
    expect(levelOf(0.3, THRESHOLDS.salt)).toBe('low');
    expect(levelOf(1.51, THRESHOLDS.salt)).toBe('high');
    expect(levelOf(3, THRESHOLDS.fat)).toBe('low');
    expect(levelOf(17.6, THRESHOLDS.fat)).toBe('high');
  });

  it('labels everyday, sometimes and treat foods', () => {
    expect(healthCheck({ ...base, kcal: 380, protein: 13, carbs: 58, fat: 6.5, fiber: 10, satFat: 1.2 }).label).toBe('everyday'); // oats
    const biscuit = healthCheck({ kcal: 490, protein: 6, carbs: 70, fat: 21, fiber: 1.5, sugar: 32, salt: 0.6, satFat: 10.5 }, 'e');
    expect(biscuit.label).toBe('treat');
    expect(biscuit.message).toMatch(/small portions/);
    expect(biscuit.nutriscore).toBe('E');
    const bhujia = healthCheck({ kcal: 550, protein: 13, carbs: 40, fat: 35, fiber: 6, sugar: 3, salt: 2.0, satFat: 10 });
    expect(bhujia.label).toBe('sometimes');
  });

  it('gives protein and fibre a bonus (paneer is fine every day)', () => {
    const paneer = healthCheck({ kcal: 265, protein: 18, carbs: 2, fat: 20, fiber: 0, sugar: 2, salt: 0.05, satFat: 13 });
    expect(paneer.label).toBe('everyday');
    expect(paneer.positives[0]).toMatch(/protein/);
  });

  it('never calls a sugary drink "everyday"', () => {
    const cola = healthCheck({ kcal: 42, protein: 0, carbs: 10.6, fat: 0, fiber: 0, sugar: 10.6, salt: 0.01 });
    expect(cola.label).toBe('sometimes');
  });

  it('falls back to total fat when saturated fat is unknown and describes levels in words', () => {
    const r = healthCheck({ ...base, fat: 20 });
    expect(r.rows.map((x) => x.key)).toEqual(['sugar', 'salt', 'fat']);
    expect(r.rows[2].level).toBe('high');
    expect(r.summary).toMatch(/fat 20 grams, high/);
    expect(r.summary).not.toMatch(/bad|unhealthy|avoid/i);
  });
});

/* --------------------------- Open Food Facts --------------------------- */

const OFF_FIXTURE = {
  code: '8901063010031',
  status: 1,
  status_verbose: 'product found',
  product: {
    product_name: 'Malai Paneer',
    brands: 'Dairy Co, Other Brand',
    nutriscore_grade: 'c',
    serving_size: '50 g',
    ingredients_text: 'Milk solids, citric acid',
    nutriments: {
      'energy-kcal_100g': 288,
      proteins_100g: 18.9,
      carbohydrates_100g: 2.6,
      fat_100g: 22.5,
      'saturated-fat_100g': 14.1,
      sugars_100g: 2.6,
      fiber_100g: 0,
      salt_100g: 0.06,
    },
  },
};

describe('Open Food Facts mapping', () => {
  it('builds the v2 URL with the requested fields', () => {
    expect(offUrl('8901063010031')).toBe(
      'https://world.openfoodfacts.org/api/v2/product/8901063010031.json?fields=product_name,brands,nutriments,nutriscore_grade,nutrition_grades,ingredients_text,serving_size'
    );
    expect(isValidBarcode('8901063010031')).toBe(true);
    expect(isValidBarcode('12345678')).toBe(true);
    expect(isValidBarcode('012345678905')).toBe(true);
    expect(isValidBarcode('abc')).toBe(false);
  });

  it('maps a found product to a pantry draft with per-100 g nutrition', () => {
    const p = mapOffResponse(OFF_FIXTURE, '8901063010031')!;
    expect(p).toMatchObject({ name: 'Malai Paneer', brand: 'Dairy Co', nutriscore: 'C', ingredientKey: 'paneer', category: 'dairy', servingSize: '50 g' });
    expect(p.nutritionPer100g).toEqual({ kcal: 288, protein: 18.9, carbs: 2.6, fat: 22.5, fiber: 0, sugar: 2.6, salt: 0.06, satFat: 14.1 });
    const d = productToDraft(p);
    expect(d).toMatchObject({ source: 'barcode', barcode: '8901063010031', nutriscore: 'c' });
    expect(() => validateDraft(d)).not.toThrow();
  });

  it('handles kJ-only energy, sodium-only salt, string numbers and not-found', () => {
    expect(mapNutriments({ energy_100g: 1674, sodium_100g: 0.4, proteins_100g: '10,5', fat_100g: 5 })).toMatchObject({ kcal: 400, salt: 1, protein: 10.5 });
    expect(mapNutriments({})).toBeNull();
    expect(mapOffResponse({ status: 0, status_verbose: 'product not found' }, '123')).toBeNull();
    const unknown = mapOffResponse({ status: 1, product: { product_name: 'Choco Wafers', nutriments: { 'energy-kcal_100g': 520 } } }, '89000')!;
    expect(unknown.category).toBe('packaged');
    expect(unknown.ingredientKey).toBeNull();
  });

  it('looks up with a User-Agent and reports not-found / errors kindly', async () => {
    const calls: { url: string; headers: Record<string, string> }[] = [];
    const ok = await lookupBarcode('8901063010031', {
      fetchImpl: async (url, init) => {
        calls.push({ url, headers: init.headers });
        return { ok: true, status: 200, json: async () => OFF_FIXTURE };
      },
    });
    expect(ok.status).toBe('found');
    expect(calls[0].headers['User-Agent']).toBe(OFF_USER_AGENT);
    const nf = await lookupBarcode('8901063010031', { fetchImpl: async () => ({ ok: true, status: 200, json: async () => ({ status: 0 }) }) });
    expect(nf).toEqual({ status: 'not-found', barcode: '8901063010031' });
    const err = await lookupBarcode('8901063010031', {
      fetchImpl: async () => {
        throw new Error('offline');
      },
    });
    expect(err.status).toBe('error');
    expect((await lookupBarcode('xyz')).status).toBe('error');
  });
});

/* ------------------------------ Free text ------------------------------ */

describe('free-text parsing', () => {
  it('finds ingredients by English, Hinglish and Hindi names with plurals', () => {
    const r = parseFreeText('I have paneer, palak, 2 onions aur tamatar, eggs and दही');
    expect(r.keys).toEqual(['paneer', 'spinach', 'onion', 'tomato', 'egg', 'curd']);
    expect(r.unknown).toEqual([]);
  });

  it('prefers the longest match and keeps unknown words separate', () => {
    const r = parseFreeText('kidney beans, green moong, quinoa flakes, dragonfruit, oyster sauce');
    expect(r.keys).toContain('rajma');
    expect(r.keys).toContain('whole-moong');
    expect(r.keys).not.toContain('french-beans');
    expect(r.unknown).toEqual(expect.arrayContaining(['dragonfruit', 'oyster sauce']));
  });

  it('does not match inside other words', () => {
    expect(parseFreeText('peanut butter').keys).toEqual(['peanut-butter']);
    expect(parseFreeText('shallots').keys).toEqual([]);
    expect(parseFreeText('').keys).toEqual([]);
  });

  it('guesses an ingredient for product names', () => {
    expect(guessIngredientKey('Amul Malai Paneer 200g')).toBe('paneer');
    expect(guessIngredientKey('Quaker Rolled Oats')).toBe('oats');
    expect(guessIngredientKey('Choco Wafers')).toBeNull();
  });
});

/* ------------------------------- Matcher ------------------------------- */

describe('recipe matcher', () => {
  const kitchen = ['moong-dal', 'tomato', 'ginger', 'green-chilli', 'paneer', 'onion', 'capsicum', 'rice', 'curd', 'cucumber', 'spinach', 'garlic'];

  it('treats basics and substitutes as available', () => {
    const have = new Set(['tofu', 'brown-rice']);
    expect(isAvailable('salt', have)).toBe(true);
    expect(isAvailable('oil', have)).toBe(true);
    expect(isAvailable('paneer', have)).toBe(true);
    expect(isAvailable('rice', have)).toBe(true);
    expect(isAvailable('egg', have)).toBe(false);
  });

  it('ranks fully covered recipes first and lists what is missing', () => {
    const m = rankRecipes({ recipes: RECIPES, pantryKeys: kitchen, diet: 'veg' });
    const now = cookNow(m, 50).map((x) => x.recipe.id);
    expect(now).toEqual(expect.arrayContaining(['moong-dal-chilla', 'paneer-bhurji', 'curd-rice']));
    expect(cookNow(m, 50).every((x) => x.missing.length === 0)).toBe(true);
    const almost = almostThere(m, 50);
    expect(almost.every((x) => x.missing.length === 1)).toBe(true);
    // Palak paneer needs nothing else; dal khichdi needs only peas.
    expect(almost.map((x) => x.recipe.id)).toContain('dal-khichdi');
    expect(almost.find((x) => x.recipe.id === 'dal-khichdi')!.missing).toEqual([{ key: 'peas', name: 'Green peas' }]);
    expect(m[0].coverage).toBe(1);
  });

  it('filters by diet, Jain and explicit meal', () => {
    const veg = rankRecipes({ recipes: RECIPES, pantryKeys: [], diet: 'veg' });
    expect(veg.every((x) => x.recipe.diet === 'veg' || x.recipe.diet === 'vegan')).toBe(true);
    const vegan = rankRecipes({ recipes: RECIPES, pantryKeys: [], diet: 'vegan' });
    expect(vegan.every((x) => x.recipe.diet === 'vegan')).toBe(true);
    const jain = rankRecipes({ recipes: RECIPES, pantryKeys: [], diet: 'jain' });
    expect(jain.length).toBeGreaterThan(0);
    expect(jain.every((x) => x.recipe.jainOk)).toBe(true);
    const egg = rankRecipes({ recipes: RECIPES, pantryKeys: [], diet: 'egg' });
    expect(egg.some((x) => x.recipe.diet === 'egg')).toBe(true);
    expect(egg.some((x) => x.recipe.diet === 'nonveg')).toBe(false);
    const snacks = rankRecipes({ recipes: RECIPES, pantryKeys: [], meal: 'snack' });
    expect(snacks.every((x) => x.recipe.meal.includes('snack'))).toBe(true);
    expect(fitsRecipeDiet({ diet: 'nonveg', jainOk: false }, null)).toBe(true);
  });

  it('prefers the meal for the time of day', () => {
    expect(mealForHour(8)).toBe('breakfast');
    expect(mealForHour(13)).toBe('lunch');
    expect(mealForHour(17)).toBe('snack');
    expect(mealForHour(21)).toBe('dinner');
    const all = ['oats', 'milk', 'chia-seeds', 'banana', 'almonds', 'rajma', 'brown-rice', 'onion', 'tomato', 'ginger', 'garlic'];
    const morning = rankRecipes({ recipes: RECIPES, pantryKeys: all, diet: 'veg', hour: 8 });
    expect(cookNow(morning, 1)[0].recipe.id).toBe('overnight-oats');
    const evening = rankRecipes({ recipes: RECIPES, pantryKeys: all, diet: 'veg', hour: 20 });
    expect(cookNow(evening, 1)[0].recipe.id).toBe('rajma-brown-rice');
  });

  it('splits the remaining kcal across the meals still to come', () => {
    expect(mealBudget(1600, 'breakfast')).toBe(400);
    expect(mealBudget(700, 'dinner')).toBe(700);
    expect(mealBudget(1000, 'lunch')).toBe(Math.round((1000 * 0.35) / 0.75));
  });

  it('boosts protein when protein is behind and notes the fit', () => {
    const pantry = ['paneer', 'onion', 'tomato', 'capsicum', 'cucumber', 'curd', 'rice', 'tori', 'lauki', 'chana-dal'];
    const behind = rankRecipes({ recipes: RECIPES, pantryKeys: pantry, diet: 'veg', hour: 13, remainingKcal: 1000, remainingProtein: 50, proteinTarget: 70 });
    const top = cookNow(behind, 1)[0];
    expect(top.recipe.perServing.protein).toBeGreaterThanOrEqual(15);
    expect(top.fitNote).toMatch(/protein/);
    expect(top.mealBudget).toBe(467);
    const notBehind = rankRecipes({ recipes: RECIPES, pantryKeys: pantry, diet: 'veg', hour: 13, remainingKcal: 1000, remainingProtein: 5, proteinTarget: 70 });
    expect(notBehind.find((x) => x.recipe.id === 'paneer-bhurji')!.score).toBeLessThan(behind.find((x) => x.recipe.id === 'paneer-bhurji')!.score);
  });

  it('marks recipes over the meal budget kindly', () => {
    const m = rankRecipes({ recipes: [getRecipe('rajma-brown-rice')!], pantryKeys: [], hour: 20, remainingKcal: 200 });
    expect(m[0].fitNote).toMatch(/smaller portion/);
    const none = rankRecipes({ recipes: [getRecipe('rajma-brown-rice')!], pantryKeys: [] });
    expect(none[0].fitNote).toMatch(/kcal · \d+ g protein per serving/);
  });

  it('gives period-comfort recipes a boost on period days', () => {
    const pantry = ['rice', 'moong-dal', 'peas', 'tomato', 'paneer', 'onion', 'capsicum'];
    const off = rankRecipes({ recipes: RECIPES, pantryKeys: pantry, diet: 'veg', hour: 13 });
    const on = rankRecipes({ recipes: RECIPES, pantryKeys: pantry, diet: 'veg', hour: 13, onPeriod: true });
    const s = (list: typeof on, id: string) => list.find((x) => x.recipe.id === id)!.score;
    expect(s(on, 'dal-khichdi') - s(off, 'dal-khichdi')).toBe(10);
    expect(s(on, 'paneer-bhurji')).toBe(s(off, 'paneer-bhurji'));
    expect(on.find((x) => x.recipe.id === 'dal-khichdi')!.fitNote).toMatch(/period/);
  });

  it('builds a shopping list from missing items', () => {
    const m = rankRecipes({ recipes: RECIPES, pantryKeys: ['rice', 'tomato'], diet: 'veg' });
    const miss = missingForShopping(almostThere(m, 10));
    expect(new Set(miss.map((x) => x.key)).size).toBe(miss.length);
    expect(shoppingListText([{ name: 'Green peas' }, { name: 'Curd', done: true }])).toBe('Shopping list (from Bloom)\n• Green peas');
    expect(shoppingListText([])).toMatch(/all done/);
  });
});

/* -------------------------------- Pantry ------------------------------- */

describe('pantry repo (SQLite via memory driver)', () => {
  beforeEach(() => setDriver(memoryDriver()));
  afterAll(() => setDriver(null));

  it('adds, lists, edits, marks used up and deletes', async () => {
    const { pantry } = sqlKitchen;
    const id = await pantry.add({ ...draftFromIngredient(getIngredient('paneer')!, '2026-10-24'), quantity: 200, unit: 'g' });
    await pantry.add({ name: 'Mystery masala', category: 'spices-oil' });
    let list = await pantry.list();
    expect(list).toHaveLength(2);
    const p = list.find((x) => x.id === id)!;
    expect(p).toMatchObject({ name: 'Paneer', ingredientKey: 'paneer', category: 'dairy', quantity: 200, unit: 'g', expiresOn: '2026-10-28', source: 'manual', usedUp: false });
    await pantry.update(id, { quantity: 100 });
    expect((await pantry.get(id))!.quantity).toBe(100);
    await pantry.setUsedUp(id, true);
    expect(await pantry.list()).toHaveLength(1);
    expect(await pantry.list({ includeUsed: true })).toHaveLength(2);
    await pantry.remove(id);
    expect(await pantry.list({ includeUsed: true })).toHaveLength(1);
  });

  it('stores barcode products with nutrition and validates input', async () => {
    const { pantry } = sqlKitchen;
    const draft = productToDraft(mapOffResponse(OFF_FIXTURE, '8901063010031')!);
    const id = await pantry.add(draft);
    const got = (await pantry.get(id))!;
    expect(got.nutritionPer100g?.satFat).toBe(14.1);
    expect(got.brand).toBe('Dairy Co');
    expect(got.source).toBe('barcode');
    await expect(pantry.add({ name: '  ' })).rejects.toBeInstanceOf(ValidationError);
    await expect(pantry.add({ name: 'x', nutritionPer100g: { kcal: 2000, protein: 0, carbs: 0, fat: 0, fiber: 0, sugar: 0, salt: 0 } })).rejects.toThrow(/kcal/);
    await expect(pantry.add({ name: 'x', quantity: -1 })).rejects.toBeInstanceOf(ValidationError);
  });

  it('addMany skips ingredients already in the kitchen', async () => {
    const { pantry } = sqlKitchen;
    await pantry.add(draftFromIngredient(getIngredient('onion')!));
    const ids = await pantry.addMany(['onion', 'tomato', 'tomato', 'rice'].map((k) => draftFromIngredient(getIngredient(k)!)));
    expect(ids).toHaveLength(2);
    expect(pantryKeys(await pantry.list()).sort()).toEqual(['onion', 'rice', 'tomato']);
  });

  it('keeps a shopping list and my recipes; clear removes everything', async () => {
    const { shopping, myRecipes, pantry } = sqlKitchen;
    expect(await shopping.add('Green peas', 'peas')).not.toBeNull();
    expect(await shopping.add('green peas', 'peas')).toBeNull(); // no duplicates
    const lst = await shopping.list();
    await shopping.toggle(lst[0].id);
    expect((await shopping.list())[0].done).toBe(true);
    await shopping.clearDone();
    expect(await shopping.list()).toHaveLength(0);
    const r: Recipe = { ...getRecipe('dal-khichdi')!, id: 'ai-test', source: 'ai' };
    await myRecipes.save(r);
    expect((await myRecipes.get('ai-test'))!.title).toBe('Moong dal khichdi');
    expect(await myRecipes.list()).toHaveLength(1);
    await pantry.add({ name: 'Rice' });
    await clearKitchenData();
    expect(await myRecipes.list()).toHaveLength(0);
    expect(await pantry.list()).toHaveLength(0);
  });

  it('expiry chips and grouping', () => {
    expect(expiryState({ expiresOn: null }, '2026-10-24')).toBe('none');
    expect(expiryState({ expiresOn: '2026-10-23' }, '2026-10-24')).toBe('expired');
    expect(expiryState({ expiresOn: '2026-10-24' }, '2026-10-24')).toBe('today');
    expect(expiryState({ expiresOn: '2026-10-26' }, '2026-10-24')).toBe('soon');
    expect(expiryState({ expiresOn: '2026-10-30' }, '2026-10-24')).toBe('ok');
    expect(expiryText({ expiresOn: '2026-10-25' }, '2026-10-24')).toBe('Use by tomorrow');
    expect(expiryText({ expiresOn: '2026-10-23' }, '2026-10-24')).toMatch(/check/);
    expect(expiryText({ expiresOn: '2026-11-30' }, '2026-10-24')).toBeNull();
  });
});

describe('demo kitchen', () => {
  beforeEach(() => resetDemoKitchen());

  it('seeds an in-memory pantry with fresh items, staples and two scanned products', async () => {
    const now = new Date('2026-10-24T09:00:00');
    const k = demoKitchen(now);
    const items = await k.pantry.list();
    expect(items.length).toBe(demoPantryDrafts(now).length);
    expect(items.filter((i) => i.source === 'barcode')).toHaveLength(2);
    expect(items.some((i) => expiryState(i, '2026-10-24') === 'soon')).toBe(true);
    expect(groupByCategory(items)[0].category).toBe('vegetables');
    const m = rankRecipes({ recipes: RECIPES, pantryKeys: pantryKeys(items), diet: 'veg', hour: 9 });
    expect(cookNow(m).length).toBeGreaterThanOrEqual(3);
    // Writes stay in memory.
    await k.pantry.add({ name: 'Tofu', ingredientKey: 'tofu' });
    expect((await demoKitchen().pantry.list()).length).toBe(items.length + 1);
  });

  it('memoryKitchen mirrors the SQLite API', async () => {
    const k = memoryKitchen();
    const id = await k.pantry.add({ name: 'Paneer', ingredientKey: 'paneer' });
    await k.pantry.update(id, { quantity: 150, unit: 'g' });
    expect((await k.pantry.get(id))!).toMatchObject({ quantity: 150, category: 'dairy' });
    expect(await k.shopping.add('Peas', 'peas')).not.toBeNull();
    expect(await k.shopping.add('Peas', 'peas')).toBeNull();
  });
});

/* ------------------------------ AI recipe ------------------------------ */

const AI_JSON = JSON.stringify({
  title: 'Paneer palak bhurji',
  meal: 'dinner',
  timeMin: 20,
  servings: 2,
  ingredients: [
    { name: 'paneer', qty: 150, unit: 'g' },
    { name: 'palak', qty: 200, unit: 'g' },
    { name: 'tomato', qty: 1, unit: 'pc' },
    { name: 'oil', qty: 2, unit: 'tsp' },
    { name: 'kasoori magic', qty: 1, unit: 'tsp' },
  ],
  steps: ['Chop palak.', 'Cook tomato in oil.', 'Add palak and paneer.', 'Season and serve.'],
  perServing: { kcal: 260, protein: 16, carbs: 6, fat: 18, fiber: 3 },
  tags: ['iron-rich', 'quick', 'not-a-tag'],
  tip: 'Squeeze lemon on top.',
});

describe('AI recipe', () => {
  it('builds a prompt with names only (no brands or barcodes)', () => {
    const p = buildRecipePrompt({ pantryNames: ['Paneer', 'Spinach', 'Paneer'], diet: 'jain', remainingKcal: 420.4, remainingProtein: 30, meal: 'dinner' });
    expect(p).toMatch(/Ingredients I have: Paneer, Spinach\./);
    expect(p).toMatch(/Jain/);
    expect(p).toMatch(/about 420 kcal/);
    expect(p).toMatch(/30 g protein/);
  });

  it('parses JSON into a Recipe, maps known ingredients and re-derives numeric tags', () => {
    const r = parseAiRecipe(AI_JSON, { diet: 'veg', meal: 'lunch', now: new Date(0) });
    expect(r).toMatchObject({ title: 'Paneer palak bhurji', meal: ['dinner'], diet: 'veg', servings: 2, source: 'ai', jainOk: true });
    expect(r.ingredients.map((i) => i.key).slice(0, 4)).toEqual(['paneer', 'spinach', 'tomato', 'oil']);
    expect(r.ingredients[4]).toMatchObject({ name: 'kasoori magic' });
    expect(r.tags).toEqual(expect.arrayContaining(['high-protein', 'quick', 'iron-rich']));
    expect(r.tags).not.toContain('not-a-tag');
    expect(r.perServing.kcal).toBe(260);
  });

  it('fixes kcal that disagrees with the macros and rejects diet mismatches', () => {
    const bad = JSON.parse(AI_JSON);
    bad.perServing.kcal = 900;
    expect(parseAiRecipe(JSON.stringify(bad), { diet: 'veg', meal: 'dinner' }).perServing.kcal).toBe(4 * 16 + 4 * 6 + 9 * 18 + 2 * 3);
    const chicken = JSON.parse(AI_JSON);
    chicken.ingredients.push({ name: 'chicken', qty: 200, unit: 'g' });
    expect(() => parseAiRecipe(JSON.stringify(chicken), { diet: 'veg', meal: 'dinner' })).toThrow(AiRecipeError);
    const onion = JSON.parse(AI_JSON);
    onion.ingredients.push({ name: 'onion', qty: 1, unit: 'pc' });
    expect(() => parseAiRecipe(JSON.stringify(onion), { diet: 'jain', meal: 'dinner' })).toThrow(/preference/);
    expect(() => parseAiRecipe('nope', { diet: null, meal: 'dinner' })).toThrow(AiRecipeError);
  });

  it('calls Gemini in JSON mode with a response schema', async () => {
    let body: Record<string, unknown> | null = null;
    const r = await aiMakeRecipe(
      { pantryNames: ['paneer', 'palak'], diet: 'veg', remainingKcal: 500, remainingProtein: 20, meal: 'dinner' },
      {
        key: 'AQ.test-key-1234567890',
        fetchImpl: async (_url, init) => {
          body = JSON.parse(init.body);
          return { ok: true, status: 200, text: async () => JSON.stringify({ candidates: [{ content: { parts: [{ text: AI_JSON }] } }] }) };
        },
      }
    );
    expect(r.title).toBe('Paneer palak bhurji');
    const gc = (body as unknown as { generationConfig: Record<string, unknown> }).generationConfig;
    expect(gc.responseMimeType).toBe('application/json');
    expect(gc.responseSchema).toBeDefined();
    expect(JSON.stringify(body)).not.toMatch(/AQ\.test/);
  });
});
