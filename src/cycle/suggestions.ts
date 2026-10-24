/**
 * Phase suggestions (pure, tested in __tests__/cycleSuggestions.test.ts).
 *
 * Original, plain-language, India-first ideas for food, movement and self-care in each phase.
 * General wellbeing ideas only — not medical advice. Food ideas point at FOODS ids where
 * possible and are filtered by the user's diet preference (incl. Jain) when we know it.
 */
import { FOODS, type Food } from '../content/foods';
import { suggestSessions, type YogaLevel, type YogaSession } from '../content/yoga';
import type { PhaseDetail } from '../health/cyclePrediction';
import { fitsDiet } from '../plan/adapt';
import type { DietPref } from '../plan/profile';
import { PATTERN_LABEL } from './insights';

export interface FoodIdea {
  /** FOODS id, when the idea is a single food from the database. */
  foodId?: string;
  name: string;
  why: string;
}

export interface MovementIdea {
  sessions: Pick<YogaSession, 'id' | 'title' | 'minutes' | 'goal' | 'periodFriendly'>[];
  walk: string;
  note: string;
}

export interface PhaseSuggestions {
  phase: PhaseDetail;
  title: string;
  /** What's typical for energy and mood (general, not a prediction about you). */
  typical: string;
  food: FoodIdea[];
  foodNote?: string;
  movement: MovementIdea;
  selfCare: string[];
  /** Three short tips for the "Today in your cycle" card (personalised first). */
  tips: string[];
}

export const PHASE_TITLE: Record<PhaseDetail, string> = {
  menstrual: 'Period days',
  follicular: 'Follicular phase',
  ovulation: 'Around ovulation',
  luteal: 'Luteal phase',
  pms: 'The days before your period',
};

export const PHASE_TYPICAL: Record<PhaseDetail, string> = {
  menstrual: 'Energy is often lower and you may want more rest. Being gentle with yourself is the plan.',
  follicular: 'Energy and mood often lift as oestrogen rises. A good time to try new things.',
  ovulation: 'Many people feel their most social and energetic now.',
  luteal: 'Energy can slowly dip and appetite may go up. Steady meals and calm routines help.',
  pms: 'Bloating, cravings, tender breasts or a shorter fuse are common. It passes.',
};

/** Ordered food candidates per phase. A `foodId` must exist in FOODS (tested). */
interface Cand extends FoodIdea {
  /** For name-only ideas: diet tag used for filtering. */
  diet?: Food['diet'];
}

const CANDIDATES: Record<PhaseDetail, Cand[]> = {
  menstrual: [
    { foodId: 'palak-paneer', name: 'Palak paneer', why: 'Spinach brings iron to replace what you lose.' },
    { foodId: 'spinach', name: 'Spinach (palak)', why: 'Iron-rich; add a squeeze of lemon to help absorb it.' },
    { foodId: 'rajma', name: 'Rajma', why: 'Iron and protein to keep you steady.' },
    { foodId: 'dates', name: 'Dates', why: 'A naturally sweet, iron-containing snack — 2–3 is plenty.' },
    { foodId: 'jaggery', name: 'Jaggery (gur), a small piece', why: 'A little iron with your chai — keep it small.' },
    { foodId: 'boiled-egg', name: 'Boiled egg', why: 'Easy protein and iron when cooking feels like a lot.' },
    { foodId: 'haldi-doodh', name: 'Haldi doodh', why: 'Warm and soothing before bed.' },
    { foodId: 'khichdi', name: 'Moong dal khichdi', why: 'Gentle on the stomach on heavy days.' },
    { name: 'Warm water through the day', why: 'Staying hydrated can ease bloating and headaches.', diet: 'vegan' },
  ],
  follicular: [
    { foodId: 'moong-sprouts', name: 'Moong sprouts', why: 'Protein, fibre and B vitamins for rising energy.' },
    { foodId: 'besan-chilla', name: 'Besan chilla', why: 'A protein-rich breakfast to fuel active days.' },
    { foodId: 'guava', name: 'Guava', why: 'Lots of vitamin C to keep restoring iron.' },
    { foodId: 'curd', name: 'Curd (dahi)', why: 'Protein and good bacteria for digestion.' },
    { foodId: 'omelette', name: 'Masala omelette', why: 'Quick protein before a workout.' },
    { foodId: 'grilled-fish', name: 'Grilled fish', why: 'Lean protein with healthy fats.' },
  ],
  ovulation: [
    { foodId: 'kachumber', name: 'Kachumber salad', why: 'Fresh, high-fibre and hydrating.' },
    { foodId: 'quinoa', name: 'Quinoa', why: 'Fibre and protein that keep energy even.' },
    { foodId: 'pomegranate', name: 'Pomegranate', why: 'Antioxidant-rich and refreshing.' },
    { foodId: 'flaxseeds', name: 'Flaxseeds', why: 'A spoon on curd or roti dough adds fibre and omega-3.' },
    { foodId: 'coconut-water', name: 'Coconut water', why: 'Hydration on active, warm days.' },
    { foodId: 'grilled-chicken-breast', name: 'Grilled chicken', why: 'Lean protein for muscle recovery.' },
  ],
  luteal: [
    { foodId: 'banana', name: 'Banana', why: 'Magnesium and potassium; a calm, filling snack.' },
    { foodId: 'almonds', name: 'Almonds', why: 'Magnesium may help with cramps and mood — a small handful.' },
    { foodId: 'sweet-potato', name: 'Sweet potato', why: 'Slow carbs that help with cravings.' },
    { foodId: 'dalia', name: 'Dalia', why: 'A warm, high-fibre bowl that keeps you full.' },
    { foodId: 'pumpkin-seeds', name: 'Pumpkin seeds', why: 'Zinc and magnesium — sprinkle on anything.' },
    { foodId: 'dark-chocolate', name: 'Dark chocolate, a small square', why: 'Magnesium, and it settles a sweet craving.' },
  ],
  pms: [
    { foodId: 'banana', name: 'Banana', why: 'Potassium helps balance salt and may ease bloating.' },
    { foodId: 'makhana', name: 'Roasted makhana', why: 'A crunchy swap for salty namkeen.' },
    { foodId: 'coconut-water', name: 'Coconut water', why: 'Hydrates without extra salt.' },
    { foodId: 'walnuts', name: 'Walnuts', why: 'Omega-3 and magnesium for mood and cramps.' },
    { foodId: 'dark-chocolate', name: 'Dark chocolate, a small square', why: 'Takes the edge off a craving.' },
    { foodId: 'cucumber', name: 'Cucumber', why: 'Watery and light when you feel puffy.' },
  ],
};

