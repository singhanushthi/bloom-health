import { mergeScanned, reconnectDelayMs, toRadioState, toScanned } from '../src/watch/ble';
import { addSample, emptyMinuteState, flushIfDue, median, type MinuteFlush, type MinuteState } from '../src/watch/minute';
import {
  base64ToBytes,
  bytesToBase64,
  decodeGattString,
  formatClock,
  isSigUuid,
  isUsableReading,
  parseBattery,
  parseHeartRate,
  rssiToSignal,
  sigUuid,
} from '../src/watch/parse';

describe('base64', () => {
  it('round-trips bytes', () => {
    for (const bytes of [[], [0], [1, 2], [0x16, 0x48, 0x00], [255, 254, 253, 0, 1, 2, 3]]) {
      expect(Array.from(base64ToBytes(bytesToBase64(bytes)))).toEqual(bytes);
    }
  });
  it('decodes known values and rejects junk', () => {
    expect(Array.from(base64ToBytes('AEg='))).toEqual([0x00, 0x48]);
    expect(base64ToBytes('***').length).toBe(0);
    expect(base64ToBytes(null).length).toBe(0);
  });
});

describe('parseHeartRate', () => {
  const b64 = (bytes: number[]) => bytesToBase64(bytes);

  it('reads uint8 BPM with no contact support', () => {
    expect(parseHeartRate(b64([0x00, 72]))).toEqual({ bpm: 72, contact: 'unsupported', energyKj: null, rrMs: [] });
  });

  it('reads uint16 BPM (flag bit 0)', () => {
    expect(parseHeartRate(b64([0x01, 0x2c, 0x01]))?.bpm).toBe(300);
    expect(parseHeartRate(b64([0x01, 75, 0]))?.bpm).toBe(75);
  });

  it('reads sensor contact bits', () => {
    expect(parseHeartRate(b64([0b0110, 70]))?.contact).toBe('detected');
    expect(parseHeartRate(b64([0b0100, 70]))?.contact).toBe('not-detected');
    expect(parseHeartRate(b64([0b0010, 70]))?.contact).toBe('unsupported');
  });

  it('reads energy expended (bit 3) and RR intervals (bit 4) in order', () => {
    // flags: uint8 bpm, contact detected, energy, RR
    const flags = 0x08 | 0x10 | 0b0110;
    const m = parseHeartRate(b64([flags, 64, 0x10, 0x01, 0x00, 0x04, 0x00, 0x02]))!;
    expect(m.bpm).toBe(64);
    expect(m.energyKj).toBe(0x0110);
    expect(m.rrMs).toEqual([1000, 500]); // 1024/1024 s, 512/1024 s
  });

  it('reads RR without energy, with uint16 BPM', () => {
    const m = parseHeartRate(new Uint8Array([0x11, 60, 0, 0x33, 0x03]))!;
    expect(m.bpm).toBe(60);
    expect(m.energyKj).toBeNull();
    expect(m.rrMs).toEqual([Math.round((0x0333 * 1000) / 1024)]);
  });

  it('returns null for malformed data', () => {
    expect(parseHeartRate(null)).toBeNull();
    expect(parseHeartRate(b64([0x00]))).toBeNull();
    expect(parseHeartRate(b64([0x01, 60]))).toBeNull();
    expect(parseHeartRate(b64([0x08, 60, 1]))).toBeNull();
  });

  it('usable readings exclude 0, no contact and out-of-range values', () => {
    expect(isUsableReading({ bpm: 72, contact: 'detected' })).toBe(true);
    expect(isUsableReading({ bpm: 72, contact: 'unsupported' })).toBe(true);
    expect(isUsableReading({ bpm: 72, contact: 'not-detected' })).toBe(false);
    expect(isUsableReading({ bpm: 0, contact: 'detected' })).toBe(false);
    expect(isUsableReading({ bpm: 29, contact: 'detected' })).toBe(false);
    expect(isUsableReading({ bpm: 221, contact: 'detected' })).toBe(false);
    expect(isUsableReading({ bpm: 30, contact: 'detected' })).toBe(true);
    expect(isUsableReading({ bpm: 220, contact: 'detected' })).toBe(true);
  });
});

describe('battery and device info', () => {
  it('parses battery level', () => {
    expect(parseBattery(bytesToBase64([87]))).toBe(87);
    expect(parseBattery(bytesToBase64([101]))).toBeNull();
    expect(parseBattery('')).toBeNull();
  });
  it('decodes UTF-8 strings and trims NULs', () => {
    const enc = (s: string) => bytesToBase64(Array.from(new TextEncoder().encode(s)));
    expect(decodeGattString(enc('Noise'))).toBe('Noise');
    expect(decodeGattString(enc('ColorFit Pro 4\u0000\u0000'))).toBe('ColorFit Pro 4');
    expect(decodeGattString(enc('Café ✓'))).toBe('Café ✓');
    expect(decodeGattString(enc('  '))).toBeNull();
    expect(decodeGattString(null)).toBeNull();
  });
});

