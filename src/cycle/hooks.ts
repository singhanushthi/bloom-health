import { useCallback, useEffect, useState } from 'react';
import { useMetric } from '../hooks/useMetric';
import { getCycleOverview } from './data';
import { DEFAULT_CYCLE_SETTINGS, loadCycleSettings, onCycleChange, saveCycleSettings, type CycleSettings, type CycleSettingsPatch } from './store';

/** Cycle settings with live updates. `update` saves and notifies every subscriber. */
export function useCycleSettings(): {
  settings: CycleSettings;
  loading: boolean;
  update: (patch: CycleSettingsPatch) => Promise<CycleSettings>;
} {
  const [settings, setSettings] = useState<CycleSettings>(DEFAULT_CYCLE_SETTINGS);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let alive = true;
    const load = () =>
      loadCycleSettings()
        .then((s) => alive && setSettings(s))
        .finally(() => alive && setLoading(false));
    load();
    const off = onCycleChange(load);
    return () => {
      alive = false;
      off();
    };
  }, []);
  const update = useCallback(async (patch: CycleSettingsPatch) => {
    const next = await saveCycleSettings(patch);
    setSettings(next);
    return next;
  }, []);
  return { settings, loading, update };
}

/** Cycle overview that also reloads when cycle settings / extras change. */
export function useCycleOverview() {
  const [v, setV] = useState(0);
  useEffect(() => onCycleChange(() => setV((x) => x + 1)), []);
  return useMetric(getCycleOverview, [v]);
}
