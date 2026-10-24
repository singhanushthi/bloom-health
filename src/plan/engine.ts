/**
 * Calorie & goal engine (pure, tested).
 *
 *  BMR   Mifflin–St Jeor: 10·kg + 6.25·cm − 5·age + 5 (male formula) / −161 (female formula)
 *  TDEE  BMR × activity factor (1.2 / 1.375 / 1.55 / 1.725)
 *  Daily target = TDEE ± pace × 7700 / 7  (≈7700 kcal per kg of body weight)
 *
 * Safety rules (kind, never shaming):
 *  - Target BMI below 18.5 is not allowed; we suggest the lowest healthy target instead.
 *  - Current BMI below 18.5 → weight loss is blocked; maintain or gain is offered.
 *  - Loss pace: gentle 0.25 / steady 0.5 / faster 0.75 kg a week, never more than 1% of body weight.
 *  - Gain pace: 0.25 / 0.35 / 0.5 kg a week.
 *  - Calorie floor 1200 kcal (female formula) / 1500 kcal (male formula). If a pace would go
 *    below it, the pace is slowed and we say so.
 *  - Under 18: tracking only, no calorie targets.
 */
import { addDays, type DayKey } from '../health/dates';
import { ACTIVITY_FACTOR, ageFrom, type Formula, type Pace, type Profile } from './profile';

export const KCAL_PER_KG = 7700;
export const MIN_HEALTHY_BMI = 18.5;
export const RANGE_HALF_WIDTH = 100;
export const LOSS_PACE: Record<Pace, number> = { gentle: 0.25, steady: 0.5, faster: 0.75 };
export const GAIN_PACE: Record<Pace, number> = { gentle: 0.25, steady: 0.35, faster: 0.5 };
export const MAX_LOSS_FRACTION = 0.01; // 1% of body weight per week
export const FIBRE_G = 25;
export const ADULT_AGE = 18;

export type GoalMode = 'lose' | 'maintain' | 'gain';

export const calorieFloor = (f: Formula) => (f === 'male' ? 1500 : 1200);

export function bmi(kg: number, cm: number): number {
  const m = cm / 100;
  return kg / (m * m);
}

/** Lowest weight (kg, rounded up to 0.1) with a BMI of at least 18.5. */
export function minHealthyWeight(cm: number): number {
  const m = cm / 100;
  return Math.ceil(MIN_HEALTHY_BMI * m * m * 10) / 10;
}

export function bmr(p: { formula: Formula; weightKg: number; heightCm: number; age: number }): number {
  const base = 10 * p.weightKg + 6.25 * p.heightCm - 5 * p.age;
  return base + (p.formula === 'male' ? 5 : -161);
}

export function tdee(p: Pick<Profile, 'formula' | 'heightCm' | 'activity'> & { weightKg: number; age: number }): number {
  return bmr(p) * ACTIVITY_FACTOR[p.activity];
}

export function goalMode(currentKg: number, targetKg: number): GoalMode {
  if (targetKg < currentKg - 0.5) return 'lose';
  if (targetKg > currentKg + 0.5) return 'gain';
  return 'maintain';
}

export type GoalCheck =
  | { ok: true }
  | {
      ok: false;
      reason: 'target-underweight' | 'current-underweight-loss';
      message: string;
      /** For target-underweight: the lowest healthy target. */
      suggestedTargetKg?: number;
    };

/** Validates the goal itself against the BMI safety rules. */
export function checkGoal(p: { heightCm: number; weightKg: number; targetKg: number }): GoalCheck {
  const curBmi = bmi(p.weightKg, p.heightCm);
  const mode = goalMode(p.weightKg, p.targetKg);
  if (mode === 'lose' && curBmi < MIN_HEALTHY_BMI) {
    return {
      ok: false,
      reason: 'current-underweight-loss',
      message:
        'Your weight is already on the low side for your height, so Bloom won’t plan weight loss. You can choose to maintain or gently gain instead — and talk to a doctor if you’re unsure.',
    };
  }
  if (bmi(p.targetKg, p.heightCm) < MIN_HEALTHY_BMI) {
    const s = minHealthyWeight(p.heightCm);
    return {
      ok: false,
      reason: 'target-underweight',
      suggestedTargetKg: s,
      message: `That target is below a healthy weight for your height. The lowest healthy target is about ${s.toFixed(1)} kg. Talk to a doctor if you’re unsure what’s right for you.`,
    };
  }
  return { ok: true };
}

export interface Plan {
  mode: GoalMode;
  age: number;
  /** True for under-18s: tracking only, `targets` is null. */
  minor: boolean;
  bmi: number;
  bmr: number;
  tdee: number;
  floor: number;
  /** Pace actually used in kg/week (after safety caps). 0 for maintain. */
  paceKgWeek: number;
  /** Pace the user asked for, before any caps. */
  requestedPaceKgWeek: number;
  /** Friendly notes about adjustments we made (slowed pace, floor…). */
  notes: string[];
  targets: {
    kcal: number;
    /** Comfortable range shown to the user (±100). */
    kcalMin: number;
    kcalMax: number;
    proteinG: number;
    fibreG: number;
    waterMl: number;
    steps: number;
    /** Weekly "flex" allowance for treats, in kcal. */
    flexWeeklyKcal: number;
  } | null;
  /** Estimated day the target is reached (null when maintaining or no pace). */
  goalDay: DayKey | null;
  weeksToGoal: number | null;
}

const round10 = (n: number) => Math.round(n / 10) * 10;
const round50 = (n: number) => Math.round(n / 50) * 50;

const STEPS_BY_ACTIVITY: Record<Profile['activity'], number> = {
  sedentary: 6000,
  light: 7500,
  moderate: 9000,
  active: 10000,
};

