/**
 * Local free-text parsing: "I have paneer, palak, 2 onions aur tamatar" → ingredient keys.
 * No network, no AI. Longest alias wins ("kidney beans" before "beans"), simple plurals work,
 * Hindi (Devanagari) names work, and anything unrecognised is returned so the UI can offer to
 * add it as a custom item.
 */
import { INGREDIENTS } from './ingredients';

export interface ParseResult {
  /** Matched ingredient keys, in the order first mentioned, de-duplicated. */
  keys: string[];
  /** Pieces of text that didn't match anything (cleaned, for "add as custom item"). */
  unknown: string[];
}

const isWordChar = (ch: string | undefined) => !!ch && /[a-z0-9ऀ-ॿ]/.test(ch);

export function normalizeText(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFC')
    .replace(/[‘’']/g, '')
    .replace(/[^a-z0-9ऀ-ॿ\s]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

type Term = { term: string; key: string };

let TERMS: Term[] | null = null;
function terms(): Term[] {
  if (!TERMS) {
    const list: Term[] = [];
    for (const i of INGREDIENTS) {
      for (const t of [i.name, ...i.aliases]) {
        const n = normalizeText(t);
        if (n.length >= 2) list.push({ term: n, key: i.key });
        // "Moong dal (yellow)" → also "moong dal"
        const base = normalizeText(t.replace(/\(.*?\)/g, ''));
        if (base && base !== n && base.length >= 2) list.push({ term: base, key: i.key });
      }
    }
    TERMS = list.sort((a, b) => b.term.length - a.term.length);
  }
  return TERMS;
}

const FILLER = new Set(
  [
    'i', 'have', 'got', 'some', 'a', 'an', 'the', 'and', 'aur', 'or', 'with', 'of', 'my', 'in', 'kitchen', 'fridge', 'at', 'home',
    'mere', 'paas', 'pass', 'hai', 'hain', 'h', 'bhi', 'thoda', 'thodi', 'little', 'bit', 'few', 'packet', 'packets', 'pack', 'kg', 'g',
    'gm', 'gms', 'gram', 'grams', 'ml', 'l', 'litre', 'liter', 'pcs', 'pc', 'piece', 'pieces', 'bunch', 'dozen', 'half', 'fresh', 'also',
    'there', 'is', 'are', 'we', 'left', 'leftover', 'only', 'just', 'plus', 'etc', 'bowl', 'cup', 'cups', 'tbsp', 'tsp', 'can', 'jar',
  ].map((w) => w)
);

/** Find every ingredient mentioned in `text`. */
export function parseFreeText(text: string): ParseResult {
  // Keep list separators as "|" so unknown leftovers stay separate ("xyz, abc" → two items).
  const src = ` ${text
    .toLowerCase()
    .normalize('NFC')
    .replace(/[\u2018\u2019']/g, '')
    .replace(/[,;\n&+/]+/g, ' | ')
    .replace(/[^a-z0-9\u0900-\u097f\s|]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()} `;
  if (!src.replace(/\|/g, '').trim()) return { keys: [], unknown: [] };
  const used = new Array<boolean>(src.length).fill(false);
  const found: { key: string; at: number }[] = [];

  for (const { term, key } of terms()) {
    let from = 0;
    while (from < src.length) {
      const at = src.indexOf(term, from);
      if (at < 0) break;
      from = at + 1;
      if (isWordChar(src[at - 1])) continue;
      // Allow simple plurals: tomato → tomatoes, onion → onions.
      let end = at + term.length;
      if (!isWordChar(src[end])) {
        // exact word
      } else if (src.startsWith('es', end) && !isWordChar(src[end + 2])) end += 2;
      else if (src[end] === 's' && !isWordChar(src[end + 1])) end += 1;
      else continue;
      let overlap = false;
      for (let k = at; k < end; k++) if (used[k]) overlap = true;
      if (overlap) continue;
      for (let k = at; k < end; k++) used[k] = true;
      found.push({ key, at });
    }
  }

  const keys: string[] = [];
  for (const f of found.sort((a, b) => a.at - b.at)) if (!keys.includes(f.key)) keys.push(f.key);

  // Leftover text, split on commas/"and"/"aur" in the ORIGINAL text order.
  let rest = '';
  for (let k = 0; k < src.length; k++) rest += used[k] ? ' ' : src[k];
  const unknown = rest
    .split(/\||\s{2,}|\band\b|\baur\b|\bor\b/)
    .map((chunk) =>
      chunk
        .split(' ')
        .filter((w) => w && !FILLER.has(w) && !/^\d+(\.\d+)?$/.test(w) && !/^\d+(g|kg|ml|l|gm|gms|pcs)$/.test(w))
        .join(' ')
        .trim()
    )
    .filter((c) => c.length >= 2);
  return { keys, unknown: Array.from(new Set(unknown)).slice(0, 10) };
}

/** Best single ingredient for a product name ("Amul Malai Paneer 200g" → paneer), or null. */
export function guessIngredientKey(productName: string): string | null {
  const { keys } = parseFreeText(productName);
  return keys[0] ?? null;
}
