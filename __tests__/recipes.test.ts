import {
  addedFatPerServing,
  formatQty,
  getRecipe,
  HIGH_FIBRE_G,
  HIGH_PROTEIN_G,
  ingredientLine,
  LOW_OIL_G,
  parseSpec,
  QUICK_MIN,
  RECIPES,
  scaleQty,
  type RecipeMeal,
} from '../src/content/recipes';
import { getIngredient, INGREDIENTS, kcalFrom, searchIngredients, STAPLES } from '../src/kitchen/ingredients';

const JAIN_BANNED = ['onion', 'garlic', 'potato', 'carrot', 'beetroot', 'ginger', 'radish', 'sweet-potato', 'spring-onion', 'arbi'];

describe('ingredients list', () => {
  it('has ~150 unique, well-formed ingredients', () => {
    expect(INGREDIENTS.length).toBeGreaterThanOrEqual(140);
    const keys = INGREDIENTS.map((i) => i.key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const i of INGREDIENTS) {
      expect(i.key).toMatch(/^[a-z0-9-]+$/);
      expect(i.name.trim()).toBe(i.name);
      for (const a of i.aliases) expect(a).toBe(a.toLowerCase());
      expect(i.per100.kcal).toBe(kcalFrom(i.per100.protein, i.per100.carbs, i.per100.fat, i.per100.fiber));
      expect(i.per100.protein + i.per100.carbs + i.per100.fat + i.per100.fiber).toBeLessThanOrEqual(101);
      for (const s of i.subs ?? []) expect(getIngredient(s)).toBeDefined();
    }
  });

  it('includes Hindi names and marks Jain-avoid roots', () => {
    expect(getIngredient('spinach')!.aliases).toEqual(expect.arrayContaining(['palak', 'पालक']));
    for (const k of JAIN_BANNED) expect(getIngredient(k)!.jainAvoid).toBe(true);
    expect(getIngredient('tomato')!.jainAvoid).toBeUndefined();
    expect(getIngredient('salt')!.basic).toBe(true);
    expect(STAPLES.length).toBeGreaterThan(25);
  });

  it('no alias points at two different ingredients', () => {
    const seen = new Map<string, string>();
    for (const i of INGREDIENTS)
      for (const a of [i.name.toLowerCase(), ...i.aliases]) {
        const prev = seen.get(a);
        if (prev && prev !== i.key) throw new Error(`"${a}" used by ${prev} and ${i.key}`);
        seen.set(a, i.key);
      }
  });

  it('searches by English and Hindi names', () => {
    expect(searchIngredients('palak')[0].key).toBe('spinach');
    expect(searchIngredients('dahi')[0].key).toBe('curd');
    expect(searchIngredients('पनीर')[0].key).toBe('paneer');
    expect(searchIngredients('')).toEqual([]);
  });
});

