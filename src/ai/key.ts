/**
 * Gemini API key handling. Pure helpers (tested) + expo-secure-store persistence.
 *
 * Formats accepted:
 *  - "AQ."   — AI Studio auth keys (the default for keys created since May 2026)
 *  - "AIza"  — older standard keys (still work when restricted)
 * Only surrounding whitespace is removed; the key itself is never altered, logged or
 * sent anywhere except generativelanguage.googleapis.com (x-goog-api-key header, or ?key= if the
 * header is rejected — see AuthMode in gemini.ts).
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

/**
 * Clean text pasted from the clipboard: trims whitespace and strips surrounding quotes
 * ("…", '…', `…`, “…”, ‘…’) that notes apps and chats often add. Never logged.
 */
export function cleanPastedKey(raw: string): string {
  let s = raw.trim();
  for (let i = 0; i < 2; i++) {
    const m = /^["'`“”‘’]+([\s\S]*?)["'`“”‘’]+$/.exec(s);
    if (!m) break;
    s = m[1].trim();
  }
  return s;
}

/**
 * Lenient check for the key screen. Blocks only what can never work (empty, spaces inside);
 * an unknown prefix or a short key gets a gentle warning but can still be tried.
 */
export type KeyInspection =
  | { level: 'empty' }
  | { level: 'error'; message: string }
  | { level: 'warn'; message: string }
  | { level: 'ok'; format: 'AQ.' | 'AIza' };

export function inspectKey(raw: string): KeyInspection {
  const key = normalizeKey(raw);
  if (!key) return { level: 'empty' };
  if (/\s/.test(key)) return { level: 'error', message: 'The key has a space or line break in it. Copy it again from AI Studio.' };
  const prefix = KEY_PREFIXES.find((p) => key.startsWith(p));
  if (!prefix)
    return {
      level: 'warn',
      message: 'Gemini keys usually start with “AQ.” or “AIza”. You can still try this one.',
    };
  if (key.length < 20) return { level: 'warn', message: 'This key looks short. Make sure you copied all of it.' };
  return { level: 'ok', format: prefix };
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
