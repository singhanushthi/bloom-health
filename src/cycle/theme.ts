/**
 * Cycle-specific semantic colours that aren't in src/theme/tokens.ts yet.
 * `cycleText` is the deep rose used for phase names / numbers on light and soft-pink surfaces
 * (#A8325A on #F9DCE4 = 5.0:1, on white 6.4:1; dark #F5A3BA on dark surfaces ≥ 6.5:1).
 * TODO(main): move into tokens.ts as `cycleText` and delete this file.
 */
import { useTheme } from '../theme/useTheme';

const CYCLE_TEXT = { light: '#A8325A', dark: '#F5A3BA' } as const;

export function useCycleColors() {
  const t = useTheme();
  return { ...t, cycleText: CYCLE_TEXT[t.scheme] };
}
