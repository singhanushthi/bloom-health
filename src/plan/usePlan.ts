import { useCallback, useEffect, useRef, useState } from 'react';
import { useAppState } from '../state/AppState';
import { loadPlanState, type PlanState } from './data';
import { usePlanVersion } from './events';

/** Loads PlanState and re-loads on any plan write, data change or demo toggle. */
export function usePlan(): { state: PlanState | null; loading: boolean; error: string | null; reload: () => Promise<void> } {
  const { ctx, dataVersion, ready, tracks } = useAppState();
  const planVersion = usePlanVersion();
  const [state, setState] = useState<PlanState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const seq = useRef(0);
  const cycleTracked = tracks.includes('cycle');

  const reload = useCallback(async () => {
    if (!ready) return;
    const id = ++seq.current;
    setLoading(true);
    try {
      const s = await loadPlanState({ ...ctx, now: new Date() }, { cycleTracked });
      if (id === seq.current) {
        setState(s);
        setError(null);
      }
    } catch (e) {
      if (id === seq.current) setError(e instanceof Error ? e.message : String(e));
    } finally {
      if (id === seq.current) setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, dataVersion, planVersion, ctx.mode, ctx.availability, ctx.granted, cycleTracked]);

  useEffect(() => {
    reload();
  }, [reload]);

  return { state, loading, error, reload };
}
