/**
 * Paged readers over react-native-health-connect with conservative limits.
 */
import type { RecordResult, RecordType } from 'react-native-health-connect';
import { ensureInitialized, hc } from './client';

const MAX_PAGES = 20;

export function between(start: Date, end: Date) {
  return {
    operator: 'between' as const,
    startTime: start.toISOString(),
    endTime: end.toISOString(),
  };
}

export async function readAll<T extends RecordType>(
  recordType: T,
  start: Date,
  end: Date,
  opts: { ascending?: boolean; pageSize?: number; maxPages?: number } = {}
): Promise<RecordResult<T>[]> {
  const m = hc();
  if (!m) throw new Error('Health Connect is not available in this build.');
  await ensureInitialized();
  const out: RecordResult<T>[] = [];
  let pageToken: string | undefined;
  let pages = 0;
  do {
    const res = await m.readRecords(recordType, {
      timeRangeFilter: between(start, end),
      ascendingOrder: opts.ascending ?? true,
      pageSize: opts.pageSize ?? 1000,
      pageToken,
    });
    out.push(...res.records);
    pageToken = res.pageToken || undefined;
    pages += 1;
  } while (pageToken && pages < (opts.maxPages ?? MAX_PAGES));
  return out;
}

export function originOf(r: { metadata?: { dataOrigin?: string } }): string | undefined {
  return r.metadata?.dataOrigin;
}
