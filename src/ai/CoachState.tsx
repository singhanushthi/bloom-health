/**
 * AI coach state: whether a key is saved (kept in expo-secure-store, never in AsyncStorage),
 * and the last model that worked (AsyncStorage, so the fallback chain starts there).
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { generate, GeminiError, testKey, type AuthMode, type ChatTurn, type GenerateResult } from './gemini';
import { inspectKey, loadKey, maskKey, normalizeKey, removeKey as removeStoredKey, saveKey } from './key';

const MODEL_KEY = 'bloom.gemini.lastModel';
/** 'header' | 'query' — how the key was last accepted. Not secret (never the key itself). */
const AUTH_MODE_KEY = 'bloom.gemini.authMode';

/**
 * What happened when a key was saved and tested. `message` says what happened, `next` is one
 * plain next step. Keys are never part of either.
 */
export type SaveKind =
  | 'ok'
  /** Google accepted the key, but the free limit is used up right now (key is saved). */
  | 'ok-quota'
  | 'format'
  | 'invalid'
  /** An AQ. key was rejected in the header AND as ?key= (the auth fallback). */
  | 'aq-rejected'
  | 'offline'
  | 'busy'
  | 'storage'
  | 'error';

export type SaveOutcome = { ok: boolean; kind: SaveKind; message: string; next?: string };

/** 'gemini-3.8-flash' → 'Gemini 3.8 Flash'. */
export function modelLabel(id: string | null | undefined): string | null {
  if (!id) return null;
  return id
    .split('-')
    .map((w) => (w === 'lite' ? 'Lite' : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(' ')
    .replace('Flash Lite', 'Flash-Lite');
}

export const RESET_HINT = 'The free limit resets around 12:30–1:30 pm IST.';

interface CoachValue {
  ready: boolean;
  hasKey: boolean;
  masked: string | null;
  lastModel: string | null;
  /** Validates format, sends one tiny test request, saves on success. */
  saveAndTestKey: (raw: string) => Promise<SaveOutcome>;
  removeKey: () => Promise<void>;
  ask: (o: { system: string; turns: ChatTurn[]; onText?: (t: string) => void; signal?: AbortSignal }) => Promise<GenerateResult>;
}

const Ctx = createContext<CoachValue | null>(null);

export function CoachProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [key, setKey] = useState<string | null>(null);
  const [lastModel, setLastModel] = useState<string | null>(null);
  const [authMode, setAuthMode] = useState<AuthMode | null>(null);

  useEffect(() => {
    (async () => {
      const [k, m, a] = await Promise.all([
        loadKey(),
        AsyncStorage.getItem(MODEL_KEY).catch(() => null),
        AsyncStorage.getItem(AUTH_MODE_KEY).catch(() => null),
      ]);
      setKey(k);
      setLastModel(m);
      setAuthMode(a === 'query' || a === 'header' ? a : null);
      setReady(true);
    })();
  }, []);

  const rememberAuth = useCallback((a: AuthMode | undefined) => {
    if (!a) return;
    setAuthMode(a);
    AsyncStorage.setItem(AUTH_MODE_KEY, a).catch(() => {});
  }, []);

  const rememberModel = useCallback((m: string) => {
    setLastModel(m);
    AsyncStorage.setItem(MODEL_KEY, m).catch(() => {});
  }, []);

  const saveAndTestKey = useCallback(
    async (raw: string): Promise<SaveOutcome> => {
      const check = inspectKey(raw);
      if (check.level === 'empty') return { ok: false, kind: 'format', message: 'Paste your key first.', next: 'Tap Paste, or long-press the box and choose Paste.' };
      if (check.level === 'error') return { ok: false, kind: 'format', message: check.message, next: 'Open AI Studio, tap the copy icon next to your key, then tap Paste here.' };
      const key = normalizeKey(raw);
      // A new key starts from the documented header mode; generate() falls back to ?key= on an auth error.
      const r = await testKey(key, { lastWorkingModel: lastModel, authMode: 'header' });
      if (r.result === 'bad-key') {
        return key.startsWith('AQ.')
          ? {
              ok: false,
              kind: 'aq-rejected',
              message: 'Google didn’t accept this new “AQ.” key (Bloom tried both ways of sending it).',
              next: 'New keys can take a minute to work. Wait a minute, then tap Save & test again. Still failing? Create a new key in AI Studio and paste that.',
            }
          : {
              ok: false,
              kind: 'invalid',
              message: 'Google says this key isn’t valid.',
              next: 'Copy the whole key again from AI Studio, or create a new one, then paste it here.',
            };
      }
      if (r.result === 'network')
        return { ok: false, kind: 'offline', message: 'Couldn’t reach Google. You seem to be offline.', next: 'Check your Wi-Fi or mobile data, then tap Save & test again.' };
      if (r.result === 'error') {
        if (r.errorKind === 'overloaded')
          return { ok: false, kind: 'busy', message: 'Google’s AI is busy right now.', next: 'Wait a minute, then tap Save & test again.' };
        return { ok: false, kind: 'error', message: 'Google couldn’t check this key.', next: 'Try again in a minute. If it keeps failing, create a new key in AI Studio.' };
      }
      try {
        await saveKey(key);
      } catch (e) {
        return {
          ok: false,
          kind: 'storage',
          message: e instanceof Error && e.message ? `Couldn’t save the key on this phone: ${e.message}` : 'Couldn’t save the key on this phone.',
          next: 'Close Bloom completely, open it again and retry.',
        };
      }
      if (r.model) rememberModel(r.model);
      rememberAuth(r.authMode);
      setKey(key);
      if (r.quota)
        return { ok: true, kind: 'ok-quota', message: 'Key saved. Google says today’s free limit is used up for now.', next: `AI Coach will answer again once it resets. ${RESET_HINT}` };
      const name = modelLabel(r.model ?? lastModel);
      return { ok: true, kind: 'ok', message: name ? `AI Coach is on. Using ${name}.` : 'AI Coach is on.' };
    },
    [lastModel, rememberModel, rememberAuth]
  );

  const removeKey = useCallback(async () => {
    await removeStoredKey();
    setKey(null);
    setAuthMode(null);
    AsyncStorage.removeItem(AUTH_MODE_KEY).catch(() => {});
  }, []);

  const ask = useCallback<CoachValue['ask']>(
    async (o) => {
      if (!key) throw new Error('Set up AI Coach first (Settings → AI Coach).');
      try {
        const r = await generate({ key, lastWorkingModel: lastModel, authMode, maxOutputTokens: 1024, ...o });
        if (r.model !== lastModel) rememberModel(r.model);
        if (r.authMode !== authMode) rememberAuth(r.authMode);
        return r;
      } catch (e) {
        if (e instanceof GeminiError && e.kind === 'quota' && e.authMode && e.authMode !== authMode) rememberAuth(e.authMode);
        throw e;
      }
    },
    [key, lastModel, authMode, rememberModel, rememberAuth]
  );

  const value = useMemo<CoachValue>(
    () => ({ ready, hasKey: !!key, masked: key ? maskKey(key) : null, lastModel, saveAndTestKey, removeKey, ask }),
    [ready, key, lastModel, saveAndTestKey, removeKey, ask]
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useCoach(): CoachValue {
  const v = useContext(Ctx);
  if (!v) throw new Error('useCoach must be used inside CoachProvider');
  return v;
}
