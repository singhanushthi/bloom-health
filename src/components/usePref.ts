/**
 * Small UI preferences (which Today sections are shown, the last Plan segment) stored in the
 * on-device kv table (src/db/repos.ts `kv`). Reads once on mount; writes are fire-and-forget.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { kv } from '../db/repos';

export function useKvPref<T>(key: string, fallback: T, isValid: (v: unknown) => v is T): [T, (v: T) => void, boolean] {
  const [value, setValue] = useState<T>(fallback);
  const [loaded, setLoaded] = useState(false);
  const touched = useRef(false);

  useEffect(() => {
    let live = true;
    kv.get<unknown>(key)
      .then((v) => {
        if (live && !touched.current && v !== null && isValid(v)) setValue(v);
      })
      .catch(() => {})
      .finally(() => live && setLoaded(true));
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const set = useCallback(
    (v: T) => {
      touched.current = true;
      setValue(v);
      kv.set(key, v).catch(() => {});
    },
    [key]
  );
  return [value, set, loaded];
}

/* ------------------------------ Today sections ------------------------------ */

export type TodaySectionId = 'glance' | 'cycle' | 'yoga' | 'move' | 'sleepHeart' | 'ask';
export const TODAY_SECTIONS: { id: TodaySectionId; label: string; hint: string }[] = [
  { id: 'glance', label: 'Today at a glance', hint: 'Steps, food, water and weight tiles' },
  { id: 'cycle', label: 'Your cycle', hint: 'Phase, cycle day and next period' },
  { id: 'yoga', label: 'Today’s yoga', hint: 'A suggested session to start' },
  { id: 'move', label: 'Move', hint: 'Steps and activity minutes' },
  { id: 'sleepHeart', label: 'Sleep & heart', hint: 'Last night’s sleep, heart rate and SpO₂' },
  { id: 'ask', label: 'Ask Bloom', hint: 'Your AI coach' },
];
export const TODAY_HIDDEN_KEY = 'ui.today.hidden';

const isIdList = (v: unknown): v is TodaySectionId[] =>
  Array.isArray(v) && v.every((x) => TODAY_SECTIONS.some((s) => s.id === x));

/** Hidden Today sections (empty = everything shown). */
export function useTodayHidden() {
  return useKvPref<TodaySectionId[]>(TODAY_HIDDEN_KEY, [], isIdList);
}

/* ------------------------------- Plan segment ------------------------------- */

export type PlanSegment = 'overview' | 'food' | 'activity' | 'weight';
export const PLAN_SEGMENTS: { value: PlanSegment; label: string }[] = [
  { value: 'overview', label: 'Overview' },
  { value: 'food', label: 'Food' },
  { value: 'activity', label: 'Activity' },
  { value: 'weight', label: 'Weight' },
];
export const PLAN_SEGMENT_KEY = 'ui.plan.segment';

const isSegment = (v: unknown): v is PlanSegment => PLAN_SEGMENTS.some((s) => s.value === v);

export function usePlanSegment() {
  return useKvPref<PlanSegment>(PLAN_SEGMENT_KEY, 'overview', isSegment);
}
