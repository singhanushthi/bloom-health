/**
 * Friendly product health check for packaged foods (pure, tested).
 *
 * Uses the UK FSA front-of-pack "traffic light" thresholds for foods, per 100 g:
 *   sugars:        low ≤ 5      high > 22.5
 *   salt:          low ≤ 0.3    high > 1.5
 *   fat:           low ≤ 3      high > 17.5
 *   saturated fat: low ≤ 1.5    high > 5      (used instead of total fat when the label has it)
 *
 * Points: high = 2, medium = 1, low = 0 for sugar, salt and (sat-)fat. Bonuses: protein ≥ 10 g
 * and fibre ≥ 6 g per 100 g each take off a point. Total ≤ 1 → "Everyday", 2–3 → "Sometimes",
 * ≥ 4 → "Treat". Very sugary items with little protein/fibre (sweets, sweetened drinks) are never
 * labelled "Everyday". The wording is always kind — no food is "bad".
 */
import type { Nutrition100 } from './pantry';

export type Level = 'low' | 'medium' | 'high';
export type HealthLabel = 'everyday' | 'sometimes' | 'treat';

export const THRESHOLDS = {
  sugar: { low: 5, high: 22.5 },
  salt: { low: 0.3, high: 1.5 },
  fat: { low: 3, high: 17.5 },
  satFat: { low: 1.5, high: 5 },
} as const;

export const PROTEIN_BONUS_G = 10;
export const FIBRE_BONUS_G = 6;

export const HEALTH_LABEL_TEXT: Record<HealthLabel, string> = {
  everyday: 'Everyday',
  sometimes: 'Sometimes',
  treat: 'Treat',
};

export const HEALTH_MESSAGE: Record<HealthLabel, string> = {
  everyday: 'A good everyday pick.',
  sometimes: 'Fine sometimes — pair it with veggies or some protein.',
  treat: 'A treat — enjoy it in small portions.',
};

export const LEVEL_TEXT: Record<Level, string> = { low: 'Low', medium: 'Medium', high: 'High' };

export function levelOf(value: number, t: { low: number; high: number }): Level {
  if (value > t.high) return 'high';
  if (value <= t.low) return 'low';
  return 'medium';
}

export interface NutrientRow {
  key: 'sugar' | 'salt' | 'fat' | 'satFat';
  label: string;
  value: number;
  level: Level;
}

export interface HealthCheck {
  label: HealthLabel;
  title: string;
  message: string;
  score: number;
  rows: NutrientRow[];
  /** Positive notes, e.g. "Good source of protein (12 g)". */
  positives: string[];
  /** Nutri-Score letter (A–E) from Open Food Facts, if known. */
  nutriscore: string | null;
  /** Accessible one-line summary with numbers and words. */
  summary: string;
}

const POINTS: Record<Level, number> = { low: 0, medium: 1, high: 2 };
const fmt = (n: number) => (n >= 10 ? String(Math.round(n)) : String(Math.round(n * 10) / 10));

export function normalizeNutriscore(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const s = v.trim().toLowerCase();
  return /^[a-e]$/.test(s) ? s.toUpperCase() : null;
}

export function healthCheck(n: Nutrition100, nutriscore?: string | null): HealthCheck {
  const sugar = Math.max(0, n.sugar || 0);
  const salt = Math.max(0, n.salt || 0);
  const useSat = n.satFat != null && Number.isFinite(n.satFat);
  const rows: NutrientRow[] = [
    { key: 'sugar', label: 'Sugar', value: sugar, level: levelOf(sugar, THRESHOLDS.sugar) },
    { key: 'salt', label: 'Salt', value: salt, level: levelOf(salt, THRESHOLDS.salt) },
    useSat
      ? { key: 'satFat', label: 'Saturated fat', value: n.satFat as number, level: levelOf(n.satFat as number, THRESHOLDS.satFat) }
      : { key: 'fat', label: 'Fat', value: Math.max(0, n.fat || 0), level: levelOf(Math.max(0, n.fat || 0), THRESHOLDS.fat) },
  ];
  let score = rows.reduce((s, r) => s + POINTS[r.level], 0);
  const positives: string[] = [];
  if (n.protein >= PROTEIN_BONUS_G) {
    score -= 1;
    positives.push(`Good source of protein (${fmt(n.protein)} g)`);
  }
  if (n.fiber >= FIBRE_BONUS_G) {
    score -= 1;
    positives.push(`High in fibre (${fmt(n.fiber)} g)`);
  }
  score = Math.max(0, score);
  let label: HealthLabel = score <= 1 ? 'everyday' : score <= 3 ? 'sometimes' : 'treat';
  // Sugary with little else (sweets, sweetened drinks): at least "Sometimes".
  if (label === 'everyday' && sugar > 8 && n.protein < 5 && n.fiber < 3) label = 'sometimes';
  const ns = normalizeNutriscore(nutriscore ?? null);
  const summary =
    `${HEALTH_LABEL_TEXT[label]}. ${HEALTH_MESSAGE[label]} Per 100 grams: ` +
    rows.map((r) => `${r.label.toLowerCase()} ${fmt(r.value)} grams, ${LEVEL_TEXT[r.level].toLowerCase()}`).join('; ') +
    '.' +
    (positives.length ? ` ${positives.join('. ')}.` : '') +
    (ns ? ` Nutri-Score ${ns}.` : '');
  return { label, title: HEALTH_LABEL_TEXT[label], message: HEALTH_MESSAGE[label], score, rows, positives, nutriscore: ns, summary };
}