describe('recipes data', () => {
  it('has about 60+ recipes with unique ids', () => {
    expect(RECIPES.length).toBeGreaterThanOrEqual(60);
    const ids = RECIPES.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^[a-z0-9-]+$/);
    expect(getRecipe('moong-dal-chilla')?.title).toBe('Moong dal chilla');
  });

  it('every ingredient key exists and every recipe is complete', () => {
    for (const r of RECIPES) {
      for (const i of r.ingredients) {
        if (!getIngredient(i.key)) throw new Error(`${r.id}: unknown ingredient ${i.key}`);
        expect(i.qty).toBeGreaterThan(0);
      }
      expect(r.steps.length).toBeGreaterThanOrEqual(4);
      expect(r.steps.length).toBeLessThanOrEqual(8);
      expect(r.meal.length).toBeGreaterThan(0);
      expect(r.servings).toBeGreaterThanOrEqual(1);
      expect(r.timeMin).toBeGreaterThan(0);
      expect(r.tip.length).toBeGreaterThan(10);
      expect(r.source).toBe('bloom');
    }
  });

  it('kcal ≈ 4P + 4C + 9F + 2·fibre (within 12%) and portions are plausible', () => {
    for (const r of RECIPES) {
      const p = r.perServing;
      const atwater = 4 * p.protein + 4 * p.carbs + 9 * p.fat + 2 * p.fiber;
      if (Math.abs(p.kcal - atwater) > atwater * 0.12) throw new Error(`${r.id}: ${p.kcal} vs ${atwater}`);
      expect(p.kcal).toBeGreaterThan(40);
      expect(p.kcal).toBeLessThan(700);
    }
  });

  it('diet tags match the ingredients', () => {
    for (const r of RECIPES) {
      const diets = r.ingredients.map((i) => getIngredient(i.key)!.diet);
      if (r.diet === 'vegan') expect(diets.every((d) => d === 'vegan')).toBe(true);
      if (r.diet === 'veg') {
        expect(diets).not.toContain('egg');
        expect(diets).not.toContain('nonveg');
        expect(diets).toContain('veg'); // otherwise it should be tagged vegan
      }
      if (r.diet === 'egg') {
        expect(diets).not.toContain('nonveg');
        expect(diets).toContain('egg');
      }
      if (r.diet === 'nonveg') expect(diets).toContain('nonveg');
    }
  });

  it('Jain flags exclude onion, garlic, ginger and root vegetables', () => {
    const jain = RECIPES.filter((r) => r.jainOk);
    expect(jain.length).toBeGreaterThanOrEqual(10);
    for (const r of jain) {
      expect(['veg', 'vegan']).toContain(r.diet);
      for (const i of r.ingredients) expect(JAIN_BANNED).not.toContain(i.key);
    }
    expect(getRecipe('dal-khichdi')!.jainOk).toBe(true);
    expect(getRecipe('rajma-brown-rice')!.jainOk).toBe(false);
    expect(getRecipe('egg-bhurji')!.jainOk).toBe(false);
  });

  it('numeric tags follow the numbers', () => {
    for (const r of RECIPES) {
      expect(r.tags.includes('high-protein')).toBe(r.perServing.protein >= HIGH_PROTEIN_G);
      expect(r.tags.includes('high-fibre')).toBe(r.perServing.fiber >= HIGH_FIBRE_G);
      expect(r.tags.includes('low-oil')).toBe(addedFatPerServing(r.ingredients, r.servings) <= LOW_OIL_G);
      expect(r.tags.includes('quick')).toBe(r.timeMin <= QUICK_MIN);
    }
  });

  it('covers every meal, diet and the period-comfort tag', () => {
    const by = (m: RecipeMeal) => RECIPES.filter((r) => r.meal.includes(m)).length;
    expect(by('breakfast')).toBeGreaterThanOrEqual(10);
    expect(by('lunch')).toBeGreaterThanOrEqual(15);
    expect(by('dinner')).toBeGreaterThanOrEqual(15);
    expect(by('snack')).toBeGreaterThanOrEqual(10);
    expect(RECIPES.filter((r) => r.diet === 'vegan').length).toBeGreaterThanOrEqual(15);
    expect(RECIPES.filter((r) => r.diet === 'egg').length).toBeGreaterThanOrEqual(4);
    expect(RECIPES.filter((r) => r.diet === 'nonveg').length).toBeGreaterThanOrEqual(6);
    expect(RECIPES.filter((r) => r.tags.includes('period-comfort')).length).toBeGreaterThanOrEqual(6);
    expect(RECIPES.filter((r) => r.tags.includes('high-protein')).length).toBeGreaterThanOrEqual(12);
  });
});

describe('recipe helpers', () => {
  it('parses ingredient specs', () => {
    expect(parseSpec('moong-dal 120; onion 1pc; coriander-leaves? 10; oil 2tsp')).toEqual([
      { key: 'moong-dal', qty: 120, unit: 'g' },
      { key: 'onion', qty: 1, unit: 'pc' },
      { key: 'coriander-leaves', qty: 10, unit: 'g', optional: true },
      { key: 'oil', qty: 2, unit: 'tsp' },
    ]);
    expect(() => parseSpec('bad spec here')).toThrow();
  });

  it('scales and formats quantities', () => {
    expect(scaleQty(120, 'g', 1.5)).toBe(180);
    expect(scaleQty(300, 'g', 1.5)).toBe(450);
    expect(scaleQty(1, 'pc', 0.5)).toBe(0.5);
    expect(scaleQty(2, 'tsp', 0.5)).toBe(1);
    expect(formatQty(1.5)).toBe('1½');
    expect(formatQty(0.25)).toBe('¼');
    expect(ingredientLine({ key: 'moong-dal', qty: 120, unit: 'g' })).toBe('120 g Moong dal (yellow)');
    expect(ingredientLine({ key: 'garlic', qty: 3, unit: 'pc' })).toBe('3 cloves garlic');
    expect(ingredientLine({ key: 'onion', qty: 1, unit: 'pc' }, 2)).toBe('2 × Onion');
  });
});
