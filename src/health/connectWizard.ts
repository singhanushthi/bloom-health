/**
 * Guided "connect an app" wizards (Connect apps → app row → /connect/[appId]).
 *
 * Data-driven: hand-written wizards for the apps people ask about most (Noise has the richest
 * one, with a second "direct Bluetooth" path), and a generic wizard built from CONNECT_APPS for
 * every other app. Bloom can't see inside other apps, so their steps are ticked by the person;
 * "allow Health Connect" and "check it's working" tick themselves.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { CONNECT_APPS, matchOrigin, type ConnectApp } from './apps';
import { appName } from './sources';
import type { HcAvailability } from './client';
import type { ReadContext } from './context';
import { addDays, dayStart, todayKey, toDayKey } from './dates';
import { readAll } from './read';

/* --------------------------------- Model --------------------------------- */

export type WizardAction =
  /** Play Store search results (works whatever the exact package is). */
  | { kind: 'store-search'; query: string; label: string }
  /** Play Store page of a known package (shows "Open" when it's installed). */
  | { kind: 'store-app'; packageId: string; label: string }
  /** In-app route. */
  | { kind: 'route'; route: string; label: string };

export interface WizardStep {
  id: string;
  title: string;
  body?: string;
  /** Small print, e.g. "menus vary by version". */
  note?: string;
  action?: WizardAction;
  /** Steps Bloom can verify itself. Others are ticked by the person. */
  auto?: 'hc-access' | 'check';
}

export type CheckMetric = 'Steps' | 'Period';

export interface WizardCheck {
  metric: CheckMetric;
  /** CONNECT_APPS ids whose data counts as "working" (e.g. Noise data arrives as Google Fit). */
  apps: string[];
  /** Plain advice when nothing has arrived yet. */
  emptyHint: string;
}

export interface WizardPath {
  title: string;
  /** Short tag, e.g. "Recommended" / "Beta". */
  tag: string;
  /** What you get, e.g. "Steps, sleep, heart rate and SpO₂". */
  gets: string;
}

export interface AppWizard {
  appId: string;
  name: string;
  monogram: string;
  intro: string;
  /** Main path label (shown as a tab when there's an alternative path). */
  path?: WizardPath;
  steps: WizardStep[];
  check?: WizardCheck;
  /** Optional second path (Noise: direct Bluetooth, beta). */
  altPath?: WizardPath & { body: string; points: string[]; action: WizardAction };
}

const HC_STEP: WizardStep = {
  id: 'hc-access',
  title: 'In Bloom: allow Health Connect access',
  body: 'Tap the button and allow the data you want Bloom to read.',
  auto: 'hc-access',
};

function checkStep(body: string): WizardStep {
  return { id: 'check', title: 'Check it’s working', body, auto: 'check' };
}