describe('uuids, signal, scan list', () => {
  it('matches short and long SIG UUIDs', () => {
    expect(isSigUuid('0000180D-0000-1000-8000-00805F9B34FB', '180d')).toBe(true);
    expect(isSigUuid('180d', '180D')).toBe(true);
    expect(isSigUuid(sigUuid('180f'), '180d')).toBe(false);
    expect(isSigUuid(null, '180d')).toBe(false);
  });
  it('maps RSSI to bars and a word', () => {
    expect(rssiToSignal(-50)).toEqual({ bars: 4, label: 'Strong' });
    expect(rssiToSignal(-65).bars).toBe(3);
    expect(rssiToSignal(-80).bars).toBe(2);
    expect(rssiToSignal(-95)).toEqual({ bars: 1, label: 'Weak' });
    expect(rssiToSignal(null)).toEqual({ bars: 0, label: 'Unknown' });
  });
  it('skips unnamed devices and puts heart-rate devices first', () => {
    expect(toScanned({ id: 'x', name: null, localName: null, rssi: -40, serviceUUIDs: null })).toBeNull();
    let list = [toScanned({ id: 'a', name: 'Earbuds', localName: null, rssi: -40, serviceUUIDs: null })!];
    list = mergeScanned(list, toScanned({ id: 'b', name: 'Watch', localName: null, rssi: -80, serviceUUIDs: [sigUuid('180d')] })!);
    list = mergeScanned(list, toScanned({ id: 'c', name: 'TV', localName: null, rssi: -30, serviceUUIDs: null })!);
    expect(list.map((d) => d.id)).toEqual(['b', 'c', 'a']);
    list = mergeScanned(list, { id: 'a', name: 'Earbuds', rssi: -20, advertisesHeartRate: false });
    expect(list.map((d) => d.id)).toEqual(['b', 'a', 'c']);
    expect(list).toHaveLength(3);
  });
  it('maps radio states and backs off reconnects', () => {
    expect(toRadioState('PoweredOn')).toBe('on');
    expect(toRadioState('PoweredOff')).toBe('off');
    expect(toRadioState('Resetting')).toBe('unknown');
    expect([0, 1, 2, 3, 4, 5, 9].map(reconnectDelayMs)).toEqual([2000, 4000, 8000, 16000, 32000, 60000, 60000]);
  });
  it('formats clock times', () => {
    expect(formatClock(new Date(2026, 0, 1, 0, 5))).toBe('12:05 am');
    expect(formatClock(new Date(2026, 0, 1, 13, 42))).toBe('1:42 pm');
  });
});

describe('once-per-minute median saving', () => {
  const T0 = new Date('2026-10-24T10:00:00.000Z').getTime();
  const at = (sec: number) => new Date(T0 + sec * 1000);

  function feed(samples: [number, number, ('detected' | 'not-detected' | 'unsupported')?][]) {
    let s: MinuteState = emptyMinuteState();
    const saved: MinuteFlush[] = [];
    for (const [sec, bpm, contact = 'detected'] of samples) {
      const r = addSample(s, { bpm, contact, at: at(sec) });
      s = r.state;
      if (r.flush) saved.push(r.flush);
    }
    return { s, saved };
  }

  it('median helper', () => {
    expect(median([])).toBeNull();
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 3, 2])).toBe(2.5);
  });

  it('saves one median per minute when the next minute starts', () => {
    const { s, saved } = feed([
      [0, 70],
      [10, 90],
      [20, 72],
      [59, 71],
      [61, 80], // new minute → flush minute 0
    ]);
    expect(saved).toEqual([{ bpm: 72, time: at(59), samples: 4 }]);
    expect(s.values).toEqual([80]);
  });

  it('ignores 0, no-contact and out-of-range samples', () => {
    const { saved } = feed([
      [0, 0],
      [5, 25],
      [10, 230],
      [15, 66, 'not-detected'],
      [20, 64],
      [25, 66, 'unsupported'],
      [70, 70],
    ]);
    expect(saved).toEqual([{ bpm: 65, time: at(25), samples: 2 }]);
  });

  it('does not save a minute with no usable samples', () => {
    const { saved } = feed([
      [0, 0],
      [30, 15],
      [65, 70],
      [130, 71],
    ]);
    expect(saved.map((f) => f.bpm)).toEqual([70]);
  });

  it('never saves the same minute twice, even with late samples', () => {
    const { s, saved } = feed([
      [0, 60],
      [65, 61], // flush minute 0
      [30, 99], // late sample for minute 0 → dropped
      [125, 62], // flush minute 1
    ]);
    expect(saved.map((f) => f.bpm)).toEqual([60, 61]);
    expect(s.values).toEqual([62]);
  });

  it('flushIfDue completes a stale minute, and force-flushes a partial one only once', () => {
    let { s } = feed([
      [0, 70],
      [5, 74],
    ]);
    let r = flushIfDue(s, at(40));
    expect(r.flush).toBeNull();
    r = flushIfDue(s, at(75));
    expect(r.flush).toEqual({ bpm: 72, time: at(5), samples: 2 });
    s = r.state;
    expect(flushIfDue(s, at(200)).flush).toBeNull();

    // Partial minute on disconnect, then more samples in that same minute are ignored.
    ({ s } = feed([[0, 80]]));
    r = flushIfDue(s, at(10), true);
    expect(r.flush?.bpm).toBe(80);
    const again = addSample(r.state, { bpm: 90, contact: 'detected', at: at(20) });
    expect(again.state.values).toEqual([]);
    expect(flushIfDue(again.state, at(90), true).flush).toBeNull();
  });
});
