/**
 * Pure parsers for the standard Bluetooth GATT characteristics Bloom reads from a watch.
 * No proprietary (Noise or other) protocols — only the public Bluetooth SIG specs:
 *  - Heart Rate Measurement 0x2A37 (Heart Rate Service 0x180D)
 *  - Battery Level 0x2A19 (Battery Service 0x180F)
 *  - Device Information strings 0x2A29 / 0x2A24 / 0x2A26 (Device Information 0x180A)
 */

/* --------------------------------- UUIDs -------------------------------- */

/** Expands a 16-bit SIG UUID ("180d") to the full 128-bit form ble-plx uses. */
export const sigUuid = (short: string) => `0000${short.toLowerCase()}-0000-1000-8000-00805f9b34fb`;

export const GATT = {
  heartRateService: sigUuid('180d'),
  heartRateMeasurement: sigUuid('2a37'),
  batteryService: sigUuid('180f'),
  batteryLevel: sigUuid('2a19'),
  deviceInfoService: sigUuid('180a'),
  manufacturerName: sigUuid('2a29'),
  modelNumber: sigUuid('2a24'),
  firmwareRevision: sigUuid('2a26'),
} as const;

/** True when a (short or long) UUID refers to the given 16-bit SIG UUID. */
export function isSigUuid(uuid: string | null | undefined, short: string): boolean {
  if (!uuid) return false;
  const u = uuid.toLowerCase();
  const s = short.toLowerCase();
  return u === s || u === sigUuid(s) || u === `0x${s}`;
}

/* -------------------------------- Base64 -------------------------------- */

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const B64_LOOKUP: Record<string, number> = {};
for (let i = 0; i < B64.length; i++) B64_LOOKUP[B64[i]] = i;
B64_LOOKUP['-'] = 62; // url-safe variants, just in case
B64_LOOKUP['_'] = 63;

/** Base64 → bytes. Ignores whitespace and padding; returns [] for empty/invalid input. */
export function base64ToBytes(b64: string | null | undefined): Uint8Array {
  if (!b64) return new Uint8Array(0);
  const clean = b64.replace(/[\s=]/g, '');
  const out: number[] = [];
  let buf = 0;
  let bits = 0;
  for (const ch of clean) {
    const v = B64_LOOKUP[ch];
    if (v === undefined) return new Uint8Array(0);
    buf = (buf << 6) | v;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out.push((buf >> bits) & 0xff);
    }
  }
  return Uint8Array.from(out);
}

/** Bytes → base64 (used by tests and the jest mock). */
export function bytesToBase64(bytes: ArrayLike<number>): string {
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i];
    const b = i + 1 < bytes.length ? bytes[i + 1] : 0;
    const c = i + 2 < bytes.length ? bytes[i + 2] : 0;
    const n = (a << 16) | (b << 8) | c;
    out += B64[(n >> 18) & 63] + B64[(n >> 12) & 63];
    out += i + 1 < bytes.length ? B64[(n >> 6) & 63] : '=';
    out += i + 2 < bytes.length ? B64[n & 63] : '=';
  }
  return out;
}

/* ------------------------- Heart Rate Measurement ------------------------ */

/**
 * Sensor contact, from flag bits 1–2:
 *  - 'unsupported': the watch doesn't report contact (bits 0b00 or 0b01)
 *  - 'not-detected': supported, but no skin contact (0b10)
 *  - 'detected': supported and in contact (0b11)
 */
export type SensorContact = 'unsupported' | 'not-detected' | 'detected';

export interface HeartRateMeasurement {
  bpm: number;
  contact: SensorContact;
  /** Cumulative energy expended in kilojoules, when present (flag bit 3). */
  energyKj: number | null;
  /** RR intervals in milliseconds (flag bit 4; raw unit is 1/1024 s). */
  rrMs: number[];
}

/**
 * Parses a Heart Rate Measurement (0x2A37) value. Returns null for malformed data.
 * Flags: bit0 = BPM is uint16 (else uint8), bits1-2 = sensor contact,
 * bit3 = energy expended (uint16 kJ) present, bit4 = RR intervals (uint16, 1/1024 s) present.
 */
