/**
 * The direct-watch connection, as one app-wide store (survives leaving the Watch screen).
 *
 * scan (15 s) → connect → discover → read Device Information + Battery → subscribe to
 * Heart Rate Measurement → save at most one median reading per minute → auto-reconnect
 * with backoff while the app is in the foreground.
 */
import { AppState as RNAppState, type AppStateStatus, type NativeEventSubscription } from 'react-native';
import type { BleError, Characteristic, Device, Subscription } from 'react-native-ble-plx';
import { vitals } from '../db/repos';
import {
  CONNECT_TIMEOUT_MS,
  GATT,
  SCAN_MS,
  getBleManager,
  hasBlePermissions,
  mergeScanned,
  reconnectDelayMs,
  requestBlePermissions,
  toRadioState,
  toScanned,
  type RadioState,
  type ScannedWatch,
} from './ble';
import { addSample, emptyMinuteState, flushIfDue, type MinuteFlush, type MinuteState } from './minute';
import { decodeGattString, isSigUuid, isUsableReading, parseBattery, parseHeartRate, type SensorContact } from './parse';
import {
  forgetWatch,
  loadLastSaved,
  loadRememberedWatch,
  rememberWatch,
  storeLastSaved,
  WATCH_SOURCE,
  type LastSaved,
  type RememberedWatch,
} from './storage';

export type WatchPhase =
  | 'idle'
  | 'scanning'
  | 'connecting'
  | 'connected'
  /** Lost the connection; waiting to try again. */
  | 'reconnecting';

export type WatchProblem =
  | null
  | 'unsupported'
  | 'permission-denied'
  | 'permission-blocked'
  | 'bluetooth-off'
  | 'connect-failed'
  | 'scan-failed';

export interface ConnectedWatch {
  id: string;
  name: string;
  manufacturer: string | null;
  model: string | null;
  firmware: string | null;
  battery: number | null;
  /** The watch exposes the standard Heart Rate Service. */
  hasHeartRate: boolean;
}

export interface LiveHeartRate {
  bpm: number;
  contact: SensorContact;
  /** ms epoch */
  at: number;
  usable: boolean;
}

export interface WatchState {
  ready: boolean;
  radio: RadioState;
  phase: WatchPhase;
  problem: WatchProblem;
  devices: ScannedWatch[];
  /** ms epoch when the current scan ends, or null when not scanning. */
  scanEndsAt: number | null;
  remembered: RememberedWatch | null;
  connected: ConnectedWatch | null;
  live: LiveHeartRate | null;
  /** Recent usable BPM values (oldest first), for the sparkline. */
  recent: number[];
  lastSaved: LastSaved | null;
  /** Next reconnect attempt (ms epoch), while reconnecting. */
  nextRetryAt: number | null;
}

const RECENT_MAX = 60;

const initial: WatchState = {
  ready: false,
  radio: 'unknown',
  phase: 'idle',
  problem: null,
  devices: [],
  scanEndsAt: null,
  remembered: null,
  connected: null,
  live: null,
  recent: [],
  lastSaved: null,
  nextRetryAt: null,
};

/* --------------------------------- Store -------------------------------- */

let state: WatchState = initial;
const listeners = new Set<() => void>();

function set(patch: Partial<WatchState>) {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
}

export function getWatchState(): WatchState {
  return state;
}

export function subscribeWatch(l: () => void): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}

/* ------------------------------ Internals ------------------------------- */

let initPromise: Promise<void> | null = null;
let stateSub: Subscription | null = null;
let appStateSub: NativeEventSubscription | null = null;
let appActive = true;

let scanTimer: ReturnType<typeof setTimeout> | null = null;
let scanFlushTimer: ReturnType<typeof setTimeout> | null = null;
let pendingDevices: ScannedWatch[] | null = null;

let hrSub: Subscription | null = null;
let batterySub: Subscription | null = null;
let disconnectSub: Subscription | null = null;
let minuteTimer: ReturnType<typeof setInterval> | null = null;
let minute: MinuteState = emptyMinuteState();

let retryTimer: ReturnType<typeof setTimeout> | null = null;
let retryAttempt = 0;
/** The person tapped Disconnect/Forget: don't auto-reconnect until they connect again. */
let userDisconnected = false;

const removeSub = (s: { remove(): void } | null) => {
  try {
    s?.remove();
  } catch {
    // ignore
  }
};

function clearRetry() {
  if (retryTimer) clearTimeout(retryTimer);
  retryTimer = null;
}

let lightPromise: Promise<void> | null = null;

/**
 * App-start hook (root layout, Today chip): loads the remembered watch and only touches
 * Bluetooth when one was paired before — so a paired watch reconnects, and for everyone else
 * this never constructs a BleManager. Idempotent; never throws.
 */
