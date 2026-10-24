/**
 * Keeps scheduled cycle reminders in step with logs and settings.
 *
 * rescheduleCycleReminders() is safe to call often: it rebuilds the plan and replaces every
 * "bloom-cycle:" notification. When reminders are all off and nothing was scheduled before, it
 * doesn't touch the native module at all. Demo mode never schedules anything.
 */
import { useEffect, useRef } from 'react';
import { loadCycleSettings, onCycleChange } from '../cycle/store';
import { getCycleStatus } from '../health/cycle';
import type { ReadContext } from '../health/context';
import { useAppState } from '../state/AppState';
import { anyReminderOn, buildReminderPlan, type PlannedReminder } from './plan';
import { applyReminderPlan, type ApplyResult } from './scheduler';

let lastScheduled = -1; // unknown after launch → cancel once to clean up stale ids
let running: Promise<ApplyResult | null> | null = null;
let again = false;

/** Build the plan for the current data (pure parts + DB reads). */
export async function currentReminderPlan(ctx: ReadContext, now = new Date()): Promise<PlannedReminder[]> {
  const settings = await loadCycleSettings();
  if (!anyReminderOn(settings)) return [];
  const status = await getCycleStatus({ ...ctx, mode: 'live', now });
  const predictions = status.data?.hasData ? (status.data.predictions ?? null) : null;
  return buildReminderPlan({ settings, predictions, now });
}

export async function rescheduleCycleReminders(ctx: ReadContext): Promise<ApplyResult | null> {
  if (ctx.mode === 'demo') return null;
  if (running) {
    again = true;
    return running;
  }
  running = (async () => {
    try {
      const settings = await loadCycleSettings();
      const plan = await currentReminderPlan(ctx);
      if (!plan.length && lastScheduled === 0) return null;
      const r = await applyReminderPlan(plan, { discreet: settings.discreet });
      lastScheduled = r.scheduled.length;
      return r;
    } catch {
      return null;
    } finally {
      running = null;
      if (again) {
        again = false;
        void rescheduleCycleReminders(ctx);
      }
    }
  })();
  return running;
}

/** For tests. */
export function __resetReminderSync(): void {
  lastScheduled = -1;
  running = null;
  again = false;
}

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
