/**
 * Local SQLite schema. Everything Bloom records itself lives here, on-device only.
 * Bump SCHEMA_VERSION and add a migration step when changing tables.
 */
import { getDriver, type SqlDriver } from './driver';

export const SCHEMA_VERSION = 2;

const V1 = `
CREATE TABLE IF NOT EXISTS period_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  start_day TEXT NOT NULL,          -- YYYY-MM-DD (local)
  end_day TEXT,                     -- inclusive; NULL = ongoing / unknown
  flow TEXT,                        -- light | medium | heavy
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_period_start ON period_logs(start_day);

CREATE TABLE IF NOT EXISTS day_logs (
  day TEXT PRIMARY KEY,             -- YYYY-MM-DD
  flow TEXT,                        -- none | spotting | light | medium | heavy
  symptoms TEXT NOT NULL DEFAULT '[]',  -- JSON array of symptom ids
  moods TEXT NOT NULL DEFAULT '[]',     -- JSON array of mood ids
  note TEXT,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sleep_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  start_time TEXT NOT NULL,         -- ISO instant
  end_time TEXT NOT NULL,
  quality INTEGER,                  -- 1..5
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sleep_end ON sleep_logs(end_time);

CREATE TABLE IF NOT EXISTS vitals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kind TEXT NOT NULL,               -- hr | spo2
  value REAL NOT NULL,
  time TEXT NOT NULL,               -- ISO instant
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_vitals_kind_time ON vitals(kind, time);

CREATE TABLE IF NOT EXISTS step_days (
  day TEXT PRIMARY KEY,             -- YYYY-MM-DD
  sensor_steps INTEGER NOT NULL DEFAULT 0,  -- counted by the phone sensor while Bloom was open
  manual_steps INTEGER,             -- user override; when set it wins
  updated_at TEXT NOT NULL
);
`;

/** v2: Plan — profile, weight, food, water, activity, plan adjustments. All idempotent. */
const V2 = `
CREATE TABLE IF NOT EXISTS kv (
  key TEXT PRIMARY KEY,             -- e.g. 'plan.profile' (JSON)
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS weight_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  day TEXT NOT NULL,                -- YYYY-MM-DD
  slot TEXT NOT NULL,               -- morning | night
  kg REAL NOT NULL,
  time TEXT NOT NULL,               -- ISO instant
  source TEXT NOT NULL DEFAULT 'bloom',
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_weight_day ON weight_logs(day);

CREATE TABLE IF NOT EXISTS food_entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  day TEXT NOT NULL,
  meal TEXT NOT NULL,               -- breakfast | lunch | snack | dinner | other
  food_key TEXT,                    -- 'db:<id>' | 'custom:<id>' | NULL (AI / one-off)
  name TEXT NOT NULL,
  servings REAL NOT NULL DEFAULT 1,
  grams REAL,
  kcal REAL NOT NULL,
  protein REAL NOT NULL DEFAULT 0,
  carbs REAL NOT NULL DEFAULT 0,
  fat REAL NOT NULL DEFAULT 0,
  fiber REAL NOT NULL DEFAULT 0,
  source TEXT NOT NULL DEFAULT 'db', -- db | custom | ai
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_food_day ON food_entries(day);

CREATE TABLE IF NOT EXISTS custom_foods (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  serving_label TEXT NOT NULL,
  serving_grams REAL,
  kcal REAL NOT NULL,
  protein REAL NOT NULL DEFAULT 0,
  carbs REAL NOT NULL DEFAULT 0,
  fat REAL NOT NULL DEFAULT 0,
  fiber REAL NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS food_favourites (
  food_key TEXT PRIMARY KEY,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS water_days (
  day TEXT PRIMARY KEY,
  ml INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS activity_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  day TEXT NOT NULL,
  type TEXT NOT NULL,
  title TEXT,
  minutes REAL NOT NULL,
  intensity TEXT NOT NULL,
  kcal REAL NOT NULL DEFAULT 0,
  source TEXT NOT NULL DEFAULT 'manual', -- manual | bloom-yoga | health-connect
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_activity_day ON activity_logs(day);

CREATE TABLE IF NOT EXISTS plan_adjustments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  week_start TEXT NOT NULL UNIQUE,  -- YYYY-MM-DD; one decision per plan week
  week_no INTEGER NOT NULL,
  delta_kcal INTEGER NOT NULL,
  verdict TEXT NOT NULL DEFAULT 'on-track', -- slow | fast | on-track | not-enough-data
  reason TEXT NOT NULL,
  created_at TEXT NOT NULL
);
`;

let ready: Promise<SqlDriver> | null = null;
let readyFor: SqlDriver | null = null;

export async function migrate(d: SqlDriver): Promise<void> {
  await d.exec('CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT)');
  const row = await d.first<{ value: string }>("SELECT value FROM meta WHERE key = 'schema_version'");
  const current = row ? Number(row.value) : 0;
  if (current < 1) {
    await d.exec(V1);
  }
  if (current < 2) {
    await d.exec(V2);
  }
  await d.run("INSERT OR REPLACE INTO meta (key, value) VALUES ('schema_version', ?)", [
    String(SCHEMA_VERSION),
  ]);
}

/** Returns a driver with the schema applied (migrates once per driver). */
export async function db(): Promise<SqlDriver> {
  const d = await getDriver();
  if (!ready || readyFor !== d) {
    readyFor = d;
    ready = migrate(d).then(
      () => d,
      (e) => {
        // Don't cache a failed migration forever — retry on the next call.
        ready = null;
        readyFor = null;
        throw e;
      }
    );
  }
  return ready;
}

export const ALL_TABLES = [
  'period_logs',
  'day_logs',
  'sleep_logs',
  'vitals',
  'step_days',
  'kv',
  'weight_logs',
  'food_entries',
  'custom_foods',
  'food_favourites',
  'water_days',
  'activity_logs',
  'plan_adjustments',
] as const;
