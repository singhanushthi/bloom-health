/**
 * App-wide state: persisted settings (AsyncStorage) + Health Connect connection status.
 * Everything is stored on device only.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import {
  getAvailability,
  getGrantedReadTypes,
  requestReadPermissions,
  type DataMode,
  type HcAvailability,
  type MetricId,
  type ReadContext,
} from '../health';

const KEY = 'bloom.settings.v1';

export const DEFAULT_STEP_GOAL = 8000;
export const STEP_GOAL_MIN = 1000;
export const STEP_GOAL_MAX = 40000;
export const DEFAULT_STRIDE_M = 0.72;
export const STRIDE_MIN_M = 0.3;
export const STRIDE_MAX_M = 1.5;

export type TrackId = 'cycle' | 'steps' | 'sleep' | 'heart';
export const ALL_TRACKS: TrackId[] = ['cycle', 'steps', 'sleep', 'heart'];
export const TRACK_LABEL: Record<TrackId, string> = {
  cycle: 'Cycle',
  steps: 'Steps',
  sleep: 'Sleep',
  heart: 'Heart rate & SpO₂',
};

interface Persisted {
  demoMode: boolean;
  stepGoal: number;
  onboarded: boolean;
  historyRequested: boolean;
  /** Which areas the user chose to track (Today shows only these). */
  tracks: TrackId[];
  /** Stride length in metres, used for distance when Health Connect has none. */
  strideM: number;
}

const DEFAULTS: Persisted = {
  demoMode: false,
  stepGoal: DEFAULT_STEP_GOAL,
  onboarded: false,
  historyRequested: false,
  tracks: ALL_TRACKS,
  strideM: DEFAULT_STRIDE_M,
};

interface AppStateValue extends Persisted {
  ready: boolean;
  availability: HcAvailability | 'checking';
  granted: ReadonlySet<MetricId>;
  /** ReadContext for the data layer. */
  ctx: ReadContext;
  /** Bumped whenever data should be re-read (mode/permission change). */
  dataVersion: number;
  setDemoMode: (v: boolean) => Promise<void>;
  setStepGoal: (v: number) => Promise<void>;
  setTracks: (t: TrackId[]) => Promise<void>;
  setStride: (m: number) => Promise<void>;
  /** Call after writing local data so screens re-read. */
  bump: () => void;
  completeOnboarding: () => Promise<void>;
  resetOnboarding: () => Promise<void>;
  refreshConnection: () => Promise<void>;
  requestPermissions: () => Promise<MetricId[]>;
}

const Ctx = createContext<AppStateValue | null>(null);

export function AppStateProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<Persisted>(DEFAULTS);
  const [ready, setReady] = useState(false);
  const [availability, setAvailability] = useState<HcAvailability | 'checking'>('checking');
  const [granted, setGranted] = useState<ReadonlySet<MetricId>>(new Set());
  const [dataVersion, setDataVersion] = useState(0);

  const persist = useCallback(async (patch: Partial<Persisted>) => {
    setState((prev) => {
      const next = { ...prev, ...patch };
      AsyncStorage.setItem(KEY, JSON.stringify(next)).catch(() => {});
      return next;
    });
  }, []);

  const refreshConnection = useCallback(async () => {
    const a = await getAvailability();
    setAvailability(a);
    if (a === 'available') {
      setGranted(new Set(await getGrantedReadTypes()));
    } else {
      setGranted(new Set());
    }
    setDataVersion((v) => v + 1);
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(KEY);
        if (raw) setState({ ...DEFAULTS, ...(JSON.parse(raw) as Partial<Persisted>) });
      } catch {
        // corrupted storage — fall back to defaults
      }
      await refreshConnection();
      setReady(true);
    })();
  }, [refreshConnection]);

  const value = useMemo<AppStateValue>(() => {
    const mode: DataMode = state.demoMode ? 'demo' : 'live';
    return {
      ...state,
      ready,
      availability,
      granted,
      dataVersion,
      ctx: { mode, granted, availability: availability === 'checking' ? 'unsupported' : availability, strideM: state.strideM },
      setDemoMode: async (v) => {
        await persist({ demoMode: v });
        setDataVersion((x) => x + 1);
      },
      setStepGoal: async (v) => {
        const clamped = Math.min(STEP_GOAL_MAX, Math.max(STEP_GOAL_MIN, Math.round(v)));
        await persist({ stepGoal: clamped });
      },
      setTracks: (t) => persist({ tracks: t.length ? t : ALL_TRACKS }),
      setStride: async (m) => {
        const clamped = Math.min(STRIDE_MAX_M, Math.max(STRIDE_MIN_M, Math.round(m * 100) / 100));
        await persist({ strideM: clamped });
        setDataVersion((x) => x + 1);
      },
      bump: () => setDataVersion((x) => x + 1),
      completeOnboarding: () => persist({ onboarded: true }),
      resetOnboarding: () => persist({ onboarded: false }),
      refreshConnection,
      requestPermissions: async () => {
        const res = await requestReadPermissions();
        await persist({ historyRequested: res.historyRequested || state.historyRequested });
        // Re-query: the request result can be stale if the user changed things in settings.
        const now = await getGrantedReadTypes();
        const merged = new Set<MetricId>([...res.granted, ...now]);
        setGranted(merged);
        setDataVersion((x) => x + 1);
        return Array.from(merged);
      },
    };
  }, [state, ready, availability, granted, dataVersion, persist, refreshConnection]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAppState(): AppStateValue {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAppState must be used inside AppStateProvider');
  return v;
}
