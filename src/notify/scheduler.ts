/**
 * Local notifications for cycle reminders (expo-notifications; nothing leaves the phone).
 *
 *  - Android channel "cycle" (created before any permission prompt, as Android 13+ requires).
 *  - POST_NOTIFICATIONS is requested only when the user turns a reminder on
 *    (requestReminderPermission), never on launch.
 *  - applyReminderPlan() is idempotent: cancel every scheduled id with REMINDER_PREFIX, then
 *    schedule the plan.
 * expo-notifications is required lazily so importing this file never needs the native module.
 */
import { Platform } from 'react-native';
import { CYCLE_CHANNEL_ID, REMINDER_PREFIX, type PlannedReminder } from './plan';

type N = typeof import('expo-notifications');

let mod: N | null | undefined;
function notifications(): N | null {
  if (mod !== undefined) return mod;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    mod = require('expo-notifications') as N;
  } catch {
    mod = null;
  }
  return mod;
}

/** For tests: inject a fake module (pass undefined to reset to lazy require). */
export function __setNotificationsModule(m: N | null | undefined): void {
  mod = m;
  handlerSet = false;
  channelReady = false;
}

let handlerSet = false;
let channelReady = false;

function ensureHandler(n: N) {
  if (handlerSet) return;
  handlerSet = true;
  try {
    n.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: false,
        shouldSetBadge: false,
      }),
    });
  } catch {
    // older runtime — notifications still show when the app is in the background
  }
}

export async function ensureCycleChannel(discreet = true): Promise<void> {
  const n = notifications();
  if (!n || Platform.OS !== 'android' || channelReady) return;
  await n.setNotificationChannelAsync(CYCLE_CHANNEL_ID, {
    name: 'Cycle reminders',
    description: 'Period, fertile window, daily log and pill reminders from Bloom.',
    importance: n.AndroidImportance.DEFAULT,
    // Discreet: hide the content on the lock screen.
    lockscreenVisibility: discreet
      ? n.AndroidNotificationVisibility.PRIVATE
      : n.AndroidNotificationVisibility.PUBLIC,
    showBadge: false,
  });
  channelReady = true;
}

export type PermissionState = 'granted' | 'denied' | 'undetermined' | 'unavailable';

export async function getReminderPermission(): Promise<PermissionState> {
  const n = notifications();
  if (!n) return 'unavailable';
  try {
    const p = await n.getPermissionsAsync();
    if (p.granted) return 'granted';
    return p.canAskAgain === false || p.status === 'denied' ? 'denied' : 'undetermined';
  } catch {
    return 'unavailable';
  }
}

/** Ask for notification permission (Android 13+ shows the system prompt). Call only from a toggle. */
export async function requestReminderPermission(discreet = true): Promise<PermissionState> {
  const n = notifications();
  if (!n) return 'unavailable';
  try {
    await ensureCycleChannel(discreet);
    const cur = await n.getPermissionsAsync();
    if (cur.granted) return 'granted';
    if (cur.canAskAgain === false) return 'denied';
    const p = await n.requestPermissionsAsync();
    return p.granted ? 'granted' : 'denied';
  } catch {
    return 'unavailable';
  }
}

export async function cancelCycleReminders(): Promise<number> {
  const n = notifications();
  if (!n) return 0;
  const all = await n.getAllScheduledNotificationsAsync();
  const mine = all.filter((x) => x.identifier.startsWith(REMINDER_PREFIX));
  for (const x of mine) await n.cancelScheduledNotificationAsync(x.identifier);
  return mine.length;
}

export interface ApplyResult {
  scheduled: string[];
  cancelled: number;
  skipped: 'no-module' | 'no-permission' | null;
}

/** Cancel all cycle reminders, then schedule `plan` (only when permission is granted). */
export async function applyReminderPlan(plan: PlannedReminder[], opts: { discreet: boolean }): Promise<ApplyResult> {
  const n = notifications();
  if (!n) return { scheduled: [], cancelled: 0, skipped: 'no-module' };
  ensureHandler(n);
  const cancelled = await cancelCycleReminders();
  if (!plan.length) return { scheduled: [], cancelled, skipped: null };
  const perm = await n.getPermissionsAsync();
  if (!perm.granted) return { scheduled: [], cancelled, skipped: 'no-permission' };
  await ensureCycleChannel(opts.discreet);
  const scheduled: string[] = [];
  for (const p of plan) {
    const trigger = p.repeat
      ? { type: n.SchedulableTriggerInputTypes.DAILY, hour: p.repeat.hour, minute: p.repeat.minute, channelId: CYCLE_CHANNEL_ID }
      : { type: n.SchedulableTriggerInputTypes.DATE, date: p.date, channelId: CYCLE_CHANNEL_ID };
    await n.scheduleNotificationAsync({
      identifier: p.id,
      content: { title: p.title, body: p.body, data: { kind: p.kind, url: '/cycle' } },
      trigger: trigger as Parameters<N['scheduleNotificationAsync']>[0]['trigger'],
    });
    scheduled.push(p.id);
  }
  return { scheduled, cancelled, skipped: null };
}
