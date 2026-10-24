/**
 * AI quick add for food: "2 roti, dal, salad" → items with estimated nutrients, which the
 * user confirms or edits before anything is saved. Labelled "AI estimate" in the UI.
 *
 * Reuses the coach's Gemini client (src/ai/gemini.ts `generate`: model fallback, key transport,
 * error mapping) and the same key storage (src/ai/key.ts). Structured output is requested with
 * generationConfig.responseMimeType = "application/json" + responseSchema (OpenAPI-style
 * schema, uppercase types) — verified on ai.google.dev (generate-content reference, JSON mode).
 * The fields are injected through generate()'s `fetchImpl` hook, so the shared client stays
 * unchanged. If a model rejects the schema we retry once with JSON mode only.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { generate, GeminiError, type FetchLike, type FetchResponseLike } from '../ai/gemini';
import { loadKey, MissingAiKeyError } from '../ai/key';

export interface AiFoodItem {
  name: string;
  quantity: number;
  unit: string;
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
}

/** Read-only: the coach remembers the last model that worked under this key. */
const LAST_MODEL_KEY = 'bloom.gemini.lastModel';
const AUTH_MODE_KEY = 'bloom.gemini.authMode';

export const FOOD_SCHEMA = {
  type: 'OBJECT',
  properties: {
    items: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          name: { type: 'STRING', description: 'Food name in plain English, e.g. "Roti" or "Dal tadka"' },
          quantity: { type: 'NUMBER', description: 'How many units the user ate' },
          unit: { type: 'STRING', description: 'Unit such as piece, bowl, cup, katori, glass, g' },
          kcal: { type: 'NUMBER', description: 'Total kcal for the whole quantity' },
          protein: { type: 'NUMBER', description: 'Total protein in grams' },
          carbs: { type: 'NUMBER', description: 'Total carbohydrate in grams' },
          fat: { type: 'NUMBER', description: 'Total fat in grams' },
        },
        required: ['name', 'quantity', 'unit', 'kcal', 'protein', 'carbs', 'fat'],
        propertyOrdering: ['name', 'quantity', 'unit', 'kcal', 'protein', 'carbs', 'fat'],
      },
    },
  },
  required: ['items'],
} as const;

export const FOOD_SYSTEM = `You estimate nutrition for home-style Indian (and everyday) food that a user describes.
Return JSON only, matching the schema. One item per distinct food. Assume typical Indian home portions:
1 roti/chapati ≈ 30 g dry atta (≈120 kcal), 1 katori dal ≈ 150 ml, 1 bowl rice ≈ 150 g cooked.
Numbers are totals for the quantity eaten. If something is unclear, make a sensible typical estimate.
Never add foods the user did not mention.`;

/** Wraps a fetch so the request body gets JSON-mode generationConfig fields. */
export function withJsonMode(base: FetchLike, schema: unknown | null): FetchLike {
  return async (url, init) => {
    let body = init.body;
    try {
      const j = JSON.parse(init.body) as { generationConfig?: Record<string, unknown> };
      j.generationConfig = { ...(j.generationConfig ?? {}), responseMimeType: 'application/json' };
      if (schema) j.generationConfig.responseSchema = schema;
      body = JSON.stringify(j);
    } catch {
      // leave the body untouched
    }
    return base(url, { ...init, body });
  };
}

const num = (v: unknown) => {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 10) / 10 : 0;
};

/** Parse the model's JSON (tolerates code fences). Invalid items are dropped. */
export function parseFoodJson(text: string): AiFoodItem[] {
  const cleaned = text.replace(/^\s*```(?:json)?/i, '').replace(/```\s*$/, '').trim();
  let j: unknown;
  try {
    j = JSON.parse(cleaned);
  } catch {
    const m = cleaned.match(/\{[\s\S]*\}/);
    if (!m) return [];
    try {
      j = JSON.parse(m[0]);
    } catch {
      return [];
    }
  }
  const arr = Array.isArray(j) ? j : (j as { items?: unknown[] })?.items;
  if (!Array.isArray(arr)) return [];
  return arr
    .map((x) => x as Record<string, unknown>)
    .filter((x) => x && typeof x.name === 'string' && x.name.trim())
    .slice(0, 15)
    .map((x) => ({
      name: String(x.name).trim().slice(0, 80),
      quantity: num(x.quantity) || 1,
      unit: typeof x.unit === 'string' && x.unit.trim() ? x.unit.trim().slice(0, 20) : 'serving',
      kcal: Math.min(3000, num(x.kcal)),
      protein: Math.min(300, num(x.protein)),
      carbs: Math.min(500, num(x.carbs)),
      fat: Math.min(300, num(x.fat)),
    }));
}

const defaultFetch: FetchLike = (url, init) => globalThis.fetch(url, init) as unknown as Promise<FetchResponseLike>;

export async function hasAiKey(): Promise<boolean> {
  return !!(await loadKey());
}

/**
 * Ask Gemini to itemise a meal description. Throws GeminiError (friendly message) or Error when
 * no key is set.
 */
export async function aiParseFood(
  description: string,
  opts: { fetchImpl?: FetchLike; key?: string; signal?: AbortSignal } = {}
): Promise<AiFoodItem[]> {
  const key = opts.key ?? (await loadKey());
  if (!key) throw new MissingAiKeyError('Set up AI Coach to use AI quick add. It’s free and takes about a minute.');
  const [lastModel, auth] = await Promise.all([
    AsyncStorage.getItem(LAST_MODEL_KEY).catch(() => null),
    AsyncStorage.getItem(AUTH_MODE_KEY).catch(() => null),
  ]);
  const base = opts.fetchImpl ?? defaultFetch;
  const run = (schema: unknown | null) =>
    generate({
      key,
      system: FOOD_SYSTEM,
      turns: [{ role: 'user', text: `What I ate: ${description.trim().slice(0, 500)}` }],
      maxOutputTokens: 1024,
      lastWorkingModel: lastModel,
      authMode: auth === 'query' || auth === 'header' ? auth : null,
      fetchImpl: withJsonMode(base, schema),
      canStream: false,
      signal: opts.signal,
    });
  let text: string;
  try {
    text = (await run(FOOD_SCHEMA)).text;
  } catch (e) {
    if (e instanceof GeminiError && e.kind === 'bad-request') text = (await run(null)).text;
    else throw e;
  }
  const items = parseFoodJson(text);
  if (!items.length) throw new Error('Couldn’t understand that — try listing foods with commas, like “2 roti, dal, salad”.');
  return items;
}