export const WIZARDS: Record<string, AppWizard> = {
  noise: {
    appId: 'noise',
    name: 'Noise watch',
    monogram: 'N',
    intro: 'Your Noise watch talks to the NoiseFit app. NoiseFit sends data to Google Fit, Google Fit shares it with Health Connect, and Bloom reads it from there.',
    path: { title: 'Through NoiseFit', tag: 'Recommended', gets: 'Steps, sleep, heart rate and SpO₂' },
    steps: [
      {
        id: 'install',
        title: 'Install NoiseFit and pair your watch',
        body: 'Pair the watch in NoiseFit and let it sync once.',
        action: { kind: 'store-search', query: 'NoiseFit', label: 'Find NoiseFit' },
      },
      {
        id: 'noisefit-gfit',
        title: 'In NoiseFit: connect Google Fit',
        body: 'Profile → Connect apps (or Settings → Third-party) → Google Fit → Allow.',
        note: 'Menus vary a little between NoiseFit versions.',
        action: { kind: 'store-app', packageId: 'com.noisefit', label: 'Open NoiseFit' },
      },
      {
        id: 'gfit-hc',
        title: 'In Google Fit: turn on Health Connect',
        body: 'Profile → ⚙ Settings → Sync Fit with Health Connect → On.',
        note: 'Google Fit is moving to Google Health. Same idea there: Google Health → Settings → Health Connect → allow sharing.',
        action: { kind: 'store-search', query: 'Google Fit', label: 'Open Google Fit' },
      },
      HC_STEP,
      checkStep('Bloom looks for steps from the last 7 days.'),
    ],
    check: {
      metric: 'Steps',
      apps: ['noise', 'google-fit', 'google-health'],
      emptyHint: 'Nothing yet — open NoiseFit and sync your watch, then Google Fit, then tap Check again.',
    },
    altPath: {
      title: 'Direct Bluetooth',
      tag: 'Beta',
      gets: 'Heart rate only',
      body: 'Connect the watch straight to Bloom. No NoiseFit needed, but many Noise models don’t share heart rate this way.',
      points: [
        'Heart rate only. Steps, sleep and SpO₂ can’t be read over Bluetooth.',
        'Works only while Bloom is open.',
        'Close NoiseFit first. A watch usually allows one connection at a time.',
      ],
      action: { kind: 'route', route: '/watch', label: 'Try direct Bluetooth' },
    },
  },
  flo: {
    appId: 'flo',
    name: 'Flo',
    monogram: 'F',
    intro: 'Bloom already tracks your periods. Connect Flo only if you want to bring in your old period history.',
    steps: [
      {
        id: 'flo-share',
        title: 'In Flo: turn on Health Connect',
        body: 'Settings (or Profile) → Health Connect (or Apps & devices) → turn sharing on.',
        note: 'Menus vary a little between Flo versions.',
        action: { kind: 'store-app', packageId: 'org.iggymedia.periodtracker', label: 'Open Flo' },
      },
      { id: 'flo-allow', title: 'Allow Flo to share period data', body: 'When Health Connect asks, allow Menstruation.' },
      HC_STEP,
      checkStep('Bloom looks for period days from Flo.'),
    ],
    check: { metric: 'Period', apps: ['flo'], emptyHint: 'Nothing yet — open Flo once so it can sync, then tap Check again.' },
  },
  'google-fit': {
    appId: 'google-fit',
    name: 'Google Fit',
    monogram: 'GF',
    intro: 'Google Fit can share steps, sleep, heart rate and workouts with Health Connect.',
    steps: [
      {
        id: 'gfit-hc',
        title: 'In Google Fit: turn on Health Connect',
        body: 'Profile → ⚙ Settings → Sync Fit with Health Connect → On.',
        note: 'Google Fit is moving to Google Health. Same idea there: Google Health → Settings → Health Connect → allow sharing.',
        action: { kind: 'store-app', packageId: 'com.google.android.apps.fitness', label: 'Open Google Fit' },
      },
      HC_STEP,
      checkStep('Bloom looks for steps from the last 7 days.'),
    ],
    check: { metric: 'Steps', apps: ['google-fit', 'google-health'], emptyHint: 'Nothing yet — open Google Fit so it can sync, then tap Check again.' },
  },
  'google-health': {
    appId: 'google-health',
    name: 'Google Health',
    monogram: 'GH',
    intro: 'Google Health (the new name for the Fitbit app) can share your data with Health Connect.',
    steps: [
      {
        id: 'gh-hc',
        title: 'In Google Health: allow Health Connect',
        body: 'Tap your profile picture → Settings → Health Connect → allow sharing.',
        note: 'Menus vary a little between versions.',
        action: { kind: 'store-search', query: 'Google Health', label: 'Open Google Health' },
      },
      HC_STEP,
      checkStep('Bloom looks for steps from the last 7 days.'),
    ],
    check: { metric: 'Steps', apps: ['google-health', 'fitbit', 'google-fit'], emptyHint: 'Nothing yet — open Google Health so it can sync, then tap Check again.' },
  },
  'samsung-health': {
    appId: 'samsung-health',
    name: 'Samsung Health',
    monogram: 'S',
    intro: 'Samsung Health can share steps, sleep, heart rate and more with Health Connect.',
    steps: [
      {
        id: 'sh-hc',
        title: 'In Samsung Health: allow Health Connect',
        body: 'Tap ⋮ (menu) → Settings → Health Connect → allow what you want to share.',
        action: { kind: 'store-app', packageId: 'com.sec.android.app.shealth', label: 'Open Samsung Health' },
      },
      HC_STEP,
      checkStep('Bloom looks for steps from the last 7 days.'),
    ],
    check: { metric: 'Steps', apps: ['samsung-health'], emptyHint: 'Nothing yet — open Samsung Health so it can sync, then tap Check again.' },
  },
};

