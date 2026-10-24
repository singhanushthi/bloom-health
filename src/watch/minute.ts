/**
 * Pure "at most one saved reading per minute" logic for live watch heart rate.
 * Samples are grouped by clock minute; when a minute is complete, its median is saved once.
 * Unusable samples (0, no skin contact, < 30, > 220) are ignored.
 */
import { isUsableReading, type SensorContact } from './parse';

export const MINUTE_MS = 60_000;

export interface MinuteState {
  /** Start (ms epoch) of the minute currently collecting samples, or null. */
  minuteStart: number | null;
  values: number[];
  /** Time (ms) of the last usable sample in the current minute. */
  lastAt: number | null;
  /** Start of the last minute that was emitted for saving (never emit twice). */
  lastSavedMinute: number | null;
}

export interface MinuteFlush {
  /** Median BPM of the minute, rounded. */
  bpm: number;
  /** When to stamp the reading: the last usable sample in that minute. */
  time: Date;
  /** Number of samples the median came from. */
  samples: number;
}

export const emptyMinuteState = (): MinuteState => ({ minuteStart: null, values: [], lastAt: null, lastSavedMinute: null });

export const minuteStartOf = (ms: number) => Math.floor(ms / MINUTE_MS) * MINUTE_MS;

export function median(values: number[]): number | null {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

function emit(state: MinuteState): { state: MinuteState; flush: MinuteFlush | null } {
  const m = median(state.values);
  const already = state.minuteStart !== null && state.lastSavedMinute !== null && state.minuteStart <= state.lastSavedMinute;
  if (m === null || state.minuteStart === null || state.lastAt === null || already) {
    return { state: { ...state, minuteStart: null, values: [], lastAt: null }, flush: null };
  }
  return {
    state: { minuteStart: null, values: [], lastAt: null, lastSavedMinute: state.minuteStart },
    flush: { bpm: Math.round(m), time: new Date(state.lastAt), samples: state.values.length },
  };
}

/**
 * Adds a sample. If it belongs to a later minute than the one being collected, the
 * previous minute is completed and returned as `flush` (to be saved).
 */
export function addSample(
  state: MinuteState,
  sample: { bpm: number; contact: SensorContact; at: Date }
): { state: MinuteState; flush: MinuteFlush | null } {
  const at = sample.at.getTime();
  const minute = minuteStartOf(at);
  let next = state;
  let flush: MinuteFlush | null = null;
  if (state.minuteStart !== null && minute > state.minuteStart) {
    const r = emit(state);
    next = r.state;
    flush = r.flush;
  }
  // Late samples for an older (already completed) minute are dropped.
  if (next.minuteStart !== null && minute < next.minuteStart) return { state: next, flush };
  if (next.lastSavedMinute !== null && minute <= next.lastSavedMinute) return { state: next, flush };
  if (!isUsableReading(sample)) return { state: next, flush };
  return {
    state: {
      ...next,
      minuteStart: minute,
      values: [...(next.minuteStart === minute ? next.values : []), sample.bpm],
      lastAt: at,
    },
    flush,
  };
}

/**
 * Completes the current minute when the clock has moved past it (e.g. the watch stopped
 * sending) or when `force` is set (disconnecting).
 */
export function flushIfDue(state: MinuteState, now: Date, force = false): { state: MinuteState; flush: MinuteFlush | null } {
  if (state.minuteStart === null) return { state, flush: null };
  if (!force && minuteStartOf(now.getTime()) <= state.minuteStart) return { state, flush: null };
  return emit(state);
}
