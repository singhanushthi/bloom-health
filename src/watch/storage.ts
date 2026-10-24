/**
 * Remembers the watch Bloom last connected to, plus the last reading it saved.
 * Not sensitive (a Bluetooth address and a name), so it lives in the on-device kv table.
 */
import { kv } from '../db/repos';

export interface RememberedWatch {
  id: string;
  name: string;
  savedAt: string;
}

export interface LastSaved {
  bpm: number;
  time: string;
}

export const WATCH_KV = {
  device: 'watch.device.v1',
  lastSaved: 'watch.lastSaved.v1',
} as const;

/** How readings saved from a direct watch connection should be labelled. */
export const WATCH_SOURCE = 'bloom:watch';
export const WATCH_SOURCE_LABEL = 'Watch (direct)';

export async function loadRememberedWatch(): Promise<RememberedWatch | null> {
  try {
    const v = await kv.get<RememberedWatch>(WATCH_KV.device);
    return v && typeof v.id === 'string' && v.id ? v : null;
  } catch {
    return null;
  }
}

export async function rememberWatch(w: { id: string; name: string }): Promise<void> {
  try {
    await kv.set(WATCH_KV.device, { id: w.id, name: w.name, savedAt: new Date().toISOString() });
  } catch {
    // non-fatal
  }
}

export async function forgetWatch(): Promise<void> {
  try {
    await kv.remove(WATCH_KV.device);
    await kv.remove(WATCH_KV.lastSaved);
  } catch {
    // non-fatal
  }
}

export async function loadLastSaved(): Promise<LastSaved | null> {
  try {
    return await kv.get<LastSaved>(WATCH_KV.lastSaved);
  } catch {
    return null;
  }
}

export async function storeLastSaved(v: LastSaved): Promise<void> {
  try {
    await kv.set(WATCH_KV.lastSaved, v);
  } catch {
    // non-fatal
  }
}
