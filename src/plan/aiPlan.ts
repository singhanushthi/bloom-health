/**
 * "Ask Bloom for a weekly plan": a friendly 7-day Indian meal + yoga outline built from the
 * profile, preferences and recent logs. Sent through the coach (useCoach().ask).
 * Only aggregates and food item names are sent — no notes.
 */
import type { PlanState } from './data';
import { ACTIVITY_COPY, DIET_HINT, DIET_LABEL } from './profile';

export const WEEKLY_PLAN_DISCLAIMER = 'General guidance, not medical advice.';

export const WEEKLY_PLAN_SYSTEM = `You are Bloom's friendly nutrition and movement helper.
Write a simple, flexible 7-day outline of Indian home-style meals plus a short yoga or movement idea for each day.
Rules:
- Match the diet preference strictly (Jain: vegetarian with no onion, garlic or root vegetables).
- Keep each day near the calorie range given; show an approximate kcal per day. Be relaxed, not strict.
- Include at least one small treat in the week and say it's planned on purpose.
- Use easy, affordable foods; vary them; make protein visible at most meals.
- Plain text, no tables. One short line per meal. Under 350 words.
- Never diagnose or mention medication. End with: "${WEEKLY_PLAN_DISCLAIMER}"`;

export function weeklyPlanPrompt(s: PlanState): string {
  const p = s.profile;
  const t = s.plan?.targets;
  if (!p || !t) return 'Give me a gentle 7-day Indian vegetarian meal and yoga outline.';
  const recentFoods = Array.from(new Set(s.food.map((f) => f.name))).slice(0, 12);
  return [
    `Make my weekly plan.`,
    `Goal: ${s.plan?.mode} weight (now about ${(s.trendKg ?? p.weightKg).toFixed(1)} kg, target ${p.targetKg} kg).`,
    `Daily range: ${t.kcalMin}–${t.kcalMax} kcal, protein about ${t.proteinG} g, fibre ${t.fibreG} g, water ${(t.waterMl / 1000).toFixed(1)} L.`,
    `Diet: ${DIET_LABEL[p.diet]} (${DIET_HINT[p.diet]}).`,
    `Activity: ${ACTIVITY_COPY[p.activity].label}. Yoga goal: ${p.yogaPerWeek} sessions a week (done ${s.yogaThisWeek} so far this week).`,
    recentFoods.length ? `Foods I logged recently: ${recentFoods.join(', ')}.` : 'I haven’t logged food yet.',
    `Weekly flex for treats: about ${t.flexWeeklyKcal} kcal.`,
  ].join('\n');
}
