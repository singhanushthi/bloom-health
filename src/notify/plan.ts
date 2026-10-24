/**
 * Reminder plan (pure, tested in __tests__/notifyPlan.test.ts).
 *
 * Turns cycle settings + predictions into the exact list of local notifications to schedule.
 * The scheduler cancels everything with REMINDER_PREFIX and schedules this list, so
 * rescheduling is idempotent.
 */
import type { CyclePredictions } from '../health/cyclePrediction';
import { addDays, dayStart, type DayKey } from '../health/dates';
import type { ClockTime, CycleSettings } from '../cycle/store';

export const REMINDER_PREFIX = 'bloom-cycle:';
export const CYCLE_CHANNEL_ID = 'cycle';

export type ReminderKind = 'periodSoon' | 'late' | 'fertile' | 'logDay' | 'pill';

export interface PlannedReminder {
  id: string;
  kind: ReminderKind;
  /** First (or only) delivery time. */
  date: Date;
  /** Daily reminders repeat at this time. */
  repeat: { hour: number; minute: number } | null;
  title: string;
  body: string;
}

/** One-off reminders fire at these local times. */
export const ONE_OFF_TIME = { periodSoon: '09:00', late: '10:00', fertile: '09:00' } as const;
/** How many predicted cycles to schedule ahead. */
export const CYCLES_AHEAD = 3;

export function parseClock(t: ClockTime): { hour: number; minute: number } {
  const [h, m] = t.split(':').map(Number);
  return { hour: Number.isFinite(h) ? h : 9, minute: Number.isFinite(m) ? m : 0 };
}

export function at(day: DayKey, t: ClockTime): Date {
  const d = dayStart(day);
  const { hour, minute } = parseClock(t);
  d.setHours(hour, minute, 0, 0);
  return d;
}

/** Next occurrence of a daily time, strictly after `now`. */
export function nextDaily(now: Date, t: ClockTime): Date {
  const { hour, minute } = parseClock(t);
  const d = new Date(now);
  d.setHours(hour, minute, 0, 0);
  if (d.getTime() <= now.getTime()) d.setDate(d.getDate() + 1);
  return d;
}

interface Copy {
  title: string;
  body: string;
}

export function reminderCopy(kind: ReminderKind, discreet: boolean, extra: { daysLate?: number } = {}): Copy {
  if (discreet) {
    switch (kind) {
      case 'logDay':
        return { title: 'Bloom reminder', body: 'A minute for your daily check-in?' };
      case 'pill':
        return { title: 'Bloom reminder', body: 'Your daily reminder.' };
      default:
        return { title: 'Bloom reminder', body: 'Open Bloom to see what’s new.' };
    }
  }
  switch (kind) {
    case 'periodSoon':
      return { title: 'Period may start in 2 days', body: 'A good time to pack pads or a cup. This is an estimate.' };
    case 'late':
      return {
        title: 'Your period may be late',
        body: `It’s ${extra.daysLate ?? 4} days after the expected start. Stress, travel and sleep can shift it — log it in Bloom when it starts.`,
      };
    case 'fertile':
      return { title: 'Fertile window starts today', body: 'Estimated from your cycles. Not a method of contraception.' };
    case 'logDay':
      return { title: 'How are you today?', body: 'Log your mood, symptoms or flow in Bloom.' };
    case 'pill':
      return { title: 'Pill reminder', body: 'Time to take your pill.' };
  }
}

export interface PlanInput {
  settings: CycleSettings;
  /** Null when there's no cycle data yet (only daily reminders can be planned). */
  predictions: CyclePredictions | null;
  now: Date;
}

export function buildReminderPlan({ settings, predictions, now }: PlanInput): PlannedReminder[] {
  const r = settings.reminders;
  const out: PlannedReminder[] = [];
  const future = (d: Date) => d.getTime() > now.getTime();
  const push = (kind: ReminderKind, key: string, date: Date, extra?: { daysLate?: number }) => {
    if (!future(date)) return;
    out.push({ id: `${REMINDER_PREFIX}${kind}:${key}`, kind, date, repeat: null, ...reminderCopy(kind, settings.discreet, extra) });
  };

  const upcoming = predictions?.upcoming.slice(0, CYCLES_AHEAD) ?? [];
  if (r.periodSoon) {
    for (const u of upcoming) push('periodSoon', u.earliest, at(addDays(u.earliest, -2), ONE_OFF_TIME.periodSoon));
  }
  if (r.late && predictions?.expectedStart) {
    // Fires on the 4th day after the expected start; logging a period reschedules (and removes) it.
    const lateDays = 4;
    const day = addDays(predictions.expectedStart, lateDays);
    push('late', predictions.expectedStart, at(day, ONE_OFF_TIME.late), { daysLate: lateDays });
  }
  if (r.fertile) {
    for (const u of upcoming) push('fertile', u.fertileStart, at(u.fertileStart, ONE_OFF_TIME.fertile));
  }
  if (r.logDay) {
    const date = nextDaily(now, r.logTime);
    out.push({ id: `${REMINDER_PREFIX}logDay`, kind: 'logDay', date, repeat: parseClock(r.logTime), ...reminderCopy('logDay', settings.discreet) });
  }
  if (r.pill) {
    const date = nextDaily(now, r.pillTime);
    out.push({ id: `${REMINDER_PREFIX}pill`, kind: 'pill', date, repeat: parseClock(r.pillTime), ...reminderCopy('pill', settings.discreet) });
  }
  // De-duplicate ids (e.g. two predictions on the same day) and sort by time.
  const seen = new Set<string>();
  return out
    .filter((p) => (seen.has(p.id) ? false : (seen.add(p.id), true)))
    .sort((a, b) => a.date.getTime() - b.date.getTime());
}

/** True when any reminder toggle is on (permission is only requested then). */
export function anyReminderOn(s: CycleSettings): boolean {
  const r = s.reminders;
  return r.periodSoon || r.late || r.fertile || r.logDay || r.pill;
}
