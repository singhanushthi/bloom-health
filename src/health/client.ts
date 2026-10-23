/**
 * Thin, defensive wrapper around react-native-health-connect.
 *
 * The library throws at import time when the native module is missing (Expo Go, web,
 * Jest), so it is required lazily and every call is guarded. Nothing here ever
 * writes data or talks to the network — Health Connect is an on-device store.
 */
import { Linking, Platform } from 'react-native';
import type { MetricId } from './types';

type HCModule = typeof import('react-native-health-connect');

let cached: HCModule | null | undefined;

export function hc(): HCModule | null {
  if (cached !== undefined) return cached;
  if (Platform.OS !== 'android') {
    cached = null;
    return cached;
  }
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    cached = require('react-native-health-connect') as HCModule;
  } catch {
    cached = null;
  }
  return cached;
}

export const HEALTH_CONNECT_PACKAGE = 'com.google.android.apps.healthdata';

export type HcAvailability = 'available' | 'update-required' | 'unavailable' | 'unsupported';

// Mirrors SdkAvailabilityStatus in the library (kept local so this file has no static import).
const SDK_UNAVAILABLE = 1;
const SDK_UNAVAILABLE_PROVIDER_UPDATE_REQUIRED = 2;
const SDK_AVAILABLE = 3;

export async function getAvailability(): Promise<HcAvailability> {
  const m = hc();
  if (!m) return 'unsupported';
  try {
    const status = await m.getSdkStatus();
    if (status === SDK_AVAILABLE) return 'available';
    if (status === SDK_UNAVAILABLE_PROVIDER_UPDATE_REQUIRED) return 'update-required';
    if (status === SDK_UNAVAILABLE) return 'unavailable';
    return 'unavailable';
  } catch {
    return 'unsupported';
  }
}

let initialized = false;
export async function ensureInitialized(): Promise<boolean> {
  const m = hc();
  if (!m) return false;
  if (initialized) return true;
  try {
    initialized = await m.initialize();
  } catch {
    initialized = false;
  }
  return initialized;
}

/** Every record type Bloom reads. Read-only — Bloom never requests write access. */
export const READ_RECORD_TYPES: MetricId[] = [
  'Steps',
  'Distance',
  'ActiveCaloriesBurned',
  'TotalCaloriesBurned',
  'ExerciseSession',
  'SleepSession',
  'HeartRate',
  'RestingHeartRate',
  'OxygenSaturation',
  'MenstruationPeriod',
  'MenstruationFlow',
];

export interface PermissionOutcome {
  granted: MetricId[];
  /**
   * Whether READ_HEALTH_DATA_HISTORY was included in the request. The library does not
   * report this permission back in its granted list, so Bloom can only know it asked.
   */
  historyRequested: boolean;
}

export async function requestReadPermissions(): Promise<PermissionOutcome> {
  const m = hc();
  if (!m || !(await ensureInitialized())) return { granted: [], historyRequested: false };
  const base = READ_RECORD_TYPES.map((recordType) => ({ accessType: 'read' as const, recordType }));
  let historyRequested = true;
  let result: Awaited<ReturnType<HCModule['requestPermission']>>;
  try {
    result = await m.requestPermission([
      ...base,
      { accessType: 'read', recordType: 'ReadHealthDataHistory' },
    ]);
  } catch {
    // Older Health Connect builds may reject the history permission — retry without it.
    historyRequested = false;
    result = await m.requestPermission(base);
  }
  return { granted: toMetricIds(result), historyRequested };
}

export async function getGrantedReadTypes(): Promise<MetricId[]> {
  const m = hc();
  if (!m || !(await ensureInitialized())) return [];
  try {
    return toMetricIds(await m.getGrantedPermissions());
  } catch {
    return [];
  }
}

function toMetricIds(perms: { accessType: string; recordType: string }[]): MetricId[] {
  const wanted = new Set<string>(READ_RECORD_TYPES);
  return perms
    .filter((p) => p.accessType === 'read' && wanted.has(p.recordType))
    .map((p) => p.recordType as MetricId);
}

export function openHealthConnectSettings(): void {
  const m = hc();
  try {
    m?.openHealthConnectSettings();
  } catch {
    // ignore — the button also explains where to find the settings manually
  }
}

export async function openHealthConnectInPlayStore(): Promise<void> {
  const market = `market://details?id=${HEALTH_CONNECT_PACKAGE}`;
  const web = `https://play.google.com/store/apps/details?id=${HEALTH_CONNECT_PACKAGE}`;
  try {
    await Linking.openURL(market);
  } catch {
    await Linking.openURL(web);
  }
}
