/**
 * In-memory SqlDriver for Jest, backed by Node's built-in SQLite (node:sqlite, Node 22.5+).
 * Runs the same SQL as the app, so repository tests exercise real queries.
 */
import type { SqlDriver, SqlValue } from '../src/db/driver';

export function memoryDriver(): SqlDriver {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { DatabaseSync } = require('node:sqlite') as {
    DatabaseSync: new (path: string) => {
      exec(sql: string): void;
      prepare(sql: string): {
        run(...p: SqlValue[]): { lastInsertRowid: number | bigint; changes: number | bigint };
        all(...p: SqlValue[]): unknown[];
        get(...p: SqlValue[]): unknown;
      };
    };
  };
  const db = new DatabaseSync(':memory:');
  const plain = <T>(row: unknown): T => ({ ...(row as object) }) as T;
  return {
    exec: async (sql) => db.exec(sql),
    run: async (sql, params = []) => {
      const r = db.prepare(sql).run(...params);
      return { lastInsertRowId: Number(r.lastInsertRowid), changes: Number(r.changes) };
    },
    all: async <T,>(sql: string, params: SqlValue[] = []) => db.prepare(sql).all(...params).map((r) => plain<T>(r)),
    first: async <T,>(sql: string, params: SqlValue[] = []) => {
      const r = db.prepare(sql).get(...params);
      return r ? plain<T>(r) : null;
    },
  };
}
