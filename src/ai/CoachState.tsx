/**
 * AI coach state: whether a key is saved (kept in expo-secure-store, never in AsyncStorage),
 * and the last model that worked (AsyncStorage, so the fallback chain starts there).
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { generate, GeminiError, testKey, type AuthMode, type ChatTurn, type GenerateResult } from './gemini';
import { checkKeyFormat, loadKey, maskKey, removeKey as removeStoredKey, saveKey } from './key';

const MODEL_KEY = 'bloom.gemini.lastModel';
/** 'header' | 'query' — how the key was last accepted. Not secret (never the key itself). */
const AUTH_MODE_KEY = 'bloom.gemini.authMode';

export type SaveOutcome = { ok: true; message: string } | { ok: false; message: string };

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
      const f = checkKeyFormat(raw);
      if (!f.ok) return { ok: false, message: f.error };
      // A new key starts from the documented header mode; generate() switches if needed.
      const r = await testKey(f.key, { lastWorkingModel: lastModel, authMode: 'header' });
      if (r.result === 'bad-key') return { ok: false, message: 'Google didn’t accept that key' };
      if (r.result === 'network') return { ok: false, message: 'Couldn’t reach Google — check your internet and try again' };
      if (r.result === 'error') return { ok: false, message: 'Google didn’t accept that key' };
      try {
        await saveKey(f.key);
      } catch (e) {
        return { ok: false, message: e instanceof Error ? e.message : 'Couldn’t save the key on this phone' };
      }
      if (r.model) rememberModel(r.model);
      rememberAuth(r.authMode);
      setKey(f.key);
      return { ok: true, message: 'AI coach turned on' };
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
      if (!key) throw new Error('Add your Gemini key in Settings → AI Coach first.');
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