export function initWatchIfPaired(): Promise<void> {
  if (initPromise) return initPromise;
  if (lightPromise) return lightPromise;
  lightPromise = (async () => {
    try {
      const [remembered, lastSaved] = await Promise.all([loadRememberedWatch(), loadLastSaved()]);
      if (remembered) {
        await initWatch();
        return;
      }
      if (!initPromise) set({ remembered: null, lastSaved });
    } catch {
      // non-fatal: the Watch screen initialises Bluetooth itself
    } finally {
      lightPromise = null;
    }
  })();
  return lightPromise;
}

/** Sets up radio-state + app-state listeners and loads the remembered watch. Idempotent. */
export function initWatch(): Promise<void> {
  if (initPromise) return initPromise;
  initPromise = (async () => {
    const [remembered, lastSaved] = await Promise.all([loadRememberedWatch(), loadLastSaved()]);
    const m = getBleManager();
    if (!m) {
      set({ ready: true, radio: 'unsupported', problem: 'unsupported', remembered, lastSaved });
      return;
    }
    set({ remembered, lastSaved });
    try {
      stateSub = m.onStateChange((s) => onRadio(toRadioState(s)), true);
    } catch {
      set({ ready: true, radio: 'unsupported', problem: 'unsupported' });
      return;
    }
    appStateSub = RNAppState.addEventListener('change', onAppState);
    set({ ready: true });
  })();
  return initPromise;
}

/** Test hook: tear everything down and reset the store. */
export async function __resetWatchForTests() {
  clearRetry();
  stopScanTimers();
  teardownConnection();
  removeSub(stateSub);
  removeSub(appStateSub);
  stateSub = null;
  appStateSub = null;
  initPromise = null;
  lightPromise = null;
  userDisconnected = false;
  retryAttempt = 0;
  minute = emptyMinuteState();
  state = initial;
  listeners.forEach((l) => l());
}

function onRadio(radio: RadioState) {
  const prev = state.radio;
  if (radio === 'unsupported') {
    set({ radio, problem: 'unsupported' });
    return;
  }
  if (radio === 'off') {
    stopScanTimers();
    clearRetry();
    set({
      radio,
      problem: 'bluetooth-off',
      scanEndsAt: null,
      phase: state.phase === 'scanning' || state.phase === 'connecting' ? 'idle' : state.phase,
    });
    return;
  }
  set({ radio, problem: state.problem === 'bluetooth-off' ? null : state.problem });
  if (radio === 'on' && prev !== 'on') void autoConnect();
}

function onAppState(s: AppStateStatus) {
  appActive = s === 'active';
  if (!appActive) {
    // Only reconnect while Bloom is open.
    clearRetry();
    return;
  }
  if (state.phase === 'reconnecting' || (state.phase === 'idle' && state.remembered && !userDisconnected)) {
    retryAttempt = 0;
    void autoConnect();
  }
}

/** Reconnects to the remembered watch when Bluetooth is on and permission is already granted. */
async function autoConnect() {
  const r = state.remembered;
  if (!r || userDisconnected || !appActive) return;
  if (state.phase === 'connected' || state.phase === 'connecting' || state.phase === 'scanning') return;
  if (state.radio !== 'on') return;
  if (!(await hasBlePermissions())) return;
  await connectInternal(r.id, r.name, true);
}

function scheduleReconnect() {
  clearRetry();
  if (userDisconnected || !state.remembered || !appActive || state.radio === 'off') {
    set({ phase: 'idle', nextRetryAt: null });
    return;
  }
  const delay = reconnectDelayMs(retryAttempt);
  retryAttempt += 1;
  set({ phase: 'reconnecting', nextRetryAt: Date.now() + delay });
  retryTimer = setTimeout(() => {
    retryTimer = null;
    const r = state.remembered;
    if (r) void connectInternal(r.id, r.name, true);
  }, delay);
}

/* ------------------------------- Scanning ------------------------------- */

function stopScanTimers() {
  if (scanTimer) clearTimeout(scanTimer);
  if (scanFlushTimer) clearTimeout(scanFlushTimer);
  scanTimer = null;
  scanFlushTimer = null;
  pendingDevices = null;
  const m = getBleManager();
  if (m) {
    try {
      void Promise.resolve(m.stopDeviceScan()).catch(() => {});
    } catch {
      // ignore
    }
  }
}

