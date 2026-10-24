/**
 * Direct-watch controller against the manual react-native-ble-plx mock:
 * unavailable → graceful; scan → connect → device info/battery → live HR → one save a minute.
 */
import { PermissionsAndroid } from 'react-native';
import { setDriver } from '../src/db/driver';
import { vitals } from '../src/db/repos';
import { __resetBleManagerForTests } from '../src/watch/ble';
import {
  __resetWatchForTests,
  connectTo,
  disconnect,
  forget,
  getWatchState,
  initWatch,
  initWatchIfPaired,
  startScan,
  stopScan,
} from '../src/watch/controller';
import { GATT, bytesToBase64, sigUuid } from '../src/watch/parse';
import { loadRememberedWatch, rememberWatch } from '../src/watch/storage';
import { memoryDriver } from '../test-utils/memoryDriver';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { __mock } = require('react-native-ble-plx') as typeof import('../__mocks__/react-native-ble-plx');

const str = (s: string) => bytesToBase64(Array.from(new TextEncoder().encode(s)));
const tick = (ms = 0) => new Promise((r) => setTimeout(r, ms));

const WATCH = {
  id: 'AA:BB',
  name: 'Noise ColorFit',
  rssi: -58,
  serviceUUIDs: [sigUuid('180d')],
  services: [sigUuid('180d'), sigUuid('180f'), sigUuid('180a')],
  values: {
    [GATT.batteryLevel]: bytesToBase64([64]),
    [GATT.manufacturerName]: str('Noise'),
    [GATT.modelNumber]: str('ColorFit Pro 4'),
    [GATT.firmwareRevision]: str('1.2.3'),
  },
};

beforeEach(async () => {
  setDriver(memoryDriver());
  await __resetWatchForTests();
  __resetBleManagerForTests();
  __mock.reset();
  jest.spyOn(PermissionsAndroid, 'requestMultiple').mockImplementation(async (perms) =>
    Object.fromEntries(perms.map((p) => [p, PermissionsAndroid.RESULTS.GRANTED])) as never
  );
  jest.spyOn(PermissionsAndroid, 'check').mockResolvedValue(true);
});

afterEach(async () => {
  await __resetWatchForTests();
  jest.restoreAllMocks();
});

it('app start: initWatchIfPaired leaves Bluetooth alone when nothing is paired', async () => {
  __mock.available = true;
  __mock.state = 'PoweredOn';
  await initWatchIfPaired();
  // initWatch() would have created the manager and marked the store ready.
  expect(getWatchState().ready).toBe(false);
  expect(getWatchState().radio).toBe('unknown');
  expect(getWatchState().remembered).toBeNull();

  // With a paired watch it sets up Bluetooth so the watch can reconnect.
  await rememberWatch({ id: 'AA:BB', name: 'Band' });
  await initWatchIfPaired();
  expect(getWatchState().ready).toBe(true);
  expect(getWatchState().remembered?.id).toBe('AA:BB');
});

it('reports unsupported when BLE is unavailable', async () => {
  await initWatch();
  expect(getWatchState().problem).toBe('unsupported');
  expect(getWatchState().radio).toBe('unsupported');
});

it('asks to turn Bluetooth on when it is off', async () => {
  __mock.available = true;
  __mock.state = 'PoweredOff';
  await startScan();
  expect(getWatchState().problem).toBe('bluetooth-off');
  expect(getWatchState().phase).toBe('idle');
});

it('reports a denied permission (Android 12+ asks for scan + connect)', async () => {
  const { Platform } = jest.requireActual('react-native') as typeof import('react-native');
  const os = Object.getOwnPropertyDescriptor(Platform, 'OS');
  const ver = Object.getOwnPropertyDescriptor(Platform, 'Version');
  Object.defineProperty(Platform, 'OS', { get: () => 'android', configurable: true });
  Object.defineProperty(Platform, 'Version', { get: () => 34, configurable: true });
  __mock.available = true;
  (PermissionsAndroid.requestMultiple as jest.Mock).mockImplementation(async (perms: string[]) =>
    Object.fromEntries(perms.map((p) => [p, PermissionsAndroid.RESULTS.DENIED]))
  );
  try {
    await startScan();
    expect(getWatchState().problem).toBe('permission-denied');
    expect((PermissionsAndroid.requestMultiple as jest.Mock).mock.calls[0][0]).toEqual([
      PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
      PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
    ]);
  } finally {
    if (os) Object.defineProperty(Platform, 'OS', os);
    if (ver) Object.defineProperty(Platform, 'Version', ver);
  }
});

