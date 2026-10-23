/**
 * Realistic, deterministic demo data. Seeded by calendar day so values are stable
 * across refreshes but vary naturally day to day.
 *
 * Every reader in src/health/ switches to these generators in demo mode, so the
 * whole UI can be previewed without a phone, a watch or Health Connect.
 */
import { addDays, dayStart, lastNDays, todayKey, type DayKey } from '../health/dates';
import type {
  ActivityToday,
  CycleData,
  HeartToday,
  SleepNight,
  SourcesByMetric,
  Spo2Latest,
} from '../health/types';

export const MOCK_PACKAGES = {
  flo: 'org.iggymedia.periodtracker',
  googleFit: 'com.google.android.apps.fitness',
  noiseFit: 'com.noisefit',
} as const;

/** Small deterministic PRNG (mulberry32) seeded from a string. */
function rng(seed: string) {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  let a = h >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const between = (r: () => number, min: number, max: number) => min + r() * (max - min);

export function mockStepsForDay(day: DayKey, now = new Date()): number {
  const r = rng(`steps-${day}`);
  const weekday = dayStart(day).getDay();
  const weekendBoost = weekday === 0 || weekday === 6 ? 1.15 : 1;
  const full = Math.round(between(r, 5200, 11200) * weekendBoost);
  if (day !== todayKey(now)) return full;
  // Today: scale by how much of the waking day has passed (07:00–22:00).
  const hour = now.getHours() + now.getMinutes() / 60;
  const progress = Math.min(1, Math.max(0.05, (hour - 7) / 15));
  return Math.round(full * progress);
}

export function mockActivityToday(now = new Date()): ActivityToday {
  const steps = mockStepsForDay(todayKey(now), now);
  const r = rng(`act-${todayKey(now)}`);
  const distanceKm = +(steps * 0.00072).toFixed(2);
  const activeKcal = Math.round(steps * 0.042 + between(r, 20, 60));
  return {
    steps,
    stepSource: 'healthConnect',
    distanceKm,
    distanceEstimated: false,
    activeKcal,
    totalKcal: activeKcal + 1380,
    exerciseMinutes: Math.round(between(r, 18, 45)),
    exerciseSessions: 1,
  };
}

export function mockSleepForDay(day: DayKey): SleepNight {
  const r = rng(`sleep-${day}`);
  const bedtime = dayStart(addDays(day, -1));
  bedtime.setHours(22, 50 + Math.round(between(r, -40, 70)), 0, 0);
  const durationMin = Math.round(between(r, 380, 495));
  const end = new Date(bedtime.getTime() + durationMin * 60_000);
  const awake = Math.round(between(r, 10, 35));
  const deep = Math.round((durationMin - awake) * between(r, 0.15, 0.22));
  const rem = Math.round((durationMin - awake) * between(r, 0.2, 0.25));
  const light = durationMin - awake - deep - rem;
  return {
    day,
    start: bedtime.toISOString(),
    end: end.toISOString(),
    durationMin,
    asleepMin: durationMin - awake,
    stages: { deep, light, rem, awake },
    hasStages: true,
    quality: null,
    source: MOCK_PACKAGES.googleFit,
  };
}

export function mockRestingHrForDay(day: DayKey): number {
  const r = rng(`rhr-${day}`);
  return Math.round(between(r, 61, 69));
}

export function mockHeartToday(now = new Date()): HeartToday {
  const day = todayKey(now);
  const r = rng(`hr-${day}`);
  const currentHour = now.getHours();
  const hourly = Array.from({ length: 24 }, (_, h) => {
    if (h > currentHour) return null;
    const base = h < 6 ? 60 : h < 9 ? 72 : h < 18 ? 80 : 74;
    const workout = h === 18 ? 38 : 0;
    return Math.round(base + workout + between(r, -6, 8));
  });
  const vals = hourly.filter((v): v is number => v !== null);
  return {
    restingBpm: mockRestingHrForDay(day),
    minBpm: vals.length ? Math.min(...vals) - 3 : null,
    maxBpm: vals.length ? Math.max(...vals) + 6 : null,
    hourly,
    latest: (() => {
      const h = [...hourly].reverse().find((v) => v !== null);
      return h == null ? null : { bpm: h, time: new Date(now.getTime() - 15 * 60_000).toISOString() };
    })(),
  };
}

export function mockSpo2Latest(now = new Date()): Spo2Latest {
  const r = rng(`spo2-${todayKey(now)}`);
  const t = new Date(now);
  t.setMinutes(Math.max(0, t.getMinutes() - 42));
  return { percent: Math.round(between(r, 96, 99)), time: t.toISOString() };
}

/**
 * Period history: 7 cycles with lengths 27–31 days ending so that "today" falls
 * mid-cycle, plus period lengths 4–6 days.
 */
export function mockCycle(now = new Date()): CycleData {
  const lengths = [29, 28, 30, 27, 29, 31, 28];
  const today = todayKey(now);
  // Current cycle started 12 days ago.
  let start = addDays(today, -11);
  const starts: DayKey[] = [start];
  for (let i = lengths.length - 1; i >= 0; i--) {
    start = addDays(start, -lengths[i]);
    starts.unshift(start);
  }
  const bleedingDays: DayKey[] = [];
  starts.forEach((s, i) => {
    const len = 4 + (i % 3); // 4,5,6
    for (let d = 0; d < len; d++) {
      const day = addDays(s, d);
      if (day <= today) bleedingDays.push(day);
    }
  });
  return { bleedingDays };
}

export function mockTrendDays(count: number, now = new Date()) {
  const days = lastNDays(count, todayKey(now));
  return {
    steps: days.map((day) => ({ day, value: mockStepsForDay(day, now) })),
    sleepMin: days.map((day) => ({ day, value: mockSleepForDay(day).asleepMin })),
    restingHr: days.map((day) => ({ day, value: mockRestingHrForDay(day) })),
    hrKind: 'resting' as const,
    sourcesBy: {
      steps: [MOCK_PACKAGES.googleFit, MOCK_PACKAGES.noiseFit],
      sleep: [MOCK_PACKAGES.googleFit],
      heart: [MOCK_PACKAGES.googleFit],
    },
  };
}

export const MOCK_SOURCES: SourcesByMetric = {
  Steps: [MOCK_PACKAGES.googleFit, MOCK_PACKAGES.noiseFit],
  Distance: [MOCK_PACKAGES.googleFit],
  ActiveCaloriesBurned: [MOCK_PACKAGES.googleFit],
  TotalCaloriesBurned: [MOCK_PACKAGES.googleFit],
  ExerciseSession: [MOCK_PACKAGES.googleFit],
  SleepSession: [MOCK_PACKAGES.googleFit],
  HeartRate: [MOCK_PACKAGES.googleFit],
  RestingHeartRate: [MOCK_PACKAGES.googleFit],
  OxygenSaturation: [MOCK_PACKAGES.googleFit],
  MenstruationPeriod: [MOCK_PACKAGES.flo],
  MenstruationFlow: [MOCK_PACKAGES.flo],
};

/** A few sample day logs for the last 30 days (demo mode + AI coach summary). */
export function mockDayLogs(now = new Date()): import('../db/repos').DayLog[] {
  const today = todayKey(now);
  const pick: [number, string[], string[]][] = [
    [-11, ['cramps', 'fatigue'], ['low']],
    [-10, ['cramps'], ['calm']],
    [-9, ['bloating'], ['irritable']],
    [-4, [], ['energetic', 'happy']],
    [-1, ['headache'], ['anxious']],
    [0, [], ['calm']],
  ];
  return pick.map(([off, symptoms, moods]) => ({
    day: addDays(today, off),
    flow: off >= -11 && off <= -9 ? ('medium' as const) : null,
    symptoms,
    moods,
    note: null,
  }));
}
