/**
 * Fallback step counting with the phone's own sensor via expo-sensors Pedometer.
 *
 * Android limits (verified):
 *  - Only `watchStepCount` works: it reports steps since the subscription started.
 *    `getStepCountAsync` (history) is iOS-only, and there is no background delivery.
 *  - So Bloom counts only while it is open in the foreground. Deltas are persisted
 *    per local day into SQLite (step_days.sensor_steps) every few seconds and on pause.
 *  - Needs the ACTIVITY_RECOGNITION runtime permission (Android 10+).
 *
 * Health Connect (Android 14+) counts all day natively and is preferred when available.
 */
import { AppState, Platform, type AppStateStatus } from 'react-native';
import { stepDays } from '../db/repos';
import { todayKey } from '../health/dates';

type PedometerModule = typeof import('expo-sensors').Pedometer;

function pedometer(): PedometerModule | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return (require('expo-sensors') as typeof import('expo-sensors')).Pedometer;
  } catch {
    return null;
  }
}

export type SensorPermission = 'granted' | 'denied' | 'undetermined' | 'unavailable';

export async function sensorAvailable(): Promise<boolean> {
  if (Platform.OS !== 'android') return false;
  const p = pedometer();
  if (!p) return false;
  try {
    return await p.isAvailableAsync();
  } catch {
    return false;
  }
}

export async function getSensorPermission(): Promise<SensorPermission> {
  if (!(await sensorAvailable())) return 'unavailable';
  try {
    const r = await pedometer()!.getPermissionsAsync();
    return r.granted ? 'granted' : r.canAskAgain ? 'undetermined' : 'denied';
  } catch {
    return 'unavailable';
  }
}

export async function requestSensorPermission(): Promise<SensorPermission> {
  if (!(await sensorAvailable())) return 'unavailable';
  try {
    const r = await pedometer()!.requestPermissionsAsync();
    return r.granted ? 'granted' : 'denied';
  } catch {
    return 'unavailable';
  }
}

const FLUSH_MS = 5000;

/**
 * Pure accumulator: turns the cumulative "steps since subscribe" values from watchStepCount into
 * per-LOCAL-day deltas. Exported for tests.
 *  - Each subscription restarts at 0 (expo-sensors resets its baseline on subscribe), so
 *    `resetBaseline()` must be called on every (re)subscribe — otherwise the first reading after
 *    a resume would be treated as a decrease and lost, or the old total re-added.
 *  - Pending steps are kept per day, so a failed write retried after midnight still lands on the
 *    day the steps were taken.
 */
export function createStepAccumulator(dayOf: () => string = () => todayKey()) {
  let lastTotal = 0;
  const pending = new Map<string, number>();
  return {
    resetBaseline() {
      lastTotal = 0;
    },
    /** Feed a cumulative reading; returns the delta that was added (0 if none). */
    onReading(total: number): number {
      const delta = total - lastTotal;
      lastTotal = total;
      if (!(delta > 0)) return 0;
      const day = dayOf();
      pending.set(day, (pending.get(day) ?? 0) + delta);
      return delta;
    },
    /** Take everything pending (clears it). */
    take(): [string, number][] {
      const out = Array.from(pending.entries()).filter(([, n]) => n > 0);
      pending.clear();
      return out;
    },
    /** Put back steps whose write failed. */
    restore(day: string, n: number) {
      pending.set(day, (pending.get(day) ?? 0) + n);
    },
    hasPending() {
      return pending.size > 0;
    },
  };
}

/**
 * Start counting. Returns a stop function. `onFlush` fires after steps are saved so the
 * UI can refresh. Safe to call when the sensor is missing (returns a no-op).
 */
export function startForegroundCounting(onFlush?: (savedDelta: number) => void): () => void {
  const p = pedometer();
  if (!p || Platform.OS !== 'android') return () => {};

  let sub: { remove: () => void } | null = null;
  let timer: ReturnType<typeof setInterval> | null = null;
  let stopped = false;
  const acc = createStepAccumulator();

  const flush = async () => {
    if (!acc.hasPending()) return;
    let saved = 0;
    for (const [day, n] of acc.take()) {
      try {
        await stepDays.addSensorSteps(day, n);
        saved += n;
      } catch {
        acc.restore(day, n); // retry on next flush, still on its own day
      }
    }
    if (saved > 0) onFlush?.(saved);
  };

  const subscribe = () => {
    if (sub || stopped) return;
    acc.resetBaseline();
    try {
      sub = p.watchStepCount(({ steps }) => {
        acc.onReading(steps);
      });
    } catch {
      sub = null;
      return; // no timer without a subscription
    }
    if (!timer) timer = setInterval(() => void flush(), FLUSH_MS);
  };

  const unsubscribe = () => {
    sub?.remove();
    sub = null;
    if (timer) clearInterval(timer);
    timer = null;
    void flush();
  };

  const onAppState = (s: AppStateStatus) => (s === 'active' ? subscribe() : unsubscribe());
  const appSub = AppState.addEventListener('change', onAppState);
  const cur = AppState.currentState as AppStateStatus | null;
  if (cur === 'active' || cur === 'unknown' || cur == null) subscribe();

  return () => {
    stopped = true;
    appSub.remove();
    unsubscribe();
  };
}
