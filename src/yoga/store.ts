/**
 * Yoga persistence.
 *  - History: SQLite table `yoga_history`, created lazily here (CREATE TABLE IF NOT EXISTS)
 *    so the shared schema doesn't need to know about it.
 *  - Preferences (level, weekly goal, voice, program…): AsyncStorage, on this phone only.
 * A tiny change emitter lets the Yoga tab and the Today card refresh after a session.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { YogaLevel } from '../content/yoga';
import type { SqlDriver } from '../db/driver';
import { db as migratedDb } from '../db/schema';
import { todayKey, type DayKey } from '../health/dates';
import { WEEKLY_GOAL_DEFAULT, clampWeeklyGoal, type Feel } from './logic';
import type { ProgramProgress } from './programs';

/* -------------------------------- Events -------------------------------- */

const listeners = new Set<() => void>();
export function onYogaChange(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
export function emitYogaChange(): void {
  for (const fn of Array.from(listeners)) {
    try {
      fn();
    } catch {
      // a listener failing must not break the others
    }
  }
}

/* -------------------------------- History ------------------------------- */

export interface YogaHistoryEntry {
  id: number;
  day: DayKey;
  sessionId: string;
  title: string;
  level: YogaLevel;
  minutes: number;
  poses: number;
  /** 0–1 share of the session played. */
  fraction: number;
  feel: Feel | null;
  programId: string | null;
  programDay: number | null;
  createdAt: string;
}

interface Row {
  id: number;
  day: string;
  session_id: string;
  title: string;
  level: string;
  minutes: number;
  poses: number;
  fraction: number;
  feel: string | null;
  program_id: string | null;
  program_day: number | null;
  created_at: string;
}

const toEntry = (r: Row): YogaHistoryEntry => ({
  id: r.id,
  day: r.day,
  sessionId: r.session_id,
  title: r.title,
  level: r.level as YogaLevel,
  minutes: r.minutes,
  poses: r.poses,
  fraction: r.fraction,
  feel: (r.feel as Feel | null) ?? null,
  programId: r.program_id,
  programDay: r.program_day,
  createdAt: r.created_at,
});

const ready = new WeakSet<SqlDriver>();
async function db(): Promise<SqlDriver> {
  // Wait for the main schema migrations first so this never races them on first launch.
  const d = await migratedDb();
  if (!ready.has(d)) {
    await d.exec(`CREATE TABLE IF NOT EXISTS yoga_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      day TEXT NOT NULL,
      session_id TEXT NOT NULL,
      title TEXT NOT NULL,
      level TEXT NOT NULL,
      minutes REAL NOT NULL,
      poses INTEGER NOT NULL,
      fraction REAL NOT NULL,
      feel TEXT,
      program_id TEXT,
      program_day INTEGER,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_yoga_history_day ON yoga_history(day);`);
    ready.add(d);
  }
  return d;
}

export const yogaHistory = {
  async add(e: Omit<YogaHistoryEntry, 'id' | 'createdAt' | 'feel'> & { feel?: Feel | null }): Promise<number> {
    const d = await db();
    const r = await d.run(
      `INSERT INTO yoga_history (day, session_id, title, level, minutes, poses, fraction, feel, program_id, program_day, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        e.day,
        e.sessionId,
        e.title,
        e.level,
        Math.round(e.minutes * 10) / 10,
        e.poses,
        Math.round(e.fraction * 1000) / 1000,
        e.feel ?? null,
        e.programId,
        e.programDay,
        new Date().toISOString(),
      ]
    );
    emitYogaChange();
    return r.lastInsertRowId;
  },
  async setFeel(id: number, feel: Feel): Promise<void> {
    const d = await db();
    await d.run('UPDATE yoga_history SET feel = ? WHERE id = ?', [feel, id]);
    emitYogaChange();
  },
  async list(limit = 50): Promise<YogaHistoryEntry[]> {
    const d = await db();
    const rows = await d.all<Row>('SELECT * FROM yoga_history ORDER BY created_at DESC, id DESC LIMIT ?', [limit]);
    return rows.map(toEntry);
  },
  /** Distinct days with a session, newest first (for streaks and the weekly goal). */
  async days(limit = 400): Promise<DayKey[]> {
    const d = await db();
    const rows = await d.all<{ day: string }>('SELECT DISTINCT day FROM yoga_history ORDER BY day DESC LIMIT ?', [limit]);
    return rows.map((r) => r.day);
  },
  async doneOn(day: DayKey = todayKey()): Promise<YogaHistoryEntry[]> {
    const d = await db();
    const rows = await d.all<Row>('SELECT * FROM yoga_history WHERE day = ? ORDER BY created_at DESC', [day]);
    return rows.map(toEntry);
  },
  /** Feel answers newer than `afterId`, newest first. */
  async recentFeels(afterId = 0, limit = 10): Promise<Feel[]> {
    const d = await db();
    const rows = await d.all<{ feel: string }>(
      'SELECT feel FROM yoga_history WHERE feel IS NOT NULL AND id > ? ORDER BY id DESC LIMIT ?',
      [afterId, limit]
    );
    return rows.map((r) => r.feel as Feel);
  },
  async lastId(): Promise<number> {
    const d = await db();
    const r = await d.first<{ id: number }>('SELECT MAX(id) AS id FROM yoga_history');
    return r?.id ?? 0;
  },
};

/** For "Export as JSON": every yoga session and the yoga preferences. */
export async function exportYogaData(): Promise<{ history: YogaHistoryEntry[]; prefs: YogaPrefs }> {
  const d = await db();
  const rows = await d.all<Row>('SELECT * FROM yoga_history ORDER BY created_at ASC, id ASC');
  return { history: rows.map(toEntry), prefs: await loadPrefs() };
}

/** For "Delete all my data": removes yoga history and resets yoga preferences/program progress. */
export async function clearYogaData(): Promise<void> {
  const d = await db();
  await d.run('DELETE FROM yoga_history');
  try {
    await AsyncStorage.removeItem(KEY);
  } catch {
    // storage unavailable — nothing stored there either
  }
  emitYogaChange();
}

/* ------------------------------ Preferences ----------------------------- */

const KEY = 'bloom.yoga.v1';

export interface YogaPrefs {
  /** null until the user picks (first-time prompt). */
  level: YogaLevel | null;
  weeklyGoal: number;
  disclaimerSeen: boolean;
  voice: boolean;
  haptics: boolean;
  program: ProgramProgress | null;
  /** Feel answers up to this history id are ignored (after a level prompt was shown). */
  feelResetAfterId: number;
}

export const DEFAULT_PREFS: YogaPrefs = {
  level: null,
  weeklyGoal: WEEKLY_GOAL_DEFAULT,
  disclaimerSeen: false,
  voice: false,
  haptics: true,
  program: null,
  feelResetAfterId: 0,
};

export async function loadPrefs(): Promise<YogaPrefs> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return { ...DEFAULT_PREFS };
    const p = { ...DEFAULT_PREFS, ...(JSON.parse(raw) as Partial<YogaPrefs>) };
    p.weeklyGoal = clampWeeklyGoal(p.weeklyGoal);
    return p;
  } catch {
    return { ...DEFAULT_PREFS };
  }
}

export async function savePrefs(patch: Partial<YogaPrefs>): Promise<YogaPrefs> {
  const next = { ...(await loadPrefs()), ...patch };
  next.weeklyGoal = clampWeeklyGoal(next.weeklyGoal);
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // storage unavailable — keep going with in-memory values
  }
  emitYogaChange();
  return next;
}
