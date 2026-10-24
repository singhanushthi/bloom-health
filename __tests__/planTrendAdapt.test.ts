import type { Food } from '../src/content/foods';
import { fitsDiet, isJainFriendly, nextMealIdeas, reviewWeek } from '../src/plan/adapt';
import { fromFood, scale, servingsFromGrams } from '../src/plan/foodPick';
import { dailyWeights, latestTrend, progress, trendDirection, trendSeries, windowAverage, type WeightPoint } from '../src/plan/trend';

const W = (day: string, kg: number, slot: 'morning' | 'night' = 'morning', time = '07:00'): WeightPoint => ({
  day,
  kg,
  slot,
  time: `${day}T${time}:00`,
});

describe('weight trend', () => {
  it('uses only morning weights for the moving average', () => {
    const pts = [W('2026-10-01', 70), W('2026-10-01', 71.5, 'night', '22:00'), W('2026-10-02', 69.8), W('2026-10-02', 71, 'night', '22:00')];
    expect(trendSeries(pts, ['2026-10-02'])[0]).toBeCloseTo(69.9, 5);
  });

  it('handles missing days (average of whatever exists in the 7-day window)', () => {
    const pts = [W('2026-10-01', 70), W('2026-10-04', 69), W('2026-10-10', 68)];
    const [d4, d7, d10, d20] = trendSeries(pts, ['2026-10-04', '2026-10-07', '2026-10-10', '2026-10-20']);
    expect(d4).toBe(69.5);
    expect(d7).toBe(69.5); // 1st–7th window
    expect(d10).toBe(68.5); // 4th–10th
    expect(d20).toBeNull();
  });

  it('picks the earliest morning weight of a day', () => {
    const m = dailyWeights([W('2026-10-01', 70.4, 'morning', '09:00'), W('2026-10-01', 70.0, 'morning', '06:30')]);
    expect(m.get('2026-10-01')).toBe(70.0);
  });

  it('falls back to any weight when there are no mornings', () => {
    const pts = [W('2026-10-01', 71, 'night', '22:00'), W('2026-10-02', 70, 'night', '22:00')];
    expect(trendSeries(pts, ['2026-10-02'])[0]).toBe(70.5);
  });

  it('latest trend, direction and progress', () => {
    const pts = Array.from({ length: 14 }, (_, i) => W(`2026-10-${String(i + 1).padStart(2, '0')}`, 72 - i * 0.1));
    expect(latestTrend(pts, '2026-10-20')).toBeCloseTo(71.0, 1);
    const dir = trendDirection(pts, '2026-10-14');
    expect(dir?.dir).toBe('down');
    expect(dir?.delta).toBeCloseTo(-0.7, 1);
    expect(progress(72, 70, 64)).toMatchObject({ toGoKg: 6, percent: 25 });
    expect(progress(50, 52, 55).percent).toBe(40);
    expect(windowAverage(pts, '2026-10-01', '2026-10-03', 4)).toBeNull();
    expect(windowAverage(pts, '2026-10-01', '2026-10-04', 4)?.count).toBe(4);
  });
});

const food = (id: string, name: string, diet: Food['diet'], kcal: number, protein: number, aliases: string[] = []): Food =>
  ({
    id,
    name,
    aliases,
    category: 'other',
    diet,
    serving: { label: '1 serving', grams: 100 },
    per: { kcal, protein, carbs: 10, fat: 5, fiber: 2 },
  }) as Food;

const FOODS: Food[] = [
  food('roti', 'Roti', 'vegan', 120, 3.5, ['chapati']),
  food('paneer-bhurji', 'Paneer bhurji', 'veg', 250, 16),
  food('egg-bhurji', 'Egg bhurji', 'egg', 200, 13),
  food('chicken-curry', 'Chicken curry', 'nonveg', 280, 25),
  food('aloo-sabzi', 'Aloo sabzi', 'vegan', 180, 3),
  food('onion-raita', 'Onion raita', 'veg', 90, 4),
  food('moong-chilla', 'Moong dal chilla', 'vegan', 160, 9),
  food('dahi', 'Dahi (curd)', 'veg', 100, 6),
  food('apple', 'Apple', 'vegan', 95, 0.5),
  food('soya', 'Soya chunks curry', 'vegan', 220, 18),
];

