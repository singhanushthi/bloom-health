import { useCallback, useEffect, useRef, useState } from 'react';
import type { MetricResult, ReadContext } from '../health';
import { useAppState } from '../state/AppState';

export interface MetricState<T> {
  loading: boolean;
  result: MetricResult<T> | null;
  reload: () => Promise<void>;
}

/** Runs a data-layer reader with the current ReadContext and re-runs on mode/permission change. */
export function useMetric<T>(
  reader: (ctx: ReadContext) => Promise<MetricResult<T>>,
  deps: unknown[] = []
): MetricState<T> {
  const { ctx, dataVersion, ready } = useAppState();
  const [loading, setLoading] = useState(true);
  const [result, setResult] = useState<MetricResult<T> | null>(null);
  const seq = useRef(0);

  const reload = useCallback(async () => {
    if (!ready) return;
    const id = ++seq.current;
    setLoading(true);
    try {
      const r = await reader({ ...ctx, now: new Date() });
      if (id === seq.current) setResult(r);
    } catch (e) {
      if (id === seq.current)
        setResult({ status: 'error', data: null, sources: [], error: String(e) });
    } finally {
      if (id === seq.current) setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, dataVersion, ctx.mode, ...deps]);

  useEffect(() => {
    reload();
  }, [reload]);

  return { loading, result, reload };
}
