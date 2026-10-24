import { FOODS } from '../src/content/foods';
import { SESSIONS } from '../src/content/yoga';
import type { PhaseDetail } from '../src/health/cyclePrediction';
import { fitsDiet } from '../src/plan/adapt';
import type { DietPref } from '../src/plan/profile';
import { foodIdeas, movementFor, suggestForPhase, SUGGESTION_FOOD_IDS } from '../src/cycle/suggestions';

const PHASES: PhaseDetail[] = ['menstrual', 'follicular', 'ovulation', 'luteal', 'pms'];
const DIETS: DietPref[] = ['veg', 'egg', 'nonveg', 'vegan', 'jain'];
const byId = new Map(FOODS.map((f) => [f.id, f]));

describe('phase suggestions', () => {
  it('every referenced food id exists in FOODS', () => {
    for (const id of SUGGESTION_FOOD_IDS) expect(byId.has(id)).toBe(true);
  });

  it.each(PHASES)('%s: 3–4 food ideas, movement, self-care and exactly 3 tips', (phase) => {
    const s = suggestForPhase(phase);
    expect(s.food.length).toBeGreaterThanOrEqual(3);
    expect(s.food.length).toBeLessThanOrEqual(4);
    expect(s.movement.sessions.length).toBeGreaterThanOrEqual(1);
    expect(s.movement.walk).toMatch(/walk/i);
    expect(s.selfCare.length).toBeGreaterThanOrEqual(3);
    expect(s.tips).toHaveLength(3);
    expect(s.typical.length).toBeGreaterThan(10);
  });

  it.each(DIETS)('food ideas respect the %s diet in every phase', (diet) => {
    for (const phase of PHASES) {
      const ideas = foodIdeas(phase, diet);
      expect(ideas.length).toBeGreaterThanOrEqual(3);
      for (const i of ideas) if (i.foodId) expect(fitsDiet(byId.get(i.foodId)!, diet)).toBe(true);
    }
  });

  it('vegan drops paneer and eggs; non-veg keeps them', () => {
    const vegan = foodIdeas('menstrual', 'vegan').map((f) => f.foodId);
    expect(vegan).not.toContain('palak-paneer');
    expect(vegan).not.toContain('boiled-egg');
    expect(vegan).toContain('spinach');
    expect(foodIdeas('menstrual', 'nonveg').map((f) => f.foodId)).toContain('palak-paneer');
  });

  it('Jain filters root vegetables by name (no sweet potato in luteal)', () => {
    expect(foodIdeas('luteal', 'jain').map((f) => f.foodId)).not.toContain('sweet-potato');
    expect(foodIdeas('luteal', 'veg').map((f) => f.foodId)).toContain('sweet-potato');
  });

  it('without a diet preference nothing is filtered', () => {
    expect(foodIdeas('menstrual', null).map((f) => f.foodId)).toEqual(['palak-paneer', 'spinach', 'rajma', 'dates']);
  });

  it('menstrual: iron-rich food and period-friendly period-relief yoga', () => {
    const s = suggestForPhase('menstrual', { yogaLevel: 'beginner' });
    expect(s.food.map((f) => f.foodId)).toEqual(expect.arrayContaining(['rajma', 'dates']));
    expect(s.movement.sessions[0].goal).toBe('period_relief');
    expect(s.movement.sessions.every((x) => x.periodFriendly)).toBe(true);
    expect(s.selfCare.join(' ')).toMatch(/hot water bag/i);
  });

  it('follicular/ovulation: energetic sessions; luteal/PMS: calming sessions', () => {
    for (const lvl of ['beginner', 'intermediate', 'advanced'] as const) {
      for (const ph of ['follicular', 'ovulation'] as const) {
        const m = movementFor(ph, lvl);
        expect(m.sessions.length).toBeGreaterThan(0);
        for (const x of m.sessions) expect(['morning', 'strength', 'weight_loss', 'flexibility']).toContain(x.goal);
      }
      for (const ph of ['luteal', 'pms'] as const) {
        const m = movementFor(ph, lvl);
        expect(m.sessions.length).toBeGreaterThan(0);
        for (const x of m.sessions) expect(['stress', 'evening', 'digestion']).toContain(x.goal);
      }
    }
    // PMS days stay period-friendly.
    expect(movementFor('pms', 'beginner').sessions.every((x) => x.periodFriendly)).toBe(true);
    // Session ids are real.
    const ids = new Set(SESSIONS.map((s) => s.id));
    for (const ph of PHASES) for (const x of movementFor(ph).sessions) expect(ids.has(x.id)).toBe(true);
  });

  it('PMS mentions reducing salt for bloating', () => {
    const s = suggestForPhase('pms');
    expect(`${s.foodNote} ${s.tips.join(' ')}`).toMatch(/salt/i);
  });

  it('personalises tips with your frequent symptoms first', () => {
    const s = suggestForPhase('pms', { frequentSymptoms: ['headache', 'bloating', 'unknown'] });
    expect(s.tips).toHaveLength(3);
    expect(s.tips[0]).toMatch(/Headaches/);
    expect(s.tips[1]).toMatch(/Bloating/);
  });
});
