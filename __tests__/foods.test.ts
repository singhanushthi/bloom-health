import { FOODS, searchFoods, type DietTag, type Food } from '../src/content/foods';

const DIETS: DietTag[] = ['veg', 'egg', 'nonveg', 'vegan'];
const CATEGORIES = [
  'grains', 'breads', 'dals', 'curries', 'south_indian', 'snacks', 'street', 'dairy', 'eggs',
  'meat_fish', 'fruits', 'vegetables', 'drinks', 'sweets', 'nuts_seeds', 'breakfast', 'fast_food', 'other',
];

const macroKcal = (f: Food) => 4 * f.per.protein + 4 * f.per.carbs + 9 * f.per.fat + 2 * f.per.fiber;
const oneDecimal = (n: number) => Math.abs(Math.round(n * 10) - n * 10) < 1e-6;

describe('FOODS data', () => {
  it('has a realistic number of items', () => {
    expect(FOODS.length).toBeGreaterThanOrEqual(280);
    expect(FOODS.length).toBeLessThanOrEqual(350);
  });

  it('has unique kebab-case ids', () => {
    const ids = FOODS.map((f) => f.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
  });

  it('has valid shape, diet and category for every item', () => {
    for (const f of FOODS) {
      expect(f.name.trim().length).toBeGreaterThan(0);
      expect(Array.isArray(f.aliases)).toBe(true);
      expect(DIETS).toContain(f.diet);
      expect(CATEGORIES).toContain(f.category);
      expect(f.serving.label.trim().length).toBeGreaterThan(0);
      if (f.approx !== undefined) expect(f.approx).toBe(true);
      for (const v of Object.values(f.per)) {
        expect(Number.isFinite(v)).toBe(true);
        expect(v).toBeGreaterThanOrEqual(0);
        expect(oneDecimal(v)).toBe(true);
      }
    }
  });

  it('kcal is consistent with macros (±12%, or ±15 kcal for drinks/small items)', () => {
    const bad: string[] = [];
    for (const f of FOODS) {
      const calc = macroKcal(f);
      const diff = Math.abs(f.per.kcal - calc);
      const small = f.category === 'drinks' || f.serving.grams <= 30 || f.per.kcal < 60;
      const ok = diff <= 0.12 * calc || (small && diff <= 15);
      if (!ok) bad.push(`${f.id}: kcal ${f.per.kcal} vs macros ${calc.toFixed(1)}`);
    }
    expect(bad).toEqual([]);
  });

  it('has sane serving grams and macro mass', () => {
    const bad: string[] = [];
    for (const f of FOODS) {
      const { protein, carbs, fat, fiber } = f.per;
      const mass = protein + carbs + fat + fiber;
      // grams in (0, 500]; macros can't weigh more than the serving; kcal <= 9 kcal/g
      if (!(f.serving.grams > 0 && f.serving.grams <= 500)) bad.push(`${f.id}: grams ${f.serving.grams}`);
      if (mass > f.serving.grams) bad.push(`${f.id}: macro mass ${mass} > ${f.serving.grams} g`);
      if (f.per.kcal > f.serving.grams * 9) bad.push(`${f.id}: kcal ${f.per.kcal} > 9 kcal/g`);
    }
    expect(bad).toEqual([]);
  });

  it('matches key household reference values', () => {
    const roti = FOODS.find((f) => f.id === 'chapati')!;
    expect(roti.serving.grams).toBe(40);
    expect(roti.per.kcal).toBeGreaterThanOrEqual(105);
    expect(roti.per.kcal).toBeLessThanOrEqual(125);
    expect(FOODS.find((f) => f.id === 'plain-rice')!.serving.grams).toBe(150);
    expect(FOODS.find((f) => f.id === 'dal-tadka')!.serving.grams).toBe(150);
    expect(FOODS.find((f) => f.id === 'chai')!.serving.grams).toBe(150);
  });

  it('marks cooked home dishes approx and keeps diet tags plausible', () => {
    expect(FOODS.find((f) => f.id === 'dal-tadka')!.approx).toBe(true);
    expect(FOODS.find((f) => f.id === 'chicken-biryani')!.diet).toBe('nonveg');
    expect(FOODS.find((f) => f.id === 'omelette')!.diet).toBe('egg');
    expect(FOODS.find((f) => f.id === 'paneer')!.diet).toBe('veg');
    expect(FOODS.find((f) => f.id === 'banana')!.diet).toBe('vegan');
  });
});

describe('searchFoods', () => {
  it('returns [] for empty / whitespace query', () => {
    expect(searchFoods('')).toEqual([]);
    expect(searchFoods('   ')).toEqual([]);
  });

  it('is case-insensitive and finds by alias', () => {
    expect(searchFoods('ROTI')[0].id).toBe('chapati');
    expect(searchFoods('phulka').map((f) => f.id)).toContain('chapati');
    expect(searchFoods('golgappa')[0].id).toBe('pani-puri');
  });

  it('is diacritic-insensitive', () => {
    expect(searchFoods('pâneer').map((f) => f.id)).toContain('paneer');
    expect(searchFoods('dósa').map((f) => f.id)).toContain('plain-dosa');
  });

  it('ranks prefix > word-start > substring', () => {
    const ids = searchFoods('paneer', { limit: 50 }).map((f) => f.id);
    // name prefix ("Paneer ...") before word-start ("Palak paneer")
    expect(ids.indexOf('paneer')).toBe(0);
    expect(ids.indexOf('paneer-paratha')).toBeLessThan(ids.indexOf('palak-paneer'));

    // "aloo": prefix "Aloo gobi" before word-start "Jeera aloo"
    const aloo = searchFoods('aloo', { limit: 50 }).map((f) => f.id);
    expect(aloo.indexOf('aloo-gobi')).toBeLessThan(aloo.indexOf('jeera-aloo'));

    // "chi": prefix ("Chicken curry") < word-start ("Butter chicken") < substring ("Litchi")
    const chi = searchFoods('chi', { limit: 400 }).map((f) => f.id);
    const [pre, word, sub] = ['chicken-curry', 'butter-chicken', 'litchi'].map((id) => chi.indexOf(id));
    expect(pre).toBeGreaterThanOrEqual(0);
    expect(pre).toBeLessThan(word);
    expect(word).toBeLessThan(sub);

    // substring-only matches are still found; exact alias wins
    expect(searchFoods('osa', { limit: 50 }).map((f) => f.id)).toContain('masala-dosa');
    expect(searchFoods('dosa')[0].id).toBe('plain-dosa');
  });

  it('prefers exact > prefix > word-start > substring on a controlled query', () => {
    // "chai" exact (alias of Chai) before "Chai (no sugar)" prefix; "masala chai" alias
    const ids = searchFoods('chai').map((f) => f.id);
    expect(ids[0]).toBe('chai');
    expect(ids).toContain('chai-no-sugar');
  });

  it('matches multi-word queries in any order', () => {
    expect(searchFoods('chicken biryani')[0].id).toBe('chicken-biryani');
    expect(searchFoods('biryani chicken').map((f) => f.id)).toContain('chicken-biryani');
    expect(searchFoods('panipuri').map((f) => f.id)).toContain('pani-puri');
  });

  it('supports Devanagari aliases', () => {
    expect(searchFoods('रोटी')[0].id).toBe('chapati');
    expect(searchFoods('दाल').map((f) => f.id)).toContain('dal-tadka');
    expect(searchFoods('पनीर').map((f) => f.id)).toContain('paneer');
    expect(searchFoods('समोसा')[0].id).toBe('samosa');
  });

  it('applies the diet hierarchy', () => {
    const allowed: Record<DietTag, DietTag[]> = {
      vegan: ['vegan'],
      veg: ['veg', 'vegan'],
      egg: ['veg', 'vegan', 'egg'],
      nonveg: ['veg', 'vegan', 'egg', 'nonveg'],
    };
    for (const d of DIETS) {
      for (const q of ['a', 'e', 'i', 'o', 'chicken', 'egg', 'paneer']) {
        for (const f of searchFoods(q, { diet: d, limit: 400 })) expect(allowed[d]).toContain(f.diet);
      }
    }
    expect(searchFoods('biryani', { diet: 'veg' }).map((f) => f.id)).toEqual(['veg-biryani']);
    const eggIds = searchFoods('biryani', { diet: 'egg' }).map((f) => f.id);
    expect(eggIds).toContain('egg-biryani');
    expect(eggIds).not.toContain('chicken-biryani');
    expect(searchFoods('biryani', { diet: 'nonveg' }).length).toBe(4);
    expect(searchFoods('paneer', { diet: 'vegan' })).toEqual(
      searchFoods('paneer', { diet: 'vegan' }).filter((f) => f.diet === 'vegan'),
    );
  });

  it('respects default limit 20 and custom limit', () => {
    expect(searchFoods('a').length).toBe(20);
    expect(searchFoods('a', { limit: 5 }).length).toBe(5);
  });

  it('returns nothing for gibberish', () => {
    expect(searchFoods('zzqxw')).toEqual([]);
  });
});
