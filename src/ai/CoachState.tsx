/**
 * AI coach state: whether a key is saved (kept in expo-secure-store, never in AsyncStorage),
 * and the last model that worked (AsyncStorage, so the fallback chain starts there).
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { generate, testKey, type ChatTurn, type GenerateResult } from './gemini';
import { checkKeyFormat, loadKey, maskKey, removeKey as removeStoredKey, saveKey } from './key';

const MODEL_KEY = 'bloom.gemini.lastModel';

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

  useEffect(() => {
    (async () => {
      const [k, m] = await Promise.all([loadKey(), AsyncStorage.getItem(MODEL_KEY).catch(() => null)]);
      setKey(k);
      setLastModel(m);
      setReady(true);
    })();
  }, []);

  const rememberModel = useCallback((m: string) => {
    setLastModel(m);
    AsyncStorage.setItem(MODEL_KEY, m).catch(() => {});
  }, []);

  const saveAndTestKey = useCallback(
    async (raw: string): Promise<SaveOutcome> => {
      const f = checkKeyFormat(raw);
      if (!f.ok) return { ok: false, message: f.error };
      const r = await testKey(f.key, { lastWorkingModel: lastModel });
      if (r.result === 'bad-key') return { ok: false, message: 'Google didn’t accept that key' };
      if (r.result === 'network') return { ok: false, message: 'Couldn’t reach Google — check your internet and try again' };
      if (r.result === 'error') return { ok: false, message: 'Google didn’t accept that key' };
      try {
        await saveKey(f.key);
      } catch (e) {
        return { ok: false, message: e instanceof Error ? e.message : 'Couldn’t save the key on this phone' };
      }
      if (r.model) rememberModel(r.model);
      setKey(f.key);
      return { ok: true, message: 'AI coach turned on' };
    },
    [lastModel, rememberModel]
  );

  const removeKey = useCallback(async () => {
    await removeStoredKey();
    setKey(null);
  }, []);

  const ask = useCallback<CoachValue['ask']>(
    async (o) => {
      if (!key) throw new Error('Add your Gemini key in Settings → AI Coach first.');
      const r = await generate({ key, lastWorkingModel: lastModel, maxOutputTokens: 1024, ...o });
      if (r.model !== lastModel) rememberModel(r.model);
      return r;
    },
    [key, lastModel, rememberModel]
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