/** Makes sure we may use Bluetooth: permissions + radio on. Sets `problem` when not. */
async function ensureReady(): Promise<boolean> {
  await initWatch();
  const m = getBleManager();
  if (!m) {
    set({ problem: 'unsupported' });
    return false;
  }
  const p = await requestBlePermissions();
  if (p !== 'granted') {
    set({ problem: p === 'blocked' ? 'permission-blocked' : 'permission-denied' });
    return false;
  }
  try {
    const radio = toRadioState(await m.state());
    if (radio !== state.radio) set({ radio });
    if (radio === 'off') {
      set({ problem: 'bluetooth-off' });
      return false;
    }
    if (radio === 'unsupported') {
      set({ problem: 'unsupported' });
      return false;
    }
  } catch {
    // state() failing isn't fatal; scanning will report errors
  }
  return true;
}

/** Scans for 15 s, listing named devices (heart-rate devices first). */
export async function startScan(): Promise<void> {
  if (state.phase === 'scanning' || state.phase === 'connecting') return;
  set({ problem: null });
  if (!(await ensureReady())) return;
  const m = getBleManager()!;
  clearRetry();
  stopScanTimers();
  set({ phase: 'scanning', devices: [], scanEndsAt: Date.now() + SCAN_MS });
  try {
    await m.startDeviceScan(null, { allowDuplicates: false }, (error: BleError | null, d: Device | null) => {
      if (error) {
        stopScanTimers();
        set({ phase: state.connected ? 'connected' : 'idle', scanEndsAt: null, problem: state.radio === 'off' ? 'bluetooth-off' : 'scan-failed' });
        return;
      }
      const hit = d ? toScanned(d) : null;
      if (!hit) return;
      // Android reports the same device many times; batch updates to ~3 per second.
      pendingDevices = mergeScanned(pendingDevices ?? state.devices, hit);
      if (!scanFlushTimer) {
        scanFlushTimer = setTimeout(() => {
          scanFlushTimer = null;
          if (pendingDevices) set({ devices: pendingDevices });
          pendingDevices = null;
        }, 300);
      }
    });
  } catch {
    stopScanTimers();
    set({ phase: state.connected ? 'connected' : 'idle', scanEndsAt: null, problem: 'scan-failed' });
    return;
  }
  scanTimer = setTimeout(() => stopScan(), SCAN_MS);
}

export function stopScan() {
  const pending = pendingDevices;
  stopScanTimers();
  set({
    devices: pending ?? state.devices,
    scanEndsAt: null,
    phase: state.phase === 'scanning' ? (state.connected ? 'connected' : 'idle') : state.phase,
  });
}

/* ------------------------------ Connection ------------------------------ */

function teardownConnection() {
  removeSub(hrSub);
  removeSub(batterySub);
  removeSub(disconnectSub);
  hrSub = batterySub = disconnectSub = null;
  if (minuteTimer) clearInterval(minuteTimer);
  minuteTimer = null;
}

async function readString(d: Device, service: string, ch: string): Promise<string | null> {
  try {
    const c = await d.readCharacteristicForService(service, ch);
    return decodeGattString(c.value);
  } catch {
    return null;
  }
}

/** Connect chosen from the scan list (person-initiated). */
export async function connectTo(id: string, name: string): Promise<void> {
  userDisconnected = false;
  retryAttempt = 0;
  set({ problem: null });
  if (!(await ensureReady())) return;
  await connectInternal(id, name, false);
}