describe('diet filtering', () => {
  it('maps preferences to allowed foods', () => {
    expect(fitsDiet(FOODS[1], 'veg')).toBe(true);
    expect(fitsDiet(FOODS[2], 'veg')).toBe(false);
    expect(fitsDiet(FOODS[2], 'egg')).toBe(true);
    expect(fitsDiet(FOODS[3], 'egg')).toBe(false);
    expect(fitsDiet(FOODS[3], 'nonveg')).toBe(true);
    expect(fitsDiet(FOODS[1], 'vegan')).toBe(false);
    expect(fitsDiet(FOODS[0], 'vegan')).toBe(true);
  });
  it('Jain filters onion, garlic and root vegetables by name and aliases', () => {
    expect(isJainFriendly(FOODS[4])).toBe(false); // aloo
    expect(isJainFriendly(FOODS[5])).toBe(false); // onion
    expect(isJainFriendly(food('x', 'Mixed veg', 'veg', 100, 3, ['with garlic']))).toBe(false);
    expect(fitsDiet(FOODS[1], 'jain')).toBe(true);
    expect(fitsDiet(FOODS[2], 'jain')).toBe(false); // egg
  });
});

describe('next meal ideas', () => {
  it('fits the budget, honours diet and puts protein first when behind', () => {
    const ideas = nextMealIdeas({ foods: FOODS, diet: 'jain', remainingKcal: 450, remainingProtein: 40, proteinTarget: 70 });
    expect(ideas.length).toBeGreaterThanOrEqual(2);
    expect(ideas.length).toBeLessThanOrEqual(4);
    for (const i of ideas) {
      expect(i.kcal).toBeLessThanOrEqual(500);
      for (const it of i.items) expect(fitsDiet(it.food, 'jain')).toBe(true);
    }
    // First idea is protein-rich (soya / paneer), combined with a roti.
    expect(ideas[0].title).toMatch(/Soya|Paneer/);
    expect(ideas[0].title).toMatch(/Roti/);
    expect(ideas.map((i) => i.title).join(' ')).not.toMatch(/Aloo|Onion|Egg|Chicken/);
  });
  it('returns nothing when the budget is used up', () => {
    expect(nextMealIdeas({ foods: FOODS, diet: 'veg', remainingKcal: 20, remainingProtein: 0, proteinTarget: 70 })).toEqual([]);
  });
  it('small budgets get light single items only', () => {
    const ideas = nextMealIdeas({ foods: FOODS, diet: 'nonveg', remainingKcal: 150, remainingProtein: 5, proteinTarget: 70 });
    for (const i of ideas) expect(i.kcal).toBeLessThanOrEqual(200);
  });
});

describe('weekly review', () => {
  const base = { weekNo: 3, mode: 'lose' as const, expectedKgWeek: 0.5, currentKg: 70, currentTargetKcal: 1500, floorKcal: 1200 };
  it('needs enough data', () => {
    expect(reviewWeek({ ...base, changeKg: null, prevVerdict: null }).verdict).toBe('not-enough-data');
  });
  it('slow once → no change; slow twice → −100', () => {
    const one = reviewWeek({ ...base, changeKg: -0.1, prevVerdict: 'on-track' });
    expect(one).toMatchObject({ verdict: 'slow', deltaKcal: 0 });
    const two = reviewWeek({ ...base, changeKg: -0.1, prevVerdict: 'slow' });
    expect(two.deltaKcal).toBe(-100);
    expect(two.reason).toMatch(/^Week 3:/);
  });
  it('respects the floor', () => {
    const r = reviewWeek({ ...base, currentTargetKcal: 1250, changeKg: 0, prevVerdict: 'slow' });
    expect(r.deltaKcal).toBe(0);
    expect(r.reason).toMatch(/floor/);
  });
  it('too fast (>1%/week) → +100 with a kind reason', () => {
    const r = reviewWeek({ ...base, changeKg: -0.9, prevVerdict: null });
    expect(r).toMatchObject({ verdict: 'fast', deltaKcal: 100 });
    expect(r.reason).toBe('Week 3: added 100 kcal because you lost faster than planned — slow and steady keeps the weight off.');
  });
  it('on track → no change', () => {
    expect(reviewWeek({ ...base, changeKg: -0.5, prevVerdict: 'slow' }).deltaKcal).toBe(0);
  });
  it('gain too slow twice → +100', () => {
    const g = { ...base, mode: 'gain' as const, expectedKgWeek: 0.35 };
    expect(reviewWeek({ ...g, changeKg: 0.05, prevVerdict: null }).deltaKcal).toBe(0);
    expect(reviewWeek({ ...g, changeKg: 0.05, prevVerdict: 'slow' }).deltaKcal).toBe(100);
  });
});

describe('food scaling', () => {
  it('scales by servings and grams', () => {
    const p = fromFood(FOODS[1]);
    expect(p.key).toBe('db:paneer-bhurji');
    expect(scale(p.per, 1.5).kcal).toBe(375);
    expect(servingsFromGrams(150, 100)).toBe(1.5);
    expect(servingsFromGrams(150, null)).toBe(1);
  });
});
