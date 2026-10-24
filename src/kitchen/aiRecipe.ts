/**
 * "Make me something healthy with my kitchen" — optional AI recipe (needs the user's Gemini key).
 *
 * Sends ONLY: pantry ingredient names (no brands, barcodes or quantities), diet preference,
 * Jain flag, kcal/protein left for the day (rounded) and the meal type. Reuses the coach's
 * Gemini client (`generate`) with the JSON-mode wrapper from src/plan/aiFood.ts
 * (responseMimeType + responseSchema), and the same key storage. The result is labelled
 * "AI recipe — nutrition is an estimate" in the UI.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  derivedTags,
  isJainRecipe,
  RECIPE_MEAL_LABEL,
  RECIPE_MEALS,
  TAG_LABEL,
  type Recipe,
  type RecipeIngredient,
  type RecipeMeal,
  type RecipeTag,
} from '../content/recipes';
import type { DietTag } from '../content/foods';
import { generate, GeminiError, type FetchLike, type FetchResponseLike } from '../ai/gemini';
import { loadKey } from '../ai/key';
import { withJsonMode } from '../plan/aiFood';
import { DIET_LABEL, type DietPref } from '../plan/profile';
import { getIngredient, kcalFrom, type Unit } from './ingredients';
import { guessIngredientKey } from './parse';

export const AI_RECIPE_LABEL = 'AI recipe — nutrition is an estimate';

/** Same storage keys the coach uses (read-only here). */
const LAST_MODEL_KEY = 'bloom.gemini.lastModel';
const AUTH_MODE_KEY = 'bloom.gemini.authMode';

const UNITS: Unit[] = ['g', 'ml', 'pc', 'tsp', 'tbsp', 'cup', 'pinch'];
const ALLOWED_TAGS = Object.keys(TAG_LABEL) as RecipeTag[];

export const RECIPE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    title: { type: 'STRING', description: 'Short dish name, e.g. "Palak paneer bhurji"' },
    meal: { type: 'STRING', enum: RECIPE_MEALS },
    timeMin: { type: 'NUMBER', description: 'Total minutes including cooking' },
    servings: { type: 'NUMBER', description: 'Number of servings the recipe makes (1–4)' },
    ingredients: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          name: { type: 'STRING', description: 'Plain ingredient name, e.g. "paneer", "onion", "oil"' },
          qty: { type: 'NUMBER', description: 'Amount for the WHOLE recipe' },
          unit: { type: 'STRING', enum: UNITS },
        },
        required: ['name', 'qty', 'unit'],
        propertyOrdering: ['name', 'qty', 'unit'],
      },
    },
    steps: { type: 'ARRAY', items: { type: 'STRING' }, description: '4 to 8 short, plain steps' },
    perServing: {
      type: 'OBJECT',
      properties: {
        kcal: { type: 'NUMBER' },
        protein: { type: 'NUMBER', description: 'grams' },
        carbs: { type: 'NUMBER', description: 'grams of available carbohydrate' },
        fat: { type: 'NUMBER', description: 'grams' },
        fiber: { type: 'NUMBER', description: 'grams' },
      },
      required: ['kcal', 'protein', 'carbs', 'fat', 'fiber'],
      propertyOrdering: ['kcal', 'protein', 'carbs', 'fat', 'fiber'],
    },
    tags: { type: 'ARRAY', items: { type: 'STRING', enum: ALLOWED_TAGS } },
    tip: { type: 'STRING', description: 'One friendly tip' },
  },
  required: ['title', 'meal', 'timeMin', 'servings', 'ingredients', 'steps', 'perServing', 'tip'],
  propertyOrdering: ['title', 'meal', 'timeMin', 'servings', 'ingredients', 'steps', 'perServing', 'tags', 'tip'],
} as const;

export const RECIPE_SYSTEM = `You are Bloom's kind home-cooking helper for an Indian kitchen.
Create ONE healthy, simple home recipe using mainly the ingredients the user has. You may assume salt, water, common Indian spices and cooking oil/ghee. Do not require more than one ingredient the user doesn't have.
Keep oil modest (about 1 teaspoon per serving), prefer whole grains, dals, vegetables and good protein.
Strictly follow the diet rule you are given. Jain means vegetarian with NO onion, garlic, potato, carrot, beetroot, radish, ginger or other root vegetables.
Quantities are for the whole recipe. Nutrition is per serving and should be a realistic estimate.
Return JSON only, matching the schema. Never give medical advice.`;

