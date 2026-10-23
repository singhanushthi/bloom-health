/**
 * Steps / distance / calories / exercise for today.
 *
 * Step source priority:
 *  1. Manual value for today (user edit) — always wins when set.
 *  2. Health Connect aggregate (if available + READ_STEPS). On Android 14+ (SDK ext ≥ 20)
 *     this includes the phone's own step counter with no other app installed. It also
 *     de-duplicates overlapping writers (e.g. Google Fit + NoiseFit) using HC's
 *     app-priority list, which a naive sum of raw records would not.
 *  3. Bloom's foreground sensor count (expo-sensors, only while Bloom is open).
 *
 * Distance: Health Connect's when it has some, else steps × stride.
 * Calories: only when Health Connect provides them — never estimated.
 */
import { mockActivityToday, MOCK_SOURCES } from '../data/mock';
import { stepDays } from '../db/repos';
import { dayStart, todayKey } from './dates';
import { ensureInitialized, hc } from './client';
import { empty, failed, hcCan, ok, uniq, type ReadContext } from './context';
import { between, originOf, readAll } from './read';
import { LOCAL_SOURCE, type ActivityToday, type MetricResult, type StepSource } from './types';

const DEFAULT_STRIDE = 0.72;

export async function getActivityToday(ctx: ReadContext): Promise<MetricResult<ActivityToday>> {
  const now = ctx.now ?? new Date();
  const today = todayKey(now);
  const stride = ctx.strideM ?? DEFAULT_STRIDE;
  if (ctx.mode === 'demo') {
    return ok(mockActivityToday(now), [...(MOCK_SOURCES.Steps ?? []), ...(MOCK_SOURCES.Distance ?? [])]);
  }

  try {
    const local = await stepDays.get(today);
    const sources: string[] = [];

    // Health Connect part (optional).
    let hcSteps: number | null = null;
    let hcDistanceKm: number | null = null;
    let activeKcal: number | null = null;
    let totalKcal: number | null = null;
    let exerciseMinutes = 0;
    let exerciseSessions = 0;
    const m = hc();
    if (
      hcCan(ctx, 'Steps', 'Distance', 'ActiveCaloriesBurned', 'TotalCaloriesBurned', 'ExerciseSession') &&
      m &&
      (await ensureInitialized())
    ) {
      const range = between(dayStart(today), now);
      const safe = async <T,>(p: Promise<T>): Promise<T | null> => {
        try {
          return await p;
        } catch {
          return null;
        }
      };
      const [steps, distance, active, total, sessions] = await Promise.all([
        ctx.granted.has('Steps') ? safe(m.aggregateRecord({ recordType: 'Steps', timeRangeFilter: range })) : null,
        ctx.granted.has('Distance') ? safe(m.aggregateRecord({ recordType: 'Distance', timeRangeFilter: range })) : null,
        ctx.granted.has('ActiveCaloriesBurned')
          ? safe(m.aggregateRecord({ recordType: 'ActiveCaloriesBurned', timeRangeFilter: range }))
          : null,
        ctx.granted.has('TotalCaloriesBurned')
          ? safe(m.aggregateRecord({ recordType: 'TotalCaloriesBurned', timeRangeFilter: range }))
          : null,
        ctx.granted.has('ExerciseSession') ? safe(readAll('ExerciseSession', dayStart(today), now)) : null,
      ]);
      if (steps && steps.COUNT_TOTAL > 0) {
        hcSteps = Math.round(steps.COUNT_TOTAL);
        sources.push(...steps.dataOrigins);
      }
      if (distance && distance.DISTANCE?.inKilometers > 0) {
        hcDistanceKm = +distance.DISTANCE.inKilometers.toFixed(2);
        sources.push(...distance.dataOrigins);
      }
      if (active && active.ACTIVE_CALORIES_TOTAL?.inKilocalories > 0) {
        activeKcal = Math.round(active.ACTIVE_CALORIES_TOTAL.inKilocalories);
        sources.push(...active.dataOrigins);
      }
      if (total && total.ENERGY_TOTAL?.inKilocalories > 0) {
        totalKcal = Math.round(total.ENERGY_TOTAL.inKilocalories);
        sources.push(...total.dataOrigins);
      }
      if (sessions && sessions.length) {
        exerciseSessions = sessions.length;
        exerciseMinutes = Math.round(
          sessions.reduce((a, s) => a + (new Date(s.endTime).getTime() - new Date(s.startTime).getTime()) / 60_000, 0)
        );
        sources.push(...sessions.map(originOf).filter((x): x is string => !!x));
      }
    }

    // Pick the step count.
    let steps: number;
    let stepSource: StepSource;
    const stepOrigins: string[] = [];
    if (local?.manualSteps != null) {
      steps = local.manualSteps;
      stepSource = 'manual';
      stepOrigins.push(LOCAL_SOURCE.manual);
    } else if (hcSteps !== null) {
      steps = hcSteps;
      stepSource = 'healthConnect';
    } else if (local && local.sensorSteps > 0) {
      steps = local.sensorSteps;
      stepSource = 'sensor';
      stepOrigins.push(LOCAL_SOURCE.sensor);
    } else {
      return empty(uniq(sources));
    }

    // Only trust HC distance when steps also came from HC.
    const useHcDistance = stepSource === 'healthConnect' && hcDistanceKm !== null;
    const data: ActivityToday = {
      steps,
      stepSource,
      distanceKm: useHcDistance ? hcDistanceKm! : +((steps * stride) / 1000).toFixed(2),
      distanceEstimated: !useHcDistance,
      activeKcal,
      totalKcal,
      exerciseMinutes,
      exerciseSessions,
    };
    // Card label reflects where the step number came from.
    return ok(data, stepSource === 'healthConnect' ? sources : stepOrigins);
  } catch (e) {
    return failed(e);
  }
}