/**
 * Build today's plan. `weightKg` is the current weight (morning trend when available, else the
 * profile weight). `adjustKcal` is the sum of weekly adaptive adjustments.
 */
export function computePlan(
  p: Profile,
  opts: { weightKg?: number; adjustKcal?: number; today: DayKey; now?: Date }
): Plan {
  const now = opts.now ?? new Date();
  const weightKg = opts.weightKg ?? p.weightKg;
  const age = ageFrom(p.birthYear, now);
  const minor = age < ADULT_AGE;
  const B = bmr({ formula: p.formula, weightKg, heightCm: p.heightCm, age });
  const T = B * ACTIVITY_FACTOR[p.activity];
  const floor = calorieFloor(p.formula);
  const notes: string[] = [];
  let mode = goalMode(weightKg, p.targetKg);
  const check = checkGoal({ heightCm: p.heightCm, weightKg, targetKg: p.targetKg });
  if (!check.ok) {
    // Unsafe goal: fall back to maintaining (the UI explains why).
    notes.push(check.message);
    mode = 'maintain';
  }

  const base: Omit<Plan, 'targets' | 'goalDay' | 'weeksToGoal' | 'paceKgWeek' | 'requestedPaceKgWeek'> = {
    mode,
    age,
    minor,
    bmi: bmi(weightKg, p.heightCm),
    bmr: Math.round(B),
    tdee: Math.round(T),
    floor,
    notes,
  };

  if (minor) {
    return {
      ...base,
      notes: ['Bloom’s plans are for adults — please plan with a doctor or parent. You can still track food, weight and activity.'],
      paceKgWeek: 0,
      requestedPaceKgWeek: 0,
      targets: null,
      goalDay: null,
      weeksToGoal: null,
    };
  }

  let requested = 0;
  let pace = 0;
  let kcal = T;
  if (mode === 'lose') {
    requested = LOSS_PACE[p.pace];
    pace = requested;
    const cap = Math.floor(weightKg * MAX_LOSS_FRACTION * 100) / 100;
    if (pace > cap) {
      pace = cap;
      notes.push(`We set your pace to ${cap.toFixed(2)} kg a week — never more than 1% of your body weight, so it stays gentle on your body.`);
    }
    kcal = T - (pace * KCAL_PER_KG) / 7;
    if (kcal < floor) {
      kcal = floor;
      const safePace = Math.max(0, Math.floor((((T - floor) * 7) / KCAL_PER_KG) * 100) / 100);
      pace = safePace;
      notes.push(
        safePace > 0
          ? `We slowed your pace to about ${safePace.toFixed(2)} kg a week so your plan never goes below ${floor} kcal a day.`
          : `Your plan stays at ${floor} kcal a day — Bloom never plans lower. Extra movement will do the gentle work.`
      );
    }
  } else if (mode === 'gain') {
    requested = GAIN_PACE[p.pace];
    pace = requested;
    kcal = Math.max(floor, T + (pace * KCAL_PER_KG) / 7);
  } else {
    kcal = Math.max(floor, T);
  }
  // Weekly adaptive tweaks, never below the floor.
  const adjust = opts.adjustKcal ?? 0;
  if (adjust) kcal = Math.max(floor, kcal + adjust);

  const target = round10(kcal);
  // Protein: 1.2 g/kg (loss) or 1.4 g/kg (gain) of the goal-adjusted weight; 1.0 g/kg to maintain.
  // Goal-adjusted weight = target weight for loss (never above current), current for maintain.
  const refKg = mode === 'lose' ? Math.min(weightKg, Math.max(p.targetKg, minHealthyWeight(p.heightCm))) : mode === 'gain' ? p.targetKg : weightKg;
  const perKg = mode === 'lose' ? 1.2 : mode === 'gain' ? 1.4 : 1.0;
  const proteinG = Math.min(Math.round(refKg * perKg), p.formula === 'male' ? 160 : 130);
  const waterMl = Math.min(4000, Math.max(1500, Math.round((weightKg * 35) / 250) * 250));
  const flex = Math.min(400, Math.max(200, round50(target * 0.1)));

  const diff = Math.abs(p.targetKg - weightKg);
  const weeks = mode !== 'maintain' && pace > 0 ? Math.ceil((diff / pace) * 10) / 10 : null;
  const goalDay = weeks !== null ? addDays(opts.today, Math.round(weeks * 7)) : null;

  return {
    ...base,
    paceKgWeek: Math.round(pace * 100) / 100,
    requestedPaceKgWeek: requested,
    targets: {
      kcal: target,
      kcalMin: Math.max(floor, target - RANGE_HALF_WIDTH),
      kcalMax: target + RANGE_HALF_WIDTH,
      proteinG,
      fibreG: FIBRE_G,
      waterMl,
      steps: STEPS_BY_ACTIVITY[p.activity],
      flexWeeklyKcal: flex,
    },
    goalDay,
    weeksToGoal: weeks,
  };
}

/** Today's food allowance: plan target + 50% of logged exercise ("extra burn"). */
export function dayAllowance(targetKcal: number, exerciseKcal: number): number {
  return Math.round(targetKcal + Math.max(0, exerciseKcal) * 0.5);
}

/** Friendly status line for the day ("aim around", never "over limit"). */
export function intakeStatus(eaten: number, min: number, max: number): { key: 'under' | 'in' | 'over'; text: string } {
  if (eaten < min) return { key: 'under', text: `About ${Math.round(min - eaten)} kcal to go — aim around your range.` };
  if (eaten <= max) return { key: 'in', text: 'Right in your comfortable range. Nicely done.' };
  return { key: 'over', text: 'A little above today’s range — that’s what the weekly flex is for. Tomorrow is a fresh start.' };
}
