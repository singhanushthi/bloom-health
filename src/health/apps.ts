/**
 * "Connect your apps": which third-party apps can share data with Bloom, and whether
 * we've actually seen data from them.
 *
 * Bloom never talks to these apps. Everything flows through Health Connect, and the only
 * signal we have is each record's `metadata.dataOrigin` (the writing app's package name).
 *
 * Package names listed in `packages` were checked against public app listings
 * (Play Store mirrors / app-analytics pages). Where no package could be verified, the app
 * is matched by a name token instead (see `tokens`) — we never guess an exact id.
 */
import { MOCK_SOURCES } from '../data/mock';
import { hc, HEALTH_CONNECT_PACKAGE } from './client';
import type { ReadContext } from './context';
import { getSources, isPhoneOrigin } from './sources';
import { LOCAL_SOURCE, type MetricId, type SourcesByMetric } from './types';

export type ShareChip =
  | 'Steps'
  | 'Sleep'
  | 'Heart rate'
  | 'SpO₂'
  | 'Period'
  | 'Workouts'
  | 'Calories'
  | 'Distance'
  | 'Weight'
  | 'Nutrition';

/** How an app reaches Bloom. */
export type ConnectRoute =
  /** Writes to Health Connect itself. */
  | 'direct'
  /** Goes through another app (e.g. NoiseFit → Google Fit / Google Health → Health Connect). */
  | 'via'
  /** No Health Connect support — Bloom can't read it directly. */
  | 'no-health-connect'
  /** Not available on Android at all. */
  | 'not-android';

export interface ConnectApp {
  id: string;
  name: string;
  /** One or two letters for the monogram circle (we never show brand logos). */
  monogram: string;
  shares: ShareChip[];
  route: ConnectRoute;
  /** Short line under the name. */
  note?: string;
  /** Exact, verified package names. */
  packages: string[];
  /** Lower-case tokens matched against package-name segments when no exact id is known. */
  tokens?: string[];
  /** 2–4 short steps. */
  steps: string[];
  /** Search term for the Play Store; null when there's nothing to install on Android. */
  storeQuery: string | null;
  /**
   * Optional "connect the watch straight to Bloom over Bluetooth" route, shown as Option 1
   * in "How to connect" (the `steps` above then become Option 2).
   */
  directOption?: { title: string; body: string; route: '/watch' };
}

