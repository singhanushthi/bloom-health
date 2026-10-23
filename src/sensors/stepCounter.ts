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
 * Start counting. Returns a stop function. `onFlush` fires after steps are saved so the
 * UI can refresh. Safe to call when the sensor is missing (returns a no-op).
 */
export function startForegroundCounting(onFlush?: (savedDelta: number) => void): () => void {
  const p = pedometer();
  if (!p || Platform.OS !== 'android') return () => {};

  let sub: { remove: () => void } | null = null;
  let lastTotal = 0; // steps since current subscription, as last reported
  let pending = 0; // not yet written
  let pendingDay = todayKey();
  let timer: ReturnType<typeof setInterval> | null = null;

  const flush = async () => {
    if (pending <= 0) return;
    const delta = pending;
    const day = pendingDay;
    pending = 0;
    try {
      await stepDays.addSensorSteps(day, delta);
      onFlush?.(delta);
    } catch {
      pending += delta; // retry on next flush
    }
  };

  const subscribe = () => {
    if (sub) return;
    lastTotal = 0;
    try {
      sub = p.watchStepCount(({ steps }) => {
        const delta = steps - lastTotal;
        lastTotal = steps;
        if (delta <= 0) return;
        const day = todayKey();
        if (day !== pendingDay) {
          // Midnight passed: write the old day's remainder first.
          void flush();
          pendingDay = day;
        }
        pending += delta;
      });
    } catch {
      sub = null;
    }
    timer = setInterval(() => void flush(), FLUSH_MS);
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
  if (AppState.currentState === 'active' || AppState.currentState == null) subscribe();

  return () => {
    appSub.remove();
    unsubscribe();
  };
}
