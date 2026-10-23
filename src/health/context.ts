import type { HcAvailability } from './client';
import type { MetricId, MetricResult } from './types';

export type DataMode = 'live' | 'demo';

/** Passed to every metric reader. */
export interface ReadContext {
  mode: DataMode;
  /** Record types the user granted read access to (ignored in demo mode). */
  granted: ReadonlySet<MetricId>;
  /** Health Connect availability; local-only readers ignore it. */
  availability?: HcAvailability;
  /** Stride (m) for step → distance when no source provides distance. */
  strideM?: number;
  now?: Date;
}

/** True when Health Connect can be queried for at least one of these types. */
export function hcCan(ctx: ReadContext, ...types: MetricId[]): boolean {
  return (
    ctx.mode === 'live' &&
    (ctx.availability === undefined || ctx.availability === 'available') &&
    types.some((t) => ctx.granted.has(t))
  );
}

export function isGranted(ctx: ReadContext, ...types: MetricId[]): boolean {
  return ctx.mode === 'demo' || types.some((t) => ctx.granted.has(t));
}

export function denied<T>(): MetricResult<T> {
  return { status: 'denied', data: null, sources: [] };
}

export function empty<T>(sources: string[] = []): MetricResult<T> {
  return { status: 'empty', data: null, sources };
}

export function ok<T>(data: T, sources: string[] = []): MetricResult<T> {
  return { status: 'ok', data, sources: uniq(sources) };
}

export function failed<T>(e: unknown): MetricResult<T> {
  return {
    status: 'error',
    data: null,
    sources: [],
    error: e instanceof Error ? e.message : String(e),
  };
}

export function uniq(xs: (string | undefined | null)[]): string[] {
  return Array.from(new Set(xs.filter((x): x is string => !!x)));
}