/** Apps shown first in the list, in this order. */
export const FEATURED_APP_IDS = ['noise', 'flo', 'google-fit', 'google-health', 'samsung-health'];

/** Wizard for any app id in CONNECT_APPS (hand-written if there is one, generic otherwise). */
export function wizardFor(appId: string, apps: ConnectApp[] = CONNECT_APPS): AppWizard | null {
  if (WIZARDS[appId]) return WIZARDS[appId];
  const a = apps.find((x) => x.id === appId);
  if (!a) return null;
  if (a.route === 'not-android') {
    return { appId: a.id, name: a.name, monogram: a.monogram, intro: a.steps.join(' '), steps: [] };
  }
  const steps: WizardStep[] = a.steps.map((s, i) => ({
    id: `s${i + 1}`,
    title: s,
    action: i === 0 && a.storeQuery ? { kind: 'store-search', query: a.storeQuery, label: `Find ${a.name}` } : undefined,
  }));
  return {
    appId: a.id,
    name: a.name,
    monogram: a.monogram,
    intro: a.note ? `${a.note}.` : `${a.name} can share data with Bloom through Health Connect.`,
    steps: [...steps, HC_STEP, checkStep('Bloom looks for steps from the last 7 days.')],
    check: { metric: 'Steps', apps: [a.id], emptyHint: `Nothing yet — open ${a.name} so it can sync, then tap Check again.` },
  };
}

/* ------------------------------ Tick logic ------------------------------- */

export type Ticks = Record<string, Record<string, boolean>>;
export const WIZARD_TICKS_KEY = 'bloom.connect.ticks.v1';

export interface AutoState {
  hcGranted: boolean;
  checkFound: boolean;
}

export function isStepDone(step: WizardStep, ticks: Record<string, boolean> | undefined, auto: AutoState): boolean {
  if (step.auto === 'hc-access') return auto.hcGranted;
  if (step.auto === 'check') return auto.checkFound || !!ticks?.[step.id];
  return !!ticks?.[step.id];
}

/** Index of the first step that isn't done (steps.length when all are). */
export function currentStepIndex(w: AppWizard, ticks: Record<string, boolean> | undefined, auto: AutoState): number {
  const i = w.steps.findIndex((s) => !isStepDone(s, ticks, auto));
  return i < 0 ? w.steps.length : i;
}

export function toggleTick(all: Ticks, appId: string, stepId: string): Ticks {
  const mine = { ...(all[appId] ?? {}) };
  mine[stepId] = !mine[stepId];
  return { ...all, [appId]: mine };
}

export async function loadTicks(): Promise<Ticks> {
  try {
    const raw = await AsyncStorage.getItem(WIZARD_TICKS_KEY);
    const v = raw ? (JSON.parse(raw) as unknown) : null;
    return v && typeof v === 'object' ? (v as Ticks) : {};
  } catch {
    return {};
  }
}

export async function saveTicks(t: Ticks): Promise<void> {
  try {
    await AsyncStorage.setItem(WIZARD_TICKS_KEY, JSON.stringify(t));
  } catch {
    // ticks are a convenience; losing them is harmless
  }
}

/* --------------------------- "Check it's working" ------------------------- */

export interface CheckRecord {
  origin: string;
  /** ISO time the record ended (or its instant). */
  time: string;
  /** Steps count, or 1 per period record. */
  value: number;
}

export interface CheckResult {
  found: boolean;
  message: string;
}

const fmt = (n: number) => Math.round(n).toLocaleString('en-IN');

/** Pure: did any of the wizard's apps send data in the last 7 days? */
export function summarizeCheck(records: CheckRecord[], check: WizardCheck, now: Date = new Date()): CheckResult {
  const wanted = new Set(check.apps);
  const mine = records.filter((r) => r.value > 0 && matchOrigin(r.origin).some((id) => wanted.has(id)));
  if (!mine.length) return { found: false, message: check.emptyHint };

  // Name the app that sent the most.
  const byOrigin = new Map<string, number>();
  for (const r of mine) byOrigin.set(r.origin, (byOrigin.get(r.origin) ?? 0) + r.value);
  const top = [...byOrigin.entries()].sort((a, b) => b[1] - a[1])[0][0];
  const from = appName(top);

  if (check.metric === 'Period') {
    const days = new Set(mine.map((r) => toDayKey(r.time))).size;
    return { found: true, message: `Found ${days} period day${days === 1 ? '' : 's'} from ${from} ✓` };
  }
  const yesterday = addDays(todayKey(now), -1);
  const ySteps = mine.filter((r) => toDayKey(r.time) === yesterday).reduce((s, r) => s + r.value, 0);
  if (ySteps > 0) return { found: true, message: `Found ${fmt(ySteps)} steps from ${from} yesterday ✓` };
  const total = mine.reduce((s, r) => s + r.value, 0);
  return { found: true, message: `Found ${fmt(total)} steps from ${from} in the last 7 days ✓` };
}