it('scans, connects, reads info + battery, shows live HR and saves one reading a minute', async () => {
  __mock.available = true;
  __mock.devices = [WATCH, { id: 'CC', name: 'Speaker', rssi: -40 }, { id: 'DD', name: null, rssi: -30 }];
  await startScan();
  await tick(350);
  const s1 = getWatchState();
  expect(s1.phase).toBe('scanning');
  expect(s1.devices.map((d) => d.name)).toEqual(['Noise ColorFit', 'Speaker']);
  expect(s1.devices[0].advertisesHeartRate).toBe(true);
  stopScan();
  expect(getWatchState().phase).toBe('idle');

  await connectTo(WATCH.id, WATCH.name);
  const s2 = getWatchState();
  expect(s2.phase).toBe('connected');
  expect(s2.connected).toMatchObject({
    name: 'Noise ColorFit',
    manufacturer: 'Noise',
    model: 'ColorFit Pro 4',
    firmware: '1.2.3',
    battery: 64,
    hasHeartRate: true,
  });
  expect(await loadRememberedWatch()).toMatchObject({ id: 'AA:BB', name: 'Noise ColorFit' });

  // Live notifications; time is controlled so we can cross a minute boundary.
  const base = new Date('2026-10-24T04:30:00.000Z').getTime();
  const nowSpy = jest.spyOn(Date, 'now');
  const RealDate = Date;
  let fakeNow = base + 5_000;
  nowSpy.mockImplementation(() => fakeNow);
  const g = globalThis as unknown as { Date: DateConstructor };
  g.Date = class extends RealDate {
    constructor(...args: unknown[]) {
      if (args.length === 0) super(fakeNow);
      else super(...(args as [number]));
    }
    static now() {
      return fakeNow;
    }
  } as DateConstructor;
  try {
    for (const [sec, bpm] of [
      [5, 70],
      [20, 74],
      [40, 0],
      [50, 72],
    ] as const) {
      fakeNow = base + sec * 1000;
      __mock.notify(GATT.heartRateMeasurement, bytesToBase64([0b0110, bpm]));
    }
    expect(getWatchState().live).toMatchObject({ bpm: 72, usable: true });
    expect(getWatchState().recent).toEqual([70, 74, 72]);
    // No-contact sample shows but isn't usable.
    fakeNow = base + 55_000;
    __mock.notify(GATT.heartRateMeasurement, bytesToBase64([0b0100, 66]));
    expect(getWatchState().live).toMatchObject({ bpm: 66, usable: false, contact: 'not-detected' });

    fakeNow = base + 65_000;
    __mock.notify(GATT.heartRateMeasurement, bytesToBase64([0x00, 90]));
    await tick(20);
  } finally {
    g.Date = RealDate;
    nowSpy.mockRestore();
  }

  const saved = await vitals.listBetween('hr', new Date(base - 60_000), new Date(base + 120_000));
  expect(saved.map((v) => v.value)).toEqual([72]);
  expect(saved[0].source).toBe('bloom:watch');
  expect(getWatchState().lastSaved?.bpm).toBe(72);

  // Disconnect force-saves the partial minute (90) and stops auto-reconnect.
  await disconnect();
  await tick(20);
  expect(getWatchState().phase).toBe('idle');
  expect(getWatchState().remembered?.id).toBe('AA:BB');

  await forget();
  expect(getWatchState().remembered).toBeNull();
  expect(await loadRememberedWatch()).toBeNull();
});

it('schedules a reconnect when the connection drops', async () => {
  __mock.available = true;
  __mock.devices = [WATCH];
  await connectTo(WATCH.id, WATCH.name);
  expect(getWatchState().phase).toBe('connected');
  __mock.dropConnection(WATCH.id);
  const s = getWatchState();
  expect(s.phase).toBe('reconnecting');
  expect(s.connected).toBeNull();
  expect(s.nextRetryAt).not.toBeNull();
});

it('connects to a watch without the heart-rate service and says so', async () => {
  __mock.available = true;
  __mock.devices = [{ ...WATCH, serviceUUIDs: [], services: [sigUuid('180f')] }];
  await connectTo(WATCH.id, WATCH.name);
  expect(getWatchState().connected).toMatchObject({ hasHeartRate: false, battery: 64, manufacturer: null });
});

it('shows a friendly error when connecting fails', async () => {
  __mock.available = true;
  __mock.devices = [WATCH];
  __mock.connectFails = true;
  await connectTo(WATCH.id, WATCH.name);
  expect(getWatchState().problem).toBe('connect-failed');
  expect(getWatchState().phase).toBe('idle');
});