const FOOD_NOTE: Partial<Record<PhaseDetail, string>> = {
  menstrual: 'Pair iron foods with vitamin C (lemon, amla, guava) and keep chai away from meals.',
  pms: 'Go easy on salty namkeen, pickle and papad for a few days — salt can add to bloating.',
  luteal: 'Regular meals help keep cravings and mood swings steadier.',
};

const FOOD_BY_ID = new Map(FOODS.map((f) => [f.id, f]));

/** Food ideas for a phase, filtered by diet (when known). Returns 3–4 ideas. */
export function foodIdeas(phase: PhaseDetail, diet?: DietPref | null, max = 4): FoodIdea[] {
  const out: FoodIdea[] = [];
  for (const c of CANDIDATES[phase]) {
    if (out.length >= max) break;
    if (diet) {
      const food = c.foodId ? FOOD_BY_ID.get(c.foodId) : undefined;
      const subject = food ?? { name: c.name, aliases: [], diet: c.diet ?? 'veg' };
      if (!fitsDiet(subject, diet)) continue;
    }
    out.push({ ...(c.foodId ? { foodId: c.foodId } : {}), name: c.name, why: c.why });
  }
  return out;
}

/* -------------------------------- Movement ------------------------------- */

const ENERGETIC: YogaSession['goal'][] = ['morning', 'strength', 'weight_loss', 'flexibility'];
const CALMING: YogaSession['goal'][] = ['stress', 'evening', 'digestion'];

const pickSessions = (list: YogaSession[], n = 2) =>
  list.slice(0, n).map(({ id, title, minutes, goal, periodFriendly }) => ({ id, title, minutes, goal, periodFriendly }));

function unique(list: YogaSession[]): YogaSession[] {
  const seen = new Set<string>();
  return list.filter((s) => (seen.has(s.id) ? false : (seen.add(s.id), true)));
}

export function movementFor(phase: PhaseDetail, level: YogaLevel = 'beginner'): MovementIdea {
  switch (phase) {
    case 'menstrual':
      return {
        sessions: pickSessions(suggestSessions({ level, goal: 'period_relief', onPeriod: true })),
        walk: 'A slow 10–15 minute walk, only if you feel up to it.',
        note: 'Rest days count. Skip inversions and strong twists while bleeding.',
      };
    case 'follicular':
    case 'ovulation': {
      const order = phase === 'ovulation' ? ['strength', 'weight_loss', 'morning', 'flexibility'] : ENERGETIC;
      const list = unique(
        order.flatMap((g) => suggestSessions({ level, goal: g as YogaSession['goal'] }).filter((s) => s.goal === g))
      );
      return {
        sessions: pickSessions(list),
        walk: phase === 'ovulation' ? 'A brisk 30-minute walk or a dance break.' : 'A brisk 20–30 minute walk, maybe with a friend.',
        note: 'A good window to push a little harder if you feel like it.',
      };
    }
    case 'luteal':
    case 'pms': {
      const list = unique(
        CALMING.flatMap((g) => suggestSessions({ level, goal: g, onPeriod: phase === 'pms' }).filter((s) => s.goal === g))
      );
      return {
        sessions: pickSessions(list),
        walk: phase === 'pms' ? 'An easy evening walk after dinner can help with bloating.' : 'A steady 20-minute walk after a meal.',
        note: 'Swap intense workouts for steady, calming ones if your energy dips.',
      };
    }
  }
}

