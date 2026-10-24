/**
 * Keeps scheduled cycle reminders in step with logs and settings.
 *
 * rescheduleCycleReminders() is safe to call often: it rebuilds the plan and replaces every
 * "bloom-cycle:" notification. When reminders are all off and nothing was scheduled before, it
 * doesn't touch the native module at all. Demo mode never schedules anything.
 */
import { getCycleKv, loadCycleSettings, setCycleKv } from '../cycle/store';
import { getCycleStatus } from '../health/cycle';
import type { ReadContext } from '../health/context';
import { anyReminderOn, buildReminderPlan, type PlannedReminder } from './plan';
import { applyReminderPlan, type ApplyResult } from './scheduler';

const SCHEDULED_KEY = 'reminders.scheduled';
let lastScheduled = -1; // unknown after launch → read the stored count
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
      if (lastScheduled < 0) lastScheduled = Number((await getCycleKv(SCHEDULED_KEY)) ?? '0') || 0;
      // Nothing to schedule and nothing scheduled before: don't touch the native module.
      if (!plan.length && lastScheduled === 0) return null;
      const r = await applyReminderPlan(plan, { discreet: settings.discreet });
      if (r.skipped !== 'no-module') {
        lastScheduled = r.scheduled.length;
        await setCycleKv(SCHEDULED_KEY, String(lastScheduled)).catch(() => {});
      }
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