async function connectInternal(id: string, name: string, isRetry: boolean): Promise<void> {
  const m = getBleManager();
  if (!m) return;
  if (state.phase === 'scanning') stopScan();
  clearRetry();
  teardownConnection();
  set({ phase: 'connecting', nextRetryAt: null });
  let device: Device;
  try {
    const already = await m.isDeviceConnected(id).catch(() => false);
    device = already
      ? (await m.devices([id]))[0] ?? (await m.connectToDevice(id, { timeout: CONNECT_TIMEOUT_MS }))
      : await m.connectToDevice(id, { timeout: CONNECT_TIMEOUT_MS });
    device = await device.discoverAllServicesAndCharacteristics();
  } catch {
    if (isRetry && state.remembered && !userDisconnected) {
      scheduleReconnect();
    } else {
      set({ phase: 'idle', problem: 'connect-failed' });
    }
    return;
  }
  if (userDisconnected) {
    // Disconnect was tapped while we were connecting.
    m.cancelDeviceConnection(id).catch(() => {});
    set({ phase: 'idle' });
    return;
  }

  retryAttempt = 0;
  const displayName = (device.name ?? device.localName ?? name ?? '').trim() || name || 'Watch';

  let hasHeartRate = false;
  let hasBattery = false;
  let hasInfo = false;
  try {
    const services = await device.services();
    hasHeartRate = services.some((s) => isSigUuid(s.uuid, '180d'));
    hasBattery = services.some((s) => isSigUuid(s.uuid, '180f'));
    hasInfo = services.some((s) => isSigUuid(s.uuid, '180a'));
  } catch {
    // keep defaults
  }

  const [manufacturer, model, firmware] = hasInfo
    ? await Promise.all([
        readString(device, GATT.deviceInfoService, GATT.manufacturerName),
        readString(device, GATT.deviceInfoService, GATT.modelNumber),
        readString(device, GATT.deviceInfoService, GATT.firmwareRevision),
      ])
    : [null, null, null];

  let battery: number | null = null;
  if (hasBattery) {
    try {
      battery = parseBattery((await device.readCharacteristicForService(GATT.batteryService, GATT.batteryLevel)).value);
    } catch {
      battery = null;
    }
    try {
      batterySub = device.monitorCharacteristicForService(GATT.batteryService, GATT.batteryLevel, (err, c) => {
        if (err || !c) return;
        const b = parseBattery(c.value);
        if (b !== null && state.connected) set({ connected: { ...state.connected, battery: b } });
      });
    } catch {
      batterySub = null; // battery notifications are optional
    }
  }

  const connected: ConnectedWatch = { id, name: displayName, manufacturer, model, firmware, battery, hasHeartRate };
  const remembered = { id, name: displayName, savedAt: new Date().toISOString() };
  await rememberWatch(remembered);
  set({ phase: 'connected', connected, remembered, problem: null, live: null, recent: [] });

  disconnectSub = m.onDeviceDisconnected(id, () => onLostConnection());

  if (hasHeartRate) {
    minute = emptyMinuteState();
    try {
      hrSub = device.monitorCharacteristicForService(GATT.heartRateService, GATT.heartRateMeasurement, (err, c) =>
        onHeartRate(err, c)
      );
    } catch {
      hrSub = null;
    }
    minuteTimer = setInterval(() => {
      const r = flushIfDue(minute, new Date());
      minute = r.state;
      if (r.flush) void saveMinute(r.flush);
    }, 15_000);
  }
}

function onHeartRate(err: BleError | null, c: Characteristic | null) {
  if (err || !c) return;
  const m = parseHeartRate(c.value);
  if (!m) return;
  const at = new Date();
  const usable = isUsableReading(m);
  set({
    live: { bpm: m.bpm, contact: m.contact, at: at.getTime(), usable },
    recent: usable ? [...state.recent, m.bpm].slice(-RECENT_MAX) : state.recent,
  });
  const r = addSample(minute, { bpm: m.bpm, contact: m.contact, at });
  minute = r.state;
  if (r.flush) void saveMinute(r.flush);
}

/** Saves one per-minute median reading into Bloom's vitals. */
export async function saveMinute(f: MinuteFlush): Promise<void> {
  try {
    await vitals.add({ kind: 'hr', value: f.bpm, time: f.time, source: WATCH_SOURCE });
    const lastSaved = { bpm: f.bpm, time: f.time.toISOString() };
    set({ lastSaved });
    await storeLastSaved(lastSaved);
  } catch {
    // validation or DB error — skip this minute
  }
}

function flushPartialMinute() {
  const r = flushIfDue(minute, new Date(), true);
  minute = r.state;
  if (r.flush) void saveMinute(r.flush);
}

function onLostConnection() {
  flushPartialMinute();
  teardownConnection();
  set({ connected: null, live: null });
  if (userDisconnected) {
    set({ phase: 'idle' });
    return;
  }
  scheduleReconnect();
}

/** Person-initiated disconnect. Keeps the watch remembered, stops auto-reconnect. */
export async function disconnect(): Promise<void> {
  userDisconnected = true;
  clearRetry();
  flushPartialMinute();
  const id = state.connected?.id ?? state.remembered?.id;
  teardownConnection();
  set({ phase: 'idle', connected: null, live: null, nextRetryAt: null });
  const m = getBleManager();
  if (m && id) await m.cancelDeviceConnection(id).catch(() => {});
}

/** Disconnect and forget the watch. */
export async function forget(): Promise<void> {
  await disconnect();
  await forgetWatch();
  set({ remembered: null, lastSaved: null, recent: [] });
}

/** Re-try the remembered watch now (from the "Reconnecting…" card). */
export async function reconnectNow(): Promise<void> {
  const r = state.remembered;
  if (!r) return;
  userDisconnected = false;
  retryAttempt = 0;
  clearRetry();
  if (!(await ensureReady())) return;
  await connectInternal(r.id, r.name, true);
}

export function clearProblem() {
  set({ problem: state.radio === 'unsupported' ? 'unsupported' : null });
}