export const CONNECT_APPS: ConnectApp[] = [
  {
    id: 'noise',
    name: 'Noise watch',
    monogram: 'N',
    shares: ['Steps', 'Sleep', 'Heart rate', 'SpO₂'],
    route: 'via',
    note: 'NoiseFit → Google Fit or Google Health → Health Connect',
    packages: ['com.noisefit'],
    tokens: ['noisefit', 'noise'],
    steps: [
      'Open NoiseFit and make sure your watch is synced.',
      'In NoiseFit, go to Profile and connect Google Fit (or Google Health if offered).',
      'In Google Fit or Google Health, turn on syncing with Health Connect.',
      'Come back to Bloom — new data shows up after the next sync.',
    ],
    storeQuery: 'NoiseFit',
    directOption: {
      title: 'Connect the watch directly (if supported)',
      body: 'Heart rate only, no NoiseFit needed — works if your watch shares heart rate over standard Bluetooth. Many Noise models don’t.',
      route: '/watch',
    },
  },
  {
    id: 'flo',
    name: 'Flo',
    monogram: 'F',
    shares: ['Period'],
    route: 'direct',
    packages: ['org.iggymedia.periodtracker'],
    steps: [
      'Open Flo and go to Settings.',
      'Find Health Connect (or “Apps & devices”) and turn sharing on.',
      'Allow Flo to write menstruation data.',
    ],
    storeQuery: 'Flo period tracker',
  },
  {
    id: 'google-fit',
    name: 'Google Fit',
    monogram: 'GF',
    shares: ['Steps', 'Distance', 'Sleep', 'Heart rate', 'Workouts', 'Calories'],
    route: 'direct',
    note: 'Being replaced by Google Health',
    packages: ['com.google.android.apps.fitness'],
    steps: [
      'Open Google Fit and tap Profile.',
      'Open Settings (the gear).',
      'Turn on “Sync Fit with Health Connect”.',
    ],
    storeQuery: 'Google Fit',
  },
  {
    id: 'google-health',
    name: 'Google Health',
    monogram: 'GH',
    shares: ['Steps', 'Sleep', 'Heart rate', 'SpO₂', 'Workouts', 'Weight'],
    route: 'direct',
    note: 'The renamed Fitbit app — syncs with Health Connect',
    packages: ['com.fitbit.FitbitMobile'],
    steps: [
      'Open Google Health and tap your profile picture.',
      'Open settings and find Health Connect.',
      'Turn syncing on and choose what to share.',
    ],
    storeQuery: 'Google Health',
  },
  {
    id: 'samsung-health',
    name: 'Samsung Health',
    monogram: 'S',
    shares: ['Steps', 'Sleep', 'Heart rate', 'SpO₂', 'Workouts', 'Weight'],
    route: 'direct',
    packages: ['com.sec.android.app.shealth'],
    steps: [
      'Open Samsung Health and tap the menu (three dots).',
      'Go to Settings → Health Connect.',
      'Allow Samsung Health to share the data you want in Bloom.',
    ],
    storeQuery: 'Samsung Health',
  },
  {
    id: 'fitbit',
    name: 'Fitbit devices',
    monogram: 'Fb',
    shares: ['Steps', 'Sleep', 'Heart rate', 'SpO₂'],
    route: 'via',
    note: 'Through the Google Health app',
    packages: ['com.fitbit.FitbitMobile'],
    steps: [
      'Pair your Fitbit with the Google Health app.',
      'In Google Health, turn on Health Connect syncing.',
      'Bloom picks it up after the next sync.',
    ],
    storeQuery: 'Google Health Fitbit',
  },
  {
    id: 'healthifyme',
    name: 'HealthifyMe',
    monogram: 'H',
    shares: ['Steps', 'Nutrition', 'Weight', 'Workouts'],
    route: 'direct',
    note: 'If the app supports Health Connect on your phone',
    packages: ['com.healthifyme.basic'],
    tokens: ['healthifyme'],
    steps: [
      'Open HealthifyMe and go to Settings or “Connected apps”.',
      'Look for Health Connect and turn it on.',
      'If you don’t see it, your version may not support Health Connect yet.',
    ],
    storeQuery: 'HealthifyMe',
  },
  {
    id: 'myfitnesspal',
    name: 'MyFitnessPal',
    monogram: 'M',
    shares: ['Nutrition', 'Weight', 'Workouts', 'Steps'],
    route: 'direct',
    packages: ['com.myfitnesspal.android'],
    steps: [
      'Open MyFitnessPal and go to More → Apps & devices.',
      'Choose Health Connect and connect.',
      'Pick what to share.',
    ],
    storeQuery: 'MyFitnessPal',
  },
  {
    id: 'strava',
    name: 'Strava',
    monogram: 'St',
    shares: ['Workouts', 'Distance', 'Heart rate', 'Calories'],
    route: 'direct',
    packages: ['com.strava'],
    steps: [
      'Open Strava → You → Settings.',
      'Go to Applications, services and devices → Health Connect.',
      'Turn sharing on.',
    ],
    storeQuery: 'Strava',
  },
  {
    id: 'mi-zepp',
    name: 'Mi Fitness / Zepp',
    monogram: 'Mi',
    shares: ['Steps', 'Sleep', 'Heart rate', 'SpO₂'],
    route: 'direct',
    note: 'Xiaomi and Amazfit watches',
    packages: ['com.mi.health', 'com.huami.watch.hmwatchmanager'],
    tokens: ['huami', 'zepp'],
    steps: [
      'Open Mi Fitness or Zepp and go to Profile.',
      'Find Health Connect under third-party or connected apps.',
      'Turn sharing on.',
    ],
    storeQuery: 'Mi Fitness Zepp',
  },
  {
    id: 'boat-fireboltt',
    name: 'boAt / Fire-Boltt watches',
    monogram: 'B',
    shares: ['Steps', 'Sleep', 'Heart rate'],
    route: 'via',
    note: 'Through their app, if the app supports Health Connect',
    packages: [],
    tokens: ['boat', 'fireboltt', 'firebolt'],
    steps: [
      'Open your watch’s companion app.',
      'Look for Google Fit or Health Connect in its settings.',
      'If it links to Google Fit, also turn on Google Fit → Health Connect sync.',
      'No option there? Then the app doesn’t share with Health Connect yet.',
    ],
    storeQuery: 'boAt Fire-Boltt watch app',
  },
  {
    id: 'huawei',
    name: 'Huawei Health',
    monogram: 'Hw',
    shares: ['Steps', 'Sleep', 'Heart rate'],
    route: 'no-health-connect',
    note: 'No direct Health Connect support — Bloom can’t read it directly',
    packages: [],
    tokens: ['huawei'],
    steps: [
      'Huawei Health doesn’t share with Health Connect on its own.',
      'Some people use a third-party bridge app to copy data into Health Connect.',
      'If you set one up, Bloom will see the data the bridge writes.',
    ],
    storeQuery: 'Huawei Health Health Connect sync',
  },
  {
    id: 'apple-health',
    name: 'Apple Health',
    monogram: 'A',
    shares: ['Steps', 'Sleep', 'Heart rate'],
    route: 'not-android',
    note: 'iPhone only — not available on Android',
    packages: [],
    steps: ['Apple Health lives only on iPhone, so Bloom on Android can’t read it.'],
    storeQuery: null,
  },
];

/** Health Connect's own Play Store id (also used by the library). */
export const HEALTH_CONNECT_ID = HEALTH_CONNECT_PACKAGE;
export const BLOOM_PACKAGE = 'com.bloomhealth.app';

export function playStoreSearchUrl(query: string): string {
  return `https://play.google.com/store/search?q=${encodeURIComponent(query)}&c=apps`;
}

