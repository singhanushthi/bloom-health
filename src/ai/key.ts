/**
 * Gemini API key handling. Pure helpers (tested) + expo-secure-store persistence.
 *
 * Formats accepted:
 *  - "AQ."   — AI Studio auth keys (the default for keys created since May 2026)
 *  - "AIza"  — older standard keys (still work when restricted)
 * Only surrounding whitespace is removed; the key itself is never altered, logged or
 * sent anywhere except generativelanguage.googleapis.com (in the x-goog-api-key header).
 */

export const KEY_PREFIXES = ['AQ.', 'AIza'] as const;

/** Trim whitespace only (pasting often adds a newline or spaces). */
export function normalizeKey(raw: string): string {
  return raw.trim();
}

export type KeyCheck = { ok: true; key: string } | { ok: false; error: string };

/** Local format check before any network call. */
export function checkKeyFormat(raw: string): KeyCheck {
  const key = normalizeKey(raw);
  if (!key) return { ok: false, error: 'Paste your Gemini API key first.' };
  if (/\s/.test(key)) return { ok: false, error: 'The key can’t contain spaces or line breaks — copy it again.' };
  if (!KEY_PREFIXES.some((p) => key.startsWith(p)))
    return { ok: false, error: 'Gemini keys start with “AQ.” or “AIza”. Copy the whole key from AI Studio.' };
  if (key.length < 20) return { ok: false, error: 'That key looks too short — copy the whole key.' };
  return { ok: true, key };
}

/** "…wxyz" — the only part of the key ever shown on screen after saving. */
export function maskKey(key: string): string {
  return `…${key.slice(-4)}`;
}

/* ------------------------------ Persistence ------------------------------ */

const STORE_KEY = 'bloom.gemini.key';

type SecureStoreModule = typeof import('expo-secure-store');

function secureStore(): SecureStoreModule | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('expo-secure-store') as SecureStoreModule;
  } catch {
    return null;
  }
}

export async function loadKey(): Promise<string | null> {
  const s = secureStore();
  if (!s) return null;
  try {
    return await s.getItemAsync(STORE_KEY);
  } catch {
    return null;
  }
}

export async function saveKey(key: string): Promise<void> {
  const s = secureStore();
  if (!s) throw new Error('Secure storage isn’t available in this build.');
  await s.setItemAsync(STORE_KEY, key);
}

export async function removeKey(): Promise<void> {
  const s = secureStore();
  if (!s) return;
  try {
    await s.deleteItemAsync(STORE_KEY);
  } catch {
    // already gone
  }
}
