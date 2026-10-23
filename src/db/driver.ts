/**
 * Minimal SQL driver interface. The app uses expo-sqlite; tests inject an in-memory
 * driver backed by node:sqlite (see test-utils/memoryDriver.ts). Repositories only
 * depend on this interface, so they are fully testable without native code.
 */
export type SqlValue = string | number | null;

export interface SqlDriver {
  exec(sql: string): Promise<void>;
  run(sql: string, params?: SqlValue[]): Promise<{ lastInsertRowId: number; changes: number }>;
  all<T>(sql: string, params?: SqlValue[]): Promise<T[]>;
  first<T>(sql: string, params?: SqlValue[]): Promise<T | null>;
}

let override: SqlDriver | null = null;
let real: Promise<SqlDriver> | null = null;

/** For tests: replace the driver (pass null to reset). */
export function setDriver(d: SqlDriver | null): void {
  override = d;
}

export async function getDriver(): Promise<SqlDriver> {
  if (override) return override;
  if (!real) real = openExpoDriver();
  return real;
}

async function openExpoDriver(): Promise<SqlDriver> {
  // Lazy require so importing the repositories never needs the native module.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const SQLite = require('expo-sqlite') as typeof import('expo-sqlite');
  const db = await SQLite.openDatabaseAsync('bloom.db');
  await db.execAsync('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
  return {
    exec: (sql) => db.execAsync(sql),
    run: async (sql, params = []) => {
      const r = await db.runAsync(sql, params);
      return { lastInsertRowId: r.lastInsertRowId, changes: r.changes };
    },
    all: (sql, params = []) => db.getAllAsync(sql, params),
    first: (sql, params = []) => db.getFirstAsync(sql, params),
  };
}
