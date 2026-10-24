/**
 * Manual jest mock for react-native-ble-plx (auto-used for the node_modules package).
 *
 * By default Bluetooth is UNAVAILABLE (constructing BleManager throws), which is what an
 * emulator without BLE looks like. Tests can flip `__mock.available = true` and script a
 * fake watch: scan results, services, characteristic values and heart-rate notifications.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */

type Listener = (error: any, value: any) => void;

export const State = {
  Unknown: 'Unknown',
  Resetting: 'Resetting',
  Unsupported: 'Unsupported',
  Unauthorized: 'Unauthorized',
  PoweredOff: 'PoweredOff',
  PoweredOn: 'PoweredOn',
} as const;

export const BleErrorCode = { OperationCancelled: 2, DeviceDisconnected: 201, BluetoothPoweredOff: 102 } as const;

export class BleError extends Error {
  errorCode: number;
  constructor(message: string, code = 0) {
    super(message);
    this.errorCode = code;
  }
}

export interface MockDevice {
  id: string;
  name: string | null;
  localName?: string | null;
  rssi?: number | null;
  serviceUUIDs?: string[] | null;
  /** Full 128-bit service UUIDs exposed after connecting. */
  services?: string[];
  /** characteristic UUID → base64 value for reads. */
  values?: Record<string, string>;
}

const fresh = () => ({
  available: false,
  state: State.PoweredOn as string,
  devices: [] as MockDevice[],
  connectFails: false,
  monitors: new Map<string, Listener>(),
  disconnectListeners: new Map<string, (e: any, d: any) => void>(),
  stateListeners: new Set<(s: string) => void>(),
  scanning: false,
  connected: new Set<string>(),
});

export const __mock = {
  ...fresh(),
  reset() {
    Object.assign(__mock, fresh());
  },
  /** Push a characteristic notification (e.g. heart rate) to subscribers. */
  notify(charUuid: string, base64: string) {
    __mock.monitors.get(charUuid.toLowerCase())?.(null, { uuid: charUuid, value: base64 });
  },
  setState(s: string) {
    __mock.state = s;
    __mock.stateListeners.forEach((l) => l(s));
  },
  dropConnection(id: string) {
    __mock.connected.delete(id);
    __mock.disconnectListeners.get(id)?.(null, { id });
  },
};

class MockDeviceObj {
  id: string;
  name: string | null;
  localName: string | null;
  rssi: number | null;
  serviceUUIDs: string[] | null;
  private d: MockDevice;
  constructor(d: MockDevice) {
    this.d = d;
    this.id = d.id;
    this.name = d.name;
    this.localName = d.localName ?? null;
    this.rssi = d.rssi ?? null;
    this.serviceUUIDs = d.serviceUUIDs ?? null;
  }
  async discoverAllServicesAndCharacteristics() {
    return this;
  }
  async services() {
    return (this.d.services ?? []).map((uuid) => ({ uuid }));
  }
  async readCharacteristicForService(_s: string, c: string) {
    const v = this.d.values?.[c.toLowerCase()];
    if (v === undefined) throw new BleError('not readable');
    return { uuid: c, value: v };
  }
  monitorCharacteristicForService(_s: string, c: string, l: Listener) {
    __mock.monitors.set(c.toLowerCase(), l);
    return { remove: () => __mock.monitors.delete(c.toLowerCase()) };
  }
}

export class BleManager {
  constructor() {
    if (!__mock.available) throw new Error('BLE native module not available (jest mock)');
  }
  destroy() {
    return Promise.resolve();
  }
  state() {
    return Promise.resolve(__mock.state);
  }
  onStateChange(l: (s: string) => void, emitCurrent = false) {
    __mock.stateListeners.add(l);
    if (emitCurrent) l(__mock.state);
    return { remove: () => __mock.stateListeners.delete(l) };
  }
  startDeviceScan(_uuids: string[] | null, _opts: any, l: Listener) {
    __mock.scanning = true;
    for (const d of __mock.devices) l(null, new MockDeviceObj(d));
    return Promise.resolve();
  }
  stopDeviceScan() {
    __mock.scanning = false;
    return Promise.resolve();
  }
  async isDeviceConnected(id: string) {
    return __mock.connected.has(id);
  }
  async devices(ids: string[]) {
    return __mock.devices.filter((d) => ids.includes(d.id)).map((d) => new MockDeviceObj(d));
  }
  async connectToDevice(id: string) {
    const d = __mock.devices.find((x) => x.id === id);
    if (!d || __mock.connectFails) throw new BleError('connect failed');
    __mock.connected.add(id);
    return new MockDeviceObj(d);
  }
  async cancelDeviceConnection(id: string) {
    __mock.connected.delete(id);
    return { id };
  }
  onDeviceDisconnected(id: string, l: (e: any, d: any) => void) {
    __mock.disconnectListeners.set(id, l);
    return { remove: () => __mock.disconnectListeners.delete(id) };
  }
}