/** Reads the last 7 days from Health Connect and summarizes. Never throws. */
export async function runCheck(ctx: ReadContext, check: WizardCheck, now: Date = new Date()): Promise<CheckResult> {
  if (ctx.mode === 'demo') return { found: false, message: 'Demo mode is on. Turn it off in Settings → Data & privacy to check your real apps.' };
  if (ctx.availability !== 'available') return { found: false, message: 'Health Connect isn’t ready yet. Finish the Health Connect step first.' };
  const start = dayStart(addDays(todayKey(now), -7));
  try {
    let records: CheckRecord[] = [];
    if (check.metric === 'Steps') {
      if (!ctx.granted.has('Steps')) return { found: false, message: 'Allow Steps in Health Connect first (the step above).' };
      const recs = await readAll('Steps', start, now, { pageSize: 1000, maxPages: 5 });
      records = recs.map((r) => ({ origin: r.metadata?.dataOrigin ?? '', time: r.endTime, value: r.count }));
    } else {
      if (!ctx.granted.has('MenstruationPeriod') && !ctx.granted.has('MenstruationFlow'))
        return { found: false, message: 'Allow Menstruation in Health Connect first (the step above).' };
      const since = dayStart(addDays(todayKey(now), -365));
      const flows = ctx.granted.has('MenstruationFlow') ? await readAll('MenstruationFlow', since, now, { maxPages: 3 }).catch(() => []) : [];
      const periods = ctx.granted.has('MenstruationPeriod') ? await readAll('MenstruationPeriod', since, now, { maxPages: 3 }).catch(() => []) : [];
      records = [
        ...flows.map((r) => ({ origin: r.metadata?.dataOrigin ?? '', time: r.time, value: 1 })),
        ...periods.map((r) => {
          const x = r as unknown as { time?: string; startTime?: string; metadata?: { dataOrigin?: string } };
          return { origin: x.metadata?.dataOrigin ?? '', time: x.startTime ?? x.time ?? now.toISOString(), value: 1 };
        }),
      ];
    }
    return summarizeCheck(records, check, now);
  } catch {
    return { found: false, message: 'Couldn’t read Health Connect just now. Please try again.' };
  }
}

/* ---------------------------- Health Connect hero ------------------------- */

export type HeroKind = 'checking' | 'install' | 'update' | 'allow' | 'connected';

export interface HeroState {
  kind: HeroKind;
  title: string;
  body: string;
  /** The ONE primary action for this state (null while checking). */
  action: string | null;
}

/** Pure: what the Health Connect status card says and which single action it offers. */
export function heroState(availability: HcAvailability | 'checking', grantedCount: number, totalTypes: number): HeroState {
  if (availability === 'checking') return { kind: 'checking', title: 'Checking Health Connect…', body: 'One moment.', action: null };
  if (availability === 'unavailable' || availability === 'unsupported')
    return {
      kind: 'install',
      title: 'Health Connect isn’t on this phone yet',
      body: 'It’s a free app from Google that lets your health apps share data. Android 14 and newer already have it.',
      action: 'Install Health Connect',
    };
  if (availability === 'update-required')
    return { kind: 'update', title: 'Health Connect needs an update', body: 'Your Health Connect needs an update. Update it, then come back here.', action: 'Update Health Connect' };
  if (grantedCount === 0)
    return {
      kind: 'allow',
      title: 'Allow Bloom to read your data',
      body: 'Health Connect is ready. Allow access so Bloom can see steps, sleep and more from your other apps.',
      action: 'Allow access',
    };
  return {
    kind: 'connected',
    title: 'Health Connect is connected ✓',
    body: `Bloom can read ${grantedCount} of ${totalTypes} kinds of data.`,
    action: 'Manage access',
  };
}