export function parseHeartRate(input: Uint8Array | string | null | undefined): HeartRateMeasurement | null {
  const b = typeof input === 'string' || input == null ? base64ToBytes(input) : input;
  if (b.length < 2) return null;
  const flags = b[0];
  let i = 1;
  let bpm: number;
  if (flags & 0x01) {
    if (b.length < 3) return null;
    bpm = b[i] | (b[i + 1] << 8);
    i += 2;
  } else {
    bpm = b[i];
    i += 1;
  }
  const contactBits = (flags >> 1) & 0x03;
  const contact: SensorContact = contactBits === 0b11 ? 'detected' : contactBits === 0b10 ? 'not-detected' : 'unsupported';
  let energyKj: number | null = null;
  if (flags & 0x08) {
    if (b.length < i + 2) return null;
    energyKj = b[i] | (b[i + 1] << 8);
    i += 2;
  }
  const rrMs: number[] = [];
  if (flags & 0x10) {
    while (i + 1 < b.length) {
      const raw = b[i] | (b[i + 1] << 8);
      rrMs.push(Math.round((raw * 1000) / 1024));
      i += 2;
    }
  }
  return { bpm, contact, energyKj, rrMs };
}

/** Bloom's plausible range (matches repos HR_RANGE). */
export const BPM_MIN = 30;
export const BPM_MAX = 220;

/** True when a measurement is worth showing/saving: in range and not "no skin contact". */
export function isUsableReading(m: Pick<HeartRateMeasurement, 'bpm' | 'contact'> | null): boolean {
  if (!m) return false;
  if (m.contact === 'not-detected') return false;
  return Number.isFinite(m.bpm) && m.bpm >= BPM_MIN && m.bpm <= BPM_MAX;
}

/* ---------------------------- Battery & strings -------------------------- */

/** Battery Level (0x2A19): one uint8, 0–100. Null when missing or out of range. */
export function parseBattery(input: Uint8Array | string | null | undefined): number | null {
  const b = typeof input === 'string' || input == null ? base64ToBytes(input) : input;
  if (b.length < 1) return null;
  const v = b[0];
  return v <= 100 ? v : null;
}

/** UTF-8 decode of a Device Information string; trims NULs/whitespace. Null when empty. */
export function decodeGattString(input: Uint8Array | string | null | undefined): string | null {
  const b = typeof input === 'string' || input == null ? base64ToBytes(input) : input;
  if (!b.length) return null;
  let out = '';
  for (let i = 0; i < b.length; ) {
    const c = b[i];
    let cp: number;
    if (c < 0x80) {
      cp = c;
      i += 1;
    } else if (c >> 5 === 0b110 && i + 1 < b.length) {
      cp = ((c & 0x1f) << 6) | (b[i + 1] & 0x3f);
      i += 2;
    } else if (c >> 4 === 0b1110 && i + 2 < b.length) {
      cp = ((c & 0x0f) << 12) | ((b[i + 1] & 0x3f) << 6) | (b[i + 2] & 0x3f);
      i += 3;
    } else if (c >> 3 === 0b11110 && i + 3 < b.length) {
      cp = ((c & 0x07) << 18) | ((b[i + 1] & 0x3f) << 12) | ((b[i + 2] & 0x3f) << 6) | (b[i + 3] & 0x3f);
      i += 4;
    } else {
      cp = 0xfffd;
      i += 1;
    }
    out += String.fromCodePoint(cp);
  }
  // eslint-disable-next-line no-control-regex
  const s = out.replace(/\u0000+/g, '').trim();
  return s.length ? s : null;
}

/* --------------------------------- Signal -------------------------------- */

export type SignalBars = 0 | 1 | 2 | 3 | 4;

/** RSSI (dBm) → 0–4 bars + a word, so signal is never shown by colour alone. */
export function rssiToSignal(rssi: number | null | undefined): { bars: SignalBars; label: string } {
  if (rssi == null || !Number.isFinite(rssi) || rssi >= 0) return { bars: 0, label: 'Unknown' };
  if (rssi >= -60) return { bars: 4, label: 'Strong' };
  if (rssi >= -70) return { bars: 3, label: 'Good' };
  if (rssi >= -82) return { bars: 2, label: 'Fair' };
  return { bars: 1, label: 'Weak' };
}

/* --------------------------------- Time ---------------------------------- */

/** "9:05 am" without relying on Intl support. */
export function formatClock(d: Date): string {
  const h = d.getHours();
  const m = d.getMinutes();
  return `${h % 12 === 0 ? 12 : h % 12}:${String(m).padStart(2, '0')} ${h < 12 ? 'am' : 'pm'}`;
}
