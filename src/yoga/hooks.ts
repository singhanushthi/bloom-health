/**
 * React hooks for the yoga feature: prefs, history and cycle awareness.
 */
import { useCallback, useEffect, useState } from 'react';
import { getCycleStatus } from '../health';
import { todayKey, type DayKey } from '../health/dates';
import { useMetric } from '../hooks/useMetric';
import { useAppState } from '../state/AppState';
import { DEFAULT_PREFS, loadPrefs, onYogaChange, savePrefs, yogaHistory, type YogaHistoryEntry, type YogaPrefs } from './store';

export function useYogaPrefs(): {
  prefs: YogaPrefs;
  loaded: boolean;
  update: (patch: Partial<YogaPrefs>) => Promise<void>;
} {
  const [prefs, setPrefs] = useState<YogaPrefs>(DEFAULT_PREFS);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    let alive = true;
    const read = () =>
      loadPrefs().then((p) => {
        if (alive) {
          setPrefs(p);
          setLoaded(true);
        }
      });
    read();
    const off = onYogaChange(read);
    return () => {
      alive = false;
      off();
    };
  }, []);
  const update = useCallback(async (patch: Partial<YogaPrefs>) => {
    setPrefs((p) => ({ ...p, ...patch }));
    await savePrefs(patch);
  }, []);
  return { prefs, loaded, update };
}

export interface YogaHistoryState {
  loading: boolean;
  entries: YogaHistoryEntry[];
  days: DayKey[];
  today: YogaHistoryEntry[];
  reload: () => Promise<void>;
}

export function useYogaHistory(limit = 30): YogaHistoryState {
  const [state, setState] = useState<Omit<YogaHistoryState, 'reload'>>({
    loading: true,
    entries: [],
    days: [],
    today: [],
  });
  const reload = useCallback(async () => {
    try {
      const [entries, days, today] = await Promise.all([
        yogaHistory.list(limit),
        yogaHistory.days(),
        yogaHistory.doneOn(todayKey()),
      ]);
      setState({ loading: false, entries, days, today });
    } catch {
      setState((s) => ({ ...s, loading: false }));
    }
  }, [limit]);
  useEffect(() => {
    reload();
    return onYogaChange(() => {
      reload();
    });
  }, [reload]);
  return { ...state, reload };
}

/**
 * True when cycle tracking is on and Bloom's cycle data puts today in the menstrual phase
 * (a logged period or the estimated period days). False when cycle tracking is off.
 */
export function useOnPeriod(): boolean {
  const { tracks } = useAppState();
  const tracking = tracks.includes('cycle');
  const { result } = useMetric(getCycleStatus, [tracking]);
  if (!tracking) return false;
  return !!result?.data?.hasData && result.data.phase === 'menstrual';
}
