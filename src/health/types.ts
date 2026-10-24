import type { DayKey } from './dates';

/** Generic async result for a metric. */
export type MetricStatus = 'ok' | 'empty' | 'denied' | 'error';

export interface MetricResult<T> {
  status: MetricStatus;
  data: T | null;
  /** Package names of the apps that supplied this data (dataOrigin). */
  sources: string[];
  error?: string;
}

/** Where today's step count came from. */
export type StepSource = 'healthConnect' | 'sensor' | 'manual';

export interface ActivityToday {
  steps: number;
  stepSource: StepSource;
  distanceKm: number;
  /** true when distance = steps × stride (no source provided distance). */
  distanceEstimated: boolean;
  /** Only when Health Connect provides calories; never estimated. */
  activeKcal: number | null;
  totalKcal: number | null;
  exerciseMinutes: number;
  exerciseSessions: number;
}

export type SleepStageKind = 'deep' | 'light' | 'rem' | 'awake' | 'asleep';

export interface SleepNight {
  /** Day the sleep ended (wake-up day). */
  day: DayKey;
  start: string;
  end: string;
  /** In-bed duration in minutes (session start→end). */
  durationMin: number;
  /** Minutes actually asleep (excludes awake/out of bed stages when present). */
  asleepMin: number;
  /** Minutes per stage; empty when the source app did not write stages. */
  stages: Partial<Record<SleepStageKind, number>>;
  hasStages: boolean;
  /** 1–5 when logged in Bloom. */
  quality?: number | null;
  /** 'bloom:log' for Bloom's own logs, otherwise the Health Connect dataOrigin. */
  source?: string;
}

export interface HeartToday {
  restingBpm: number | null;
  minBpm: number | null;
  maxBpm: number | null;
  /** Hourly averages for today's sparkline (null for hours with no samples). */
  hourly: (number | null)[];
  /** Most recent single reading (Health Connect sample or logged in Bloom). */
  latest: { bpm: number; time: string } | null;
}

export interface Spo2Latest {
  percent: number;
  time: string;
}

export interface DailyValue {
  day: DayKey;
  value: number | null;
}

export interface Trends {
  steps: DailyValue[];
  sleepMin: DailyValue[];
  /** Resting HR per day (Health Connect) or, without it, the daily mean of logged readings. */
  restingHr: DailyValue[];
  hrKind: 'resting' | 'readings';
  /** dataOrigins per chart, for the source label on each card. */
  sourcesBy?: { steps: string[]; sleep: string[]; heart: string[] };
}

export interface CycleData {
  bleedingDays: DayKey[];
}

/** Metric ids used for permissions and the Sources screen. */
export type MetricId =
  | 'Steps'
  | 'Distance'
  | 'ActiveCaloriesBurned'
  | 'TotalCaloriesBurned'
  | 'ExerciseSession'
  | 'SleepSession'
  | 'HeartRate'
  | 'RestingHeartRate'
  | 'OxygenSaturation'
  | 'MenstruationPeriod'
  | 'MenstruationFlow';

export type SourcesByMetric = Partial<Record<MetricId, string[]>>;

/** Pseudo dataOrigins for data that did not come from Health Connect. */
export const LOCAL_SOURCE = {
  log: 'bloom:log',
  sensor: 'bloom:sensor',
  manual: 'bloom:manual',
  demo: 'bloom:demo',
  /** Heart rate saved from a watch connected directly over Bluetooth (src/watch). */
  watch: 'bloom:watch',
} as const;
