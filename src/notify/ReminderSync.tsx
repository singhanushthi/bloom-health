/**
 * React glue for reminder rescheduling.
 */
import { useEffect, useRef } from 'react';
import { onCycleChange } from '../cycle/store';
import { useAppState } from '../state/AppState';
import { rescheduleCycleReminders } from './sync';

/**
 * Mount once (e.g. in the root layout, or via TodayCycleCard / the Cycle tab): reschedules on
 * launch, whenever app data changes (dataVersion) and whenever cycle settings change.
 */
export function useCycleReminderSync(): void {
  const { ctx, dataVersion, ready } = useAppState();
  const ctxRef = useRef(ctx);
  ctxRef.current = ctx;
  useEffect(() => {
    if (!ready) return;
    let t: ReturnType<typeof setTimeout> | null = null;
    const kick = () => {
      if (t) clearTimeout(t);
      t = setTimeout(() => void rescheduleCycleReminders(ctxRef.current), 600);
    };
    kick();
    const off = onCycleChange(kick);
    return () => {
      off();
      if (t) clearTimeout(t);
    };
  }, [ready, dataVersion, ctx.mode]);
}

/** Renders nothing; mount once near the root to keep reminders in sync. */
export function CycleReminderSync(): null {
  useCycleReminderSync();
  return null;
}
