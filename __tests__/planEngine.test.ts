import {
  bmi,
  bmr,
  calorieFloor,
  checkGoal,
  computePlan,
  dayAllowance,
  goalMode,
  intakeStatus,
  minHealthyWeight,
  tdee,
} from '../src/plan/engine';
import { activityKcal, MET } from '../src/plan/met';
import { cmToFtIn, ftInToCm, type Profile } from '../src/plan/profile';

const NOW = new Date(2026, 9, 24, 9, 0, 0);
const TODAY = '2026-10-24';

const base = (o: Partial<Profile> = {}): Profile => ({
  formula: 'female',
  birthYear: 1996, // 30
  heightCm: 165,
  weightKg: 70,
  targetKg: 62,
  activity: 'light',
  diet: 'veg',
  pace: 'steady',
  startDay: TODAY,
  yogaPerWeek: 4,
  ...o,
});

describe('BMR / TDEE (Mifflin–St Jeor)', () => {
  it('computes female and male BMR', () => {
    // 10·65 + 6.25·165 − 5·30 − 161 = 1370.25
    expect(bmr({ formula: 'female', weightKg: 65, heightCm: 165, age: 30 })).toBeCloseTo(1370.25, 2);
    expect(bmr({ formula: 'male', weightKg: 65, heightCm: 165, age: 30 })).toBeCloseTo(1536.25, 2);
  });
  it('multiplies by the activity factor', () => {
    expect(tdee({ formula: 'female', weightKg: 65, heightCm: 165, age: 30, activity: 'sedentary' })).toBeCloseTo(1370.25 * 1.2, 2);
    expect(tdee({ formula: 'female', weightKg: 65, heightCm: 165, age: 30, activity: 'active' })).toBeCloseTo(1370.25 * 1.725, 2);
  });
  it('BMI and lowest healthy weight', () => {
    expect(bmi(70, 165)).toBeCloseTo(25.71, 2);
    expect(minHealthyWeight(165)).toBe(50.4); // 18.5 × 1.65² = 50.37 → 50.4
    expect(bmi(minHealthyWeight(165), 165)).toBeGreaterThanOrEqual(18.5);
  });
  it('goal mode with a small dead band', () => {
    expect(goalMode(70, 62)).toBe('lose');
    expect(goalMode(70, 70.3)).toBe('maintain');
    expect(goalMode(50, 54)).toBe('gain');
  });
  it('height conversion round-trips', () => {
    expect(cmToFtIn(165)).toEqual({ ft: 5, inch: 5 });
    expect(Math.round(ftInToCm(5, 5))).toBe(165);
  });
});

