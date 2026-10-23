/**
 * Local SQLite schema. Everything Bloom records itself lives here, on-device only.
 * Bump SCHEMA_VERSION and add a migration step when changing tables.
 */
import { getDriver, type SqlDriver } from './driver';

export const SCHEMA_VERSION = 1;

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

let ready: Promise<SqlDriver> | null = null;
let readyFor: SqlDriver | null = null;

export async function migrate(d: SqlDriver): Promise<void> {
  await d.exec('CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT)');
  const row = await d.first<{ value: string }>("SELECT value FROM meta WHERE key = 'schema_version'");
  const current = row ? Number(row.value) : 0;
  if (current < 1) {
    await d.exec(V1);
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
    ready = migrate(d).then(() => d);
  }
  return ready;
}

export const ALL_TABLES = ['period_logs', 'day_logs', 'sleep_logs', 'vitals', 'step_days'] as const;