/** Origins that are the phone, Health Connect itself, Bloom, or Bloom's local pseudo-origins. */
export function isSystemOrigin(pkg: string): boolean {
  if (!pkg) return true;
  if (isPhoneOrigin(pkg)) return true;
  if (pkg === HEALTH_CONNECT_PACKAGE || pkg === BLOOM_PACKAGE) return true;
  return (Object.values(LOCAL_SOURCE) as string[]).includes(pkg) || pkg.startsWith('bloom:');
}

const segments = (pkg: string) => pkg.toLowerCase().split(/[._]/).filter(Boolean);

/** All app cards a data origin belongs to (one package can feed two cards, e.g. Fitbit). */
export function matchOrigin(pkg: string, apps: ConnectApp[] = CONNECT_APPS): string[] {
  if (isSystemOrigin(pkg)) return [];
  const exact = apps.filter((a) => a.packages.includes(pkg)).map((a) => a.id);
  if (exact.length) return exact;
  const segs = segments(pkg);
  const lower = pkg.toLowerCase();
  return apps
    .filter((a) =>
      (a.tokens ?? []).some((t) => segs.some((s) => s === t || s.startsWith(t)) || lower.includes(`.${t}`))
    )
    .map((a) => a.id);
}

export type AppStatus = 'sharing' | 'not-connected' | 'no-health-connect' | 'not-android';

export interface AppStatusInfo {
  status: AppStatus;
  /** Package names seen for this app in the last 30 days. */
  origins: string[];
  /** Which data types they wrote. */
  metrics: MetricId[];
}

export interface ConnectStatus {
  byApp: Record<string, AppStatusInfo>;
  /** Origins that aren't the phone/Bloom and don't match any card. */
  others: { pkg: string; name: string; metrics: MetricId[] }[];
}

/** Pure: turn "which app wrote which metric" into a status per card + leftovers. */
export function computeStatuses(sources: SourcesByMetric, apps: ConnectApp[] = CONNECT_APPS): ConnectStatus {
  const metricsByOrigin = new Map<string, Set<MetricId>>();
  for (const [metric, origins] of Object.entries(sources) as [MetricId, string[] | undefined][]) {
    for (const o of origins ?? []) {
      if (!o) continue;
      if (!metricsByOrigin.has(o)) metricsByOrigin.set(o, new Set());
      metricsByOrigin.get(o)!.add(metric);
    }
  }
  const byApp: Record<string, AppStatusInfo> = {};
  for (const a of apps) {
    byApp[a.id] = {
      status: a.route === 'not-android' ? 'not-android' : a.route === 'no-health-connect' ? 'no-health-connect' : 'not-connected',
      origins: [],
      metrics: [],
    };
  }
  const others: ConnectStatus['others'] = [];
  for (const [pkg, metrics] of metricsByOrigin) {
    if (isSystemOrigin(pkg)) continue;
    const ids = matchOrigin(pkg, apps);
    if (!ids.length) {
      others.push({ pkg, name: prettifyPackage(pkg), metrics: Array.from(metrics) });
      continue;
    }
    for (const id of ids) {
      const info = byApp[id];
      // Data seen means it's flowing — even for a "no direct support" app (via a bridge).
      if (info.status !== 'not-android') info.status = 'sharing';
      info.origins.push(pkg);
      info.metrics = Array.from(new Set([...info.metrics, ...metrics]));
    }
  }
  others.sort((a, b) => a.name.localeCompare(b.name));
  return { byApp, others };
}

const NOISE_SEGMENTS = new Set([
  'com',
  'org',
  'net',
  'io',
  'co',
  'in',
  'app',
  'apps',
  'android',
  'mobile',
  'client',
  'main',
  'release',
  'prod',
]);

/** "com.example.my_step_app" → "My Step App". Falls back to the raw id. */
export function prettifyPackage(pkg: string): string {
  const segs = pkg.split('.').filter((s) => s && !NOISE_SEGMENTS.has(s.toLowerCase()));
  if (!segs.length) return pkg;
  // The last segment is usually the product; prefer the one before it when it's generic.
  const pick = segs.length > 1 && /^(fitness|health|tracker|watch)$/i.test(segs[segs.length - 1])
    ? `${segs[segs.length - 2]} ${segs[segs.length - 1]}`
    : segs[segs.length - 1];
  const words = pick
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .split(/[\s_-]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());
  return words.length ? words.join(' ') : pkg;
}

/** Last-30-day data origins per metric (demo mode returns sample origins). */
export async function readRecentSources(ctx: ReadContext): Promise<SourcesByMetric> {
  if (ctx.mode === 'demo') return MOCK_SOURCES;
  const r = await getSources(ctx);
  return r.data ?? {};
}

/** Opens Health Connect's data & access screen (falls back to its settings). */
export function openHealthConnectData(): void {
  const m = hc();
  try {
    if (m?.openHealthConnectDataManagement) m.openHealthConnectDataManagement();
    else m?.openHealthConnectSettings();
  } catch {
    try {
      m?.openHealthConnectSettings();
    } catch {
      // ignore — the screen also explains where Health Connect lives
    }
  }
}
