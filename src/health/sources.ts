/**
 * Which app wrote which metric (dataOrigin), over the last 30 days.
 */
import { MOCK_SOURCES } from '../data/mock';
import { addDays, dayStart, todayKey } from './dates';
import { READ_RECORD_TYPES } from './client';
import { failed, ok, uniq, type ReadContext } from './context';
import { originOf, readAll } from './read';
import { LOCAL_SOURCE, type MetricId, type MetricResult, type SourcesByMetric } from './types';

export const METRIC_LABEL: Record<MetricId, string> = {
  Steps: 'Steps',
  Distance: 'Distance',
  ActiveCaloriesBurned: 'Active calories',
  TotalCaloriesBurned: 'Total calories',
  ExerciseSession: 'Workouts',
  SleepSession: 'Sleep',
  HeartRate: 'Heart rate',
  RestingHeartRate: 'Resting heart rate',
  OxygenSaturation: 'Blood oxygen (SpO₂)',
  MenstruationPeriod: 'Period days',
  MenstruationFlow: 'Menstrual flow',
};

/** Friendly names for packages we expect to see. Unknown packages show the raw id. */
const KNOWN_APPS: Record<string, string> = {
  'org.iggymedia.periodtracker': 'Flo',
  'com.google.android.apps.fitness': 'Google Fit',
  'com.noisefit': 'NoiseFit',
  'com.noise.fit': 'NoiseFit',
  'com.google.android.apps.healthdata': 'Health Connect',
  'com.sec.android.app.shealth': 'Samsung Health',
  'com.fitbit.FitbitMobile': 'Fitbit',
};

/**
 * True for the phone's own sensor data written by Health Connect itself (Android 14+).
 * Seen as "android" on older builds, or a per-device synthetic package such as
 * com.android.healthconnect.phone.<id> — so match by prefix, never a fixed id.
 */
export function isPhoneOrigin(pkg: string): boolean {
  return pkg === 'android' || pkg.startsWith('com.android.healthconnect');
}

export function appName(pkg: string): string {
  if (pkg === LOCAL_SOURCE.log || pkg === LOCAL_SOURCE.manual) return 'Logged in Bloom';
  if (pkg === LOCAL_SOURCE.sensor) return 'Phone (while Bloom is open)';
  if (pkg === LOCAL_SOURCE.demo) return 'Demo data';
  if (isPhoneOrigin(pkg)) return 'Phone (Health Connect)';
  if (KNOWN_APPS[pkg]) return KNOWN_APPS[pkg];
  if (/noise/i.test(pkg)) return 'NoiseFit';
  return pkg;
}

/** Short label for a card: "Logged in Bloom", "Phone (Health Connect)", "Flo + Logged in Bloom"… */
export function sourceLabel(origins: string[]): string | null {
  const names = Array.from(new Set(origins.map(appName)));
  if (!names.length) return null;
  if (names.length <= 2) return names.join(' + ');
  return `${names.slice(0, 2).join(' + ')} +${names.length - 2}`;
}

export async function getSources(ctx: ReadContext): Promise<MetricResult<SourcesByMetric>> {
  if (ctx.mode === 'demo') return ok(MOCK_SOURCES);
  const now = ctx.now ?? new Date();
  const start = dayStart(addDays(todayKey(now), -29));
  const out: SourcesByMetric = {};
  if (ctx.availability !== undefined && ctx.availability !== 'available') return ok(out);
  try {
    for (const type of READ_RECORD_TYPES) {
      if (!ctx.granted.has(type)) continue;
      try {
        const recs = await readAll(type, start, now, { pageSize: 500, maxPages: 2 });
        out[type] = uniq(recs.map(originOf));
      } catch {
        out[type] = [];
      }
    }
    return ok(out);
  } catch (e) {
    return failed(e);
  }
}
