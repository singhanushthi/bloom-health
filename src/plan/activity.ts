/**
 * Activity log API (contract shared with the Yoga feature).
 *
 * `addActivity` stores one session in SQLite with kcal = MET × weight × hours, using
 * the latest morning weight (else any weight, else the profile weight, else 60 kg).
 */
import { activityLogs, kv, weightLogs, type ActivityLog, type ActivitySource } from '../db/repos';
import { todayKey, type DayKey } from '../health/dates';
import { activityKcal, type ActivityType, type Intensity } from './met';
import { emitPlanChange } from './events';
import { writeHcExercise } from './hc';
import { loadPlanSettings } from './store';

export type { ActivityType, Intensity } from './met';

const FALLBACK_KG = 60;

/** Weight used for burn estimates: latest morning log → any log → profile → 60 kg. */
export async function weightForBurn(): Promise<number> {
  const m = (await weightLogs.latest('morning')) ?? (await weightLogs.latest());
  if (m) return m.kg;
  const p = await kv.get<{ weightKg?: number }>('plan.profile');
  return p?.weightKg && p.weightKg > 0 ? p.weightKg : FALLBACK_KG;
}

export async function addActivity(a: {
  type: ActivityType;
  title?: string;
  minutes: number;
  intensity: 'light' | 'moderate' | 'vigorous';
  dateKey?: string;
  source?: 'manual' | 'bloom-yoga' | 'health-connect';
}): Promise<void> {
  const kg = await weightForBurn();
  await activityLogs.add({
    day: a.dateKey ?? todayKey(),
    type: a.type,
    title: a.title ?? null,
    minutes: a.minutes,
    intensity: a.intensity,
    kcal: activityKcal(a.type, a.intensity, a.minutes, kg),
    source: (a.source ?? 'manual') as ActivitySource,
  });
  emitPlanChange();
  // Optional mirror to Health Connect (never for sessions that came from Health Connect).
  if (a.source !== 'health-connect') {
    const s = await loadPlanSettings().catch(() => null);
    if (s?.hcWriteExercise) void writeHcExercise({ type: a.type, title: a.title, minutes: a.minutes, end: new Date() });
  }
}

export async function updateActivity(
  id: number,
  a: { type: ActivityType; title?: string | null; minutes: number; intensity: Intensity; day: DayKey }
): Promise<void> {
  const kg = await weightForBurn();
  await activityLogs.update(id, {
    day: a.day,
    type: a.type,
    title: a.title ?? null,
    minutes: a.minutes,
    intensity: a.intensity,
    kcal: activityKcal(a.type, a.intensity, a.minutes, kg),
  });
  emitPlanChange();
}

export async function removeActivity(id: number): Promise<void> {
  await activityLogs.remove(id);
  emitPlanChange();
}

export type { ActivityLog };
