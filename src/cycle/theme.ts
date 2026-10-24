/**
 * Cycle screens' theme hook. `cycleText` now lives in src/theme/tokens.ts; this keeps the
 * `useCycleColors()` call sites unchanged.
 */
import { useTheme } from '../theme/useTheme';

export function useCycleColors() {
  const t = useTheme();
  return { ...t, cycleText: t.c.cycleText };
}