describe('computePlan', () => {
  it('steady loss = TDEE − 550 kcal, shown as a ±100 range', () => {
    const p = base();
    const plan = computePlan(p, { today: TODAY, now: NOW });
    const T = tdee({ ...p, age: 30 });
    expect(plan.mode).toBe('lose');
    expect(plan.paceKgWeek).toBe(0.5);
    expect(plan.targets!.kcal).toBe(Math.round((T - 550) / 10) * 10);
    expect(plan.targets!.kcalMax - plan.targets!.kcal).toBe(100);
    expect(plan.targets!.kcal - plan.targets!.kcalMin).toBe(100);
    expect(plan.targets!.fibreG).toBe(25);
    expect(plan.targets!.waterMl).toBe(2500); // 70 × 35 = 2450 → 2500
    expect(plan.targets!.proteinG).toBe(Math.round(62 * 1.2)); // goal-adjusted weight
    expect(plan.weeksToGoal).toBe(16);
    expect(plan.goalDay).toBe('2027-02-13');
  });

  it('never loses more than 1% of body weight a week', () => {
    const plan = computePlan(base({ weightKg: 60, targetKg: 55, pace: 'faster', heightCm: 160, activity: 'active' }), { today: TODAY, now: NOW });
    expect(plan.paceKgWeek).toBeLessThanOrEqual(0.6);
    expect(plan.notes.join(' ')).toMatch(/1% of your body weight/);
  });

  it('never plans below the floor and slows the pace instead', () => {
    const p = base({ heightCm: 152, weightKg: 58, targetKg: 50, activity: 'sedentary', pace: 'faster', birthYear: 1966 });
    const plan = computePlan(p, { today: TODAY, now: NOW });
    expect(plan.targets!.kcal).toBe(1200);
    expect(plan.targets!.kcalMin).toBeGreaterThanOrEqual(1200);
    expect(plan.paceKgWeek).toBeLessThan(0.58);
    expect(plan.notes.join(' ')).toMatch(/slowed your pace|never plans lower/);
    expect(calorieFloor('male')).toBe(1500);
    const male = computePlan({ ...p, formula: 'male' }, { today: TODAY, now: NOW });
    expect(male.targets!.kcal).toBeGreaterThanOrEqual(1500);
  });

  it('weekly adjustments never push below the floor', () => {
    const p = base({ heightCm: 152, weightKg: 58, targetKg: 50, activity: 'sedentary' });
    const plan = computePlan(p, { today: TODAY, now: NOW, adjustKcal: -1000 });
    expect(plan.targets!.kcal).toBe(1200);
  });

  it('gain pace and protein', () => {
    const plan = computePlan(base({ weightKg: 50, targetKg: 55, heightCm: 165 }), { today: TODAY, now: NOW });
    expect(plan.mode).toBe('gain');
    expect(plan.paceKgWeek).toBe(0.35);
    expect(plan.targets!.kcal).toBeGreaterThan(plan.tdee);
    expect(plan.targets!.proteinG).toBe(Math.round(55 * 1.4));
  });

  it('maintain: target ≈ TDEE, no goal date', () => {
    const plan = computePlan(base({ targetKg: 70 }), { today: TODAY, now: NOW });
    expect(plan.mode).toBe('maintain');
    expect(Math.abs(plan.targets!.kcal - plan.tdee)).toBeLessThanOrEqual(5);
    expect(plan.goalDay).toBeNull();
  });

  it('minors get tracking only, no calorie targets', () => {
    const plan = computePlan(base({ birthYear: 2010 }), { today: TODAY, now: NOW });
    expect(plan.minor).toBe(true);
    expect(plan.targets).toBeNull();
    expect(plan.notes[0]).toMatch(/plans are for adults/);
  });
});

describe('BMI safety blocks', () => {
  it('blocks a target below BMI 18.5 and suggests the lowest healthy target', () => {
    const r = checkGoal({ heightCm: 165, weightKg: 60, targetKg: 48 });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.reason).toBe('target-underweight');
      expect(r.suggestedTargetKg).toBe(50.4);
      expect(r.message).toMatch(/talk to a doctor/i);
    }
  });
  it('blocks weight loss when already underweight, offers maintain/gain', () => {
    const r = checkGoal({ heightCm: 170, weightKg: 52, targetKg: 50 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('current-underweight-loss');
    // Gaining is fine.
    expect(checkGoal({ heightCm: 170, weightKg: 52, targetKg: 56 }).ok).toBe(true);
    // computePlan falls back to maintaining.
    const plan = computePlan(base({ heightCm: 170, weightKg: 52, targetKg: 50 }), { today: TODAY, now: NOW });
    expect(plan.mode).toBe('maintain');
  });
});

describe('allowance and friendly status', () => {
  it('adds half of exercise calories', () => {
    expect(dayAllowance(1600, 300)).toBe(1750);
    expect(dayAllowance(1600, -50)).toBe(1600);
  });
  it('uses kind words', () => {
    expect(intakeStatus(1000, 1500, 1700).text).toMatch(/to go/);
    expect(intakeStatus(1600, 1500, 1700).key).toBe('in');
    expect(intakeStatus(1900, 1500, 1700).text).toMatch(/flex/);
  });
});

describe('MET calc', () => {
  it('kcal = MET × kg × hours', () => {
    expect(activityKcal('walk', 'moderate', 30, 60)).toBe(Math.round(MET.walk.moderate * 60 * 0.5)); // 105
    expect(activityKcal('yoga', 'light', 20, 60)).toBe(46);
    expect(activityKcal('run', 'vigorous', 0, 60)).toBe(0);
    expect(activityKcal('run', 'vigorous', 30, 0)).toBe(0);
  });
});