export interface AiRecipeInput {
  pantryNames: string[];
  diet: DietPref | null;
  remainingKcal: number | null;
  remainingProtein: number | null;
  meal: RecipeMeal;
}

const DIET_RULE: Record<DietPref, string> = {
  veg: 'Vegetarian: no meat, fish or eggs. Dairy is fine.',
  egg: 'Eggetarian: vegetarian plus eggs. No meat or fish.',
  nonveg: 'Non-vegetarian: anything is fine.',
  vegan: 'Vegan: no meat, fish, eggs, dairy, ghee or honey.',
  jain: 'Jain: vegetarian with no onion, garlic, ginger or root vegetables. Dairy is fine. No eggs.',
};

export function buildRecipePrompt(i: AiRecipeInput): string {
  const names = Array.from(new Set(i.pantryNames.map((n) => n.trim()).filter(Boolean))).slice(0, 60);
  const lines = [
    `Meal: ${RECIPE_MEAL_LABEL[i.meal]}.`,
    `Diet: ${i.diet ? `${DIET_LABEL[i.diet]}. ${DIET_RULE[i.diet]}` : 'No preference given — keep it vegetarian-friendly.'}`,
    `Ingredients I have: ${names.length ? names.join(', ') : 'only basic staples'}.`,
  ];
  if (i.remainingKcal != null) lines.push(`Aim for about ${Math.max(150, Math.round(i.remainingKcal))} kcal or less per serving for this meal.`);
  if (i.remainingProtein != null && i.remainingProtein > 15) lines.push(`I still need about ${Math.round(i.remainingProtein)} g protein today — protein-rich is welcome.`);
  return lines.join('\n');
}

const num = (v: unknown, max: number) => {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) && n >= 0 ? Math.min(max, Math.round(n * 10) / 10) : 0;
};

const DIET_RANK: Record<DietTag, number> = { vegan: 0, veg: 1, egg: 2, nonveg: 3 };

export class AiRecipeError extends Error {}

/**
 * Parse and sanity-check the model's JSON into a Recipe. Throws AiRecipeError with a friendly
 * message when it's unusable or breaks the diet rule.
 */
