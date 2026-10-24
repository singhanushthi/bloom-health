/**
 * Thin, lazy wrapper around react-native-ble-plx.
 *
 * - The BleManager is created on first use, never at import time (jest, emulators and
 *   phones without BLE must not crash just by loading this file).
 * - Android 12+ asks for BLUETOOTH_SCAN (declared neverForLocation) + BLUETOOTH_CONNECT;
 *   Android 11 and older fall back to ACCESS_FINE_LOCATION, which BLE scanning needs there.
 * - Only standard GATT services are used; no proprietary watch protocols.
 */
import { Linking, PermissionsAndroid, Platform, type Permission } from 'react-native';
import type { BleManager, Device } from 'react-native-ble-plx';
import { GATT, isSigUuid } from './parse';

/* ------------------------------- Manager -------------------------------- */

let manager: BleManager | null = null;
let unavailable = false;

/** The shared BleManager, or null when Bluetooth LE isn't available in this runtime. */
export function getBleManager(): BleManager | null {
  if (manager) return manager;
  if (unavailable) return null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('react-native-ble-plx') as typeof import('react-native-ble-plx');
    if (!mod?.BleManager) throw new Error('react-native-ble-plx not linked');
    manager = new mod.BleManager();
  } catch {
    unavailable = true;
    manager = null;
  }
  return manager;
}

export function isBleAvailable(): boolean {
  return getBleManager() !== null;
}

/** Test hook: drop the singleton so the next call constructs again. */
export function __resetBleManagerForTests() {
  try {
    manager?.destroy();
  } catch {
    // ignore
  }
  manager = null;
  unavailable = false;
}

/* -------------------------------- State --------------------------------- */

export type RadioState = 'unknown' | 'on' | 'off' | 'unauthorized' | 'unsupported';

/** ble-plx State string → Bloom's simpler radio state. */
export function toRadioState(s: string | null | undefined): RadioState {
  switch (s) {
    case 'PoweredOn':
      return 'on';
    case 'PoweredOff':
      return 'off';
    case 'Unauthorized':
      return 'unauthorized';
    case 'Unsupported':
      return 'unsupported';
    default:
      return 'unknown';
  }
}

/** Opens Android's Bluetooth settings so the person can switch Bluetooth on. */
export async function openBluetoothSettings(): Promise<void> {
  try {
    if (Platform.OS === 'android') {
      await Linking.sendIntent('android.settings.BLUETOOTH_SETTINGS');
      return;
    }
  } catch {
    // fall through
  }
  try {
    await Linking.openSettings();
  } catch {
    // nothing else we can do; the UI explains where the setting is
  }
}

/* ----------------------------- Permissions ------------------------------ */

export type PermissionOutcome = 'granted' | 'denied' | 'blocked';

const androidApi = () => (Platform.OS === 'android' ? Number(Platform.Version) : 0);

function blePermissions(): Permission[] {
  const P = PermissionsAndroid.PERMISSIONS;
  if (androidApi() >= 31) return [P.BLUETOOTH_SCAN, P.BLUETOOTH_CONNECT];
  return [P.ACCESS_FINE_LOCATION];
}

/** True when everything needed to scan/connect is already granted (never prompts). */
export async function hasBlePermissions(): Promise<boolean> {
  if (Platform.OS !== 'android') return true;
  try {
    const results = await Promise.all(blePermissions().map((p) => PermissionsAndroid.check(p)));
    return results.every(Boolean);
  } catch {
    return false;
  }
}

/** Asks for Bluetooth permissions (Android 12+) or location (Android 11 and older). */
export async function requestBlePermissions(): Promise<PermissionOutcome> {
  if (Platform.OS !== 'android') return 'granted';
  try {
    const perms = blePermissions();
    const res = await PermissionsAndroid.requestMultiple(perms);
    const values = perms.map((p) => res[p]);
    if (values.every((v) => v === PermissionsAndroid.RESULTS.GRANTED)) return 'granted';
    if (values.some((v) => v === PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN)) return 'blocked';
    return 'denied';
  } catch {
    return 'denied';
  }
}

/* ---------------------------- Scan results ------------------------------ */

export interface ScannedWatch {
  id: string;
  name: string;
  rssi: number | null;
  /** Advertises the standard Heart Rate Service (0x180D). */
  advertisesHeartRate: boolean;
}

/** Scan result → list entry. Unnamed devices are skipped (they're rarely watches). */
export function toScanned(d: Pick<Device, 'id' | 'name' | 'localName' | 'rssi' | 'serviceUUIDs'>): ScannedWatch | null {
  const name = (d.name ?? d.localName ?? '').trim();
  if (!name) return null;
  return {
    id: d.id,
    name,
    rssi: d.rssi ?? null,
    advertisesHeartRate: (d.serviceUUIDs ?? []).some((u) => isSigUuid(u, '180d')),
  };
}

/** Merge a new scan hit into the list, heart-rate devices first, then strongest signal. */
export function mergeScanned(list: ScannedWatch[], hit: ScannedWatch): ScannedWatch[] {
  const i = list.findIndex((d) => d.id === hit.id);
  const next = i >= 0 ? list.map((d, j) => (j === i ? { ...d, ...hit, advertisesHeartRate: d.advertisesHeartRate || hit.advertisesHeartRate } : d)) : [...list, hit];
  return next.sort((a, b) => {
    if (a.advertisesHeartRate !== b.advertisesHeartRate) return a.advertisesHeartRate ? -1 : 1;
    return (b.rssi ?? -999) - (a.rssi ?? -999);
  });
}

/* ------------------------------- Backoff -------------------------------- */

/** Reconnect delay: 2 s, 4 s, 8 s, 16 s, 32 s, then every 60 s. */
export function reconnectDelayMs(attempt: number): number {
  return Math.min(60_000, 2_000 * 2 ** Math.max(0, attempt));
}

export const SCAN_MS = 15_000;
export const CONNECT_TIMEOUT_MS = 15_000;

export { GATT };