/* ------------------------------- Self-care ------------------------------- */

const SELF_CARE: Record<PhaseDetail, string[]> = {
  menstrual: [
    'A hot water bag on your lower belly or back for 15–20 minutes.',
    'Aim for an early night — 7–9 hours helps with tiredness.',
    'Keep a spare pad or cup and painkiller in your bag.',
  ],
  follicular: [
    'Plan the harder tasks of your week now.',
    'Get some morning sunlight to keep sleep on track.',
    'Try something new — a class, a recipe, a route.',
  ],
  ovulation: [
    'Drink a little more water on active days.',
    'Use the social energy — call a friend or plan an outing.',
    'Keep up regular sleep even when you feel wired.',
  ],
  luteal: [
    'Wind down with a screen-free half hour before bed.',
    'Five minutes of slow breathing when you feel tense.',
    'Keep easy snacks handy so long gaps don’t turn into cravings.',
  ],
  pms: [
    'Lower your to-do list where you can — it’s okay to say no.',
    'A warm bath or hot water bag for tender, achy days.',
    'Write down what you feel; it often helps it pass.',
  ],
};

/** Personal tip for a symptom you often log in this phase. */
const SYMPTOM_TIP: Record<string, string> = {
  cramps: 'You often log cramps around now — keep a hot water bag ready.',
  headache: 'Headaches often show up for you now — drink water early and keep meals regular.',
  bloating: 'Bloating is common for you now — go lighter on salt and try a walk after meals.',
  fatigue: 'You often feel tired now — plan an earlier night.',
  low_energy: 'Your energy tends to dip now — keep plans light.',
  back_pain: 'Back pain shows up for you now — gentle cat–cow stretches can help.',
  tender_breasts: 'Tender breasts are common for you now — a soft, supportive bra helps.',
  acne: 'Breakouts tend to appear now — keep skincare gentle.',
  pain_strong: 'Pain is often stronger for you now — rest, and see a doctor if it stops you doing daily things.',
  craving_sweet: 'Sweet cravings are common for you now — dates or a banana can help.',
  craving_chocolate: 'Chocolate cravings show up now — a small square of dark chocolate is fine.',
  craving_salty: 'Salty cravings show up now — try roasted makhana instead of namkeen.',
  poor_sleep: 'Your sleep is often lighter now — keep the room cool and dark.',
};

const BASE_TIPS: Record<PhaseDetail, string[]> = {
  menstrual: [
    'Iron-rich food like palak, rajma or dates helps.',
    'Gentle yoga or rest — both are good choices.',
    'A hot water bag can ease cramps.',
  ],
  follicular: [
    'Good time for a stronger workout.',
    'Add protein to breakfast to fuel the day.',
    'Plan the week’s harder tasks now.',
  ],
  ovulation: [
    'Energy is often high — enjoy an active day.',
    'Drink a little more water.',
    'Fibre-rich salads and fruit keep you feeling light.',
  ],
  luteal: [
    'Steady meals help with cravings.',
    'Calming yoga or a walk can lift mood.',
    'Protect your sleep this week.',
  ],
  pms: [
    'Go easy on salt to reduce bloating.',
    'A banana or a few almonds can help with cravings.',
    'Be kind to yourself — this passes.',
  ],
};

export interface SuggestOptions {
  diet?: DietPref | null;
  yogaLevel?: YogaLevel | null;
  /** Symptom/pattern ids the user often logs in this phase (see insights.frequentInPhase). */
  frequentSymptoms?: string[];
}

export function suggestForPhase(phase: PhaseDetail, opts: SuggestOptions = {}): PhaseSuggestions {
  const personal = (opts.frequentSymptoms ?? []).map((s) => SYMPTOM_TIP[s]).filter((t): t is string => !!t);
  const tips = Array.from(new Set([...personal.slice(0, 2), ...BASE_TIPS[phase]])).slice(0, 3);
  return {
    phase,
    title: PHASE_TITLE[phase],
    typical: PHASE_TYPICAL[phase],
    food: foodIdeas(phase, opts.diet),
    foodNote: FOOD_NOTE[phase],
    movement: movementFor(phase, opts.yogaLevel ?? 'beginner'),
    selfCare: SELF_CARE[phase],
    tips,
  };
}

/** Human label for a symptom id used in tips/insights. */
export const symptomLabel = (id: string) => PATTERN_LABEL[id]?.many ?? id;

/** All food ids referenced by the suggestions (for tests). */
export const SUGGESTION_FOOD_IDS = Array.from(
  new Set(Object.values(CANDIDATES).flatMap((cs) => cs.map((c) => c.foodId).filter((x): x is string => !!x)))
);
