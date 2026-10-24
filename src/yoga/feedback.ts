/**
 * Optional session feedback: soft haptic "chime", spoken cues and keep-screen-awake.
 * Native modules are required lazily and every call is guarded, so a missing module
 * (tests, older dev client) just means no feedback — never a crash.
 */
/* eslint-disable @typescript-eslint/no-require-imports */

type HapticsMod = typeof import('expo-haptics');
type SpeechMod = typeof import('expo-speech');
type KeepAwakeMod = typeof import('expo-keep-awake');

function load<T>(fn: () => T): T | null {
  try {
    return fn();
  } catch {
    return null;
  }
}

let haptics: HapticsMod | null | undefined;
let speech: SpeechMod | null | undefined;
let keepAwake: KeepAwakeMod | null | undefined;

const H = () => (haptics === undefined ? (haptics = load(() => require('expo-haptics') as HapticsMod)) : haptics);
const S = () => (speech === undefined ? (speech = load(() => require('expo-speech') as SpeechMod)) : speech);
const K = () =>
  keepAwake === undefined ? (keepAwake = load(() => require('expo-keep-awake') as KeepAwakeMod)) : keepAwake;

/** Gentle tap at pose changes. */
export function softChime(): void {
  const m = H();
  m?.impactAsync(m.ImpactFeedbackStyle.Soft).catch(() => {});
}

/** Slightly stronger pattern at the end of a session. */
export function doneChime(): void {
  const m = H();
  m?.notificationAsync(m.NotificationFeedbackType.Success).catch(() => {});
}

export function say(text: string): void {
  const m = S();
  if (!m) return;
  try {
    m.stop().catch(() => {});
    m.speak(text, { rate: 0.95, pitch: 1.0 });
  } catch {
    // ignore
  }
}

export function stopSpeaking(): void {
  S()
    ?.stop()
    .catch(() => {});
}

const TAG = 'bloom-yoga-session';
export function keepScreenOn(on: boolean): void {
  const m = K();
  if (!m) return;
  try {
    if (on) m.activateKeepAwakeAsync(TAG).catch(() => {});
    else m.deactivateKeepAwake(TAG).catch(() => {});
  } catch {
    // ignore
  }
}