export function parseAiRecipe(text: string, ctx: { diet: DietPref | null; meal: RecipeMeal; now?: Date }): Recipe {
  const cleaned = text.replace(/^\s*```(?:json)?/i, '').replace(/```\s*$/, '').trim();
  let j: Record<string, unknown>;
  try {
    j = JSON.parse(cleaned) as Record<string, unknown>;
  } catch {
    const m = cleaned.match(/\{[\s\S]*\}/);
    if (!m) throw new AiRecipeError('The recipe came back garbled — please try again.');
    try {
      j = JSON.parse(m[0]) as Record<string, unknown>;
    } catch {
      throw new AiRecipeError('The recipe came back garbled — please try again.');
    }
  }
  const title = typeof j.title === 'string' ? j.title.trim().slice(0, 80) : '';
  const rawIngs = Array.isArray(j.ingredients) ? (j.ingredients as Record<string, unknown>[]) : [];
  const steps = (Array.isArray(j.steps) ? j.steps : []).filter((s): s is string => typeof s === 'string' && !!s.trim()).map((s) => s.trim().slice(0, 300)).slice(0, 10);
  if (!title || !rawIngs.length || steps.length < 2) throw new AiRecipeError('The recipe came back incomplete — please try again.');

  const ingredients: RecipeIngredient[] = rawIngs
    .filter((x) => x && typeof x.name === 'string' && x.name.trim())
    .slice(0, 20)
    .map((x) => {
      const name = String(x.name).trim().slice(0, 60);
      const key = guessIngredientKey(name);
      const unit = UNITS.includes(x.unit as Unit) ? (x.unit as Unit) : 'g';
      const ri: RecipeIngredient = { key: key ?? `x-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`, qty: num(x.qty, 5000) || 1, unit };
      if (!key) ri.name = name;
      return ri;
    });

  let diet: DietTag = 'vegan';
  for (const i of ingredients) {
    const ing = getIngredient(i.key);
    if (ing && DIET_RANK[ing.diet] > DIET_RANK[diet]) diet = ing.diet;
  }
  const pref = ctx.diet;
  const breaks =
    (pref === 'vegan' && diet !== 'vegan') ||
    ((pref === 'veg' || pref === 'jain') && (diet === 'egg' || diet === 'nonveg')) ||
    (pref === 'egg' && diet === 'nonveg') ||
    (pref === 'jain' && !isJainRecipe(diet, ingredients));
  if (breaks) throw new AiRecipeError('That idea didn’t match your food preference — please try again.');

  const ps = (j.perServing ?? {}) as Record<string, unknown>;
  const protein = num(ps.protein, 200);
  const carbs = num(ps.carbs, 400);
  const fat = num(ps.fat, 200);
  const fiber = num(ps.fiber, 100);
  const atwater = kcalFrom(protein, carbs, fat, fiber);
  let kcal = Math.round(num(ps.kcal, 3000));
  // If the model's kcal disagrees with its own macros by more than 25%, trust the macros.
  if (!kcal || Math.abs(kcal - atwater) > atwater * 0.25) kcal = atwater;
  const servings = Math.min(8, Math.max(1, Math.round(num(j.servings, 8)) || 1));
  const timeMin = Math.min(240, Math.max(5, Math.round(num(j.timeMin, 240)) || 20));
  const meal: RecipeMeal = RECIPE_MEALS.includes(j.meal as RecipeMeal) ? (j.meal as RecipeMeal) : ctx.meal;
  const perServing = { kcal, protein, carbs, fat, fiber };
  const aiTags = (Array.isArray(j.tags) ? j.tags : []).filter((t): t is RecipeTag => ALLOWED_TAGS.includes(t as RecipeTag));
  // Numeric tags are re-derived from the numbers; the model's descriptive tags are kept.
  const numeric: RecipeTag[] = ['high-protein', 'high-fibre', 'low-oil', 'quick'];
  const tags = Array.from(new Set<RecipeTag>([...derivedTags({ perServing, timeMin, ingredients, servings }), ...aiTags.filter((t) => !numeric.includes(t))]));
  const stamp = (ctx.now ?? new Date()).getTime().toString(36);
  return {
    id: `ai-${stamp}`,
    title,
    meal: [meal],
    diet,
    jainOk: isJainRecipe(diet, ingredients),
    timeMin,
    servings,
    ingredients,
    steps: steps.slice(0, 8),
    perServing,
    tags,
    tip: typeof j.tip === 'string' ? j.tip.trim().slice(0, 200) : '',
    source: 'ai',
  };
}

const defaultFetch: FetchLike = (url, init) => globalThis.fetch(url, init) as unknown as Promise<FetchResponseLike>;

export async function aiMakeRecipe(input: AiRecipeInput, opts: { fetchImpl?: FetchLike; key?: string; signal?: AbortSignal; now?: Date } = {}): Promise<Recipe> {
  const key = opts.key ?? (await loadKey());
  if (!key) throw new AiRecipeError('Add your Gemini key in Settings → AI Coach to make AI recipes.');
  const [lastModel, auth] = await Promise.all([
    AsyncStorage.getItem(LAST_MODEL_KEY).catch(() => null),
    AsyncStorage.getItem(AUTH_MODE_KEY).catch(() => null),
  ]);
  const base = opts.fetchImpl ?? defaultFetch;
  const run = (schema: unknown | null) =>
    generate({
      key,
      system: RECIPE_SYSTEM,
      turns: [{ role: 'user', text: buildRecipePrompt(input) }],
      maxOutputTokens: 2048,
      lastWorkingModel: lastModel,
      authMode: auth === 'query' || auth === 'header' ? auth : null,
      fetchImpl: withJsonMode(base, schema),
      canStream: false,
      signal: opts.signal,
    });
  let text: string;
  try {
    text = (await run(RECIPE_SCHEMA)).text;
  } catch (e) {
    if (e instanceof GeminiError && e.kind === 'bad-request') text = (await run(null)).text;
    else throw e;
  }
  return parseAiRecipe(text, { diet: input.diet, meal: input.meal, now: opts.now });
}
