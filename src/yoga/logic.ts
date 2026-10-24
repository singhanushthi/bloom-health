/**
 * Pure yoga helpers (no React, no storage) — unit-tested in __tests__/yoga.test.ts.
 */
import type { YogaLevel, YogaPose, YogaSession } from '../content/yoga';
import { addDays, diffDays, type DayKey } from '../health/dates';

export const LEVELS: YogaLevel[] = ['beginner', 'intermediate', 'advanced'];
export const LEVEL_LABEL: Record<YogaLevel, string> = {
  beginner: 'Beginner',
  intermediate: 'Intermediate',
  advanced: 'Advanced',
};

export type YogaGoal = YogaSession['goal'];
export const GOALS: { id: YogaGoal; label: string }[] = [
  { id: 'weight_loss', label: 'Weight loss' },
  { id: 'flexibility', label: 'Flexibility' },
  { id: 'strength', label: 'Strength' },
  { id: 'stress', label: 'Stress' },
  { id: 'morning', label: 'Morning' },
  { id: 'evening', label: 'Bedtime' },
  { id: 'period_relief', label: 'Period relief' },
  { id: 'digestion', label: 'Digestion' },
];
export const GOAL_LABEL = Object.fromEntries(GOALS.map((g) => [g.id, g.label])) as Record<YogaGoal, string>;

/* ------------------------------- Playlist ------------------------------- */

export type Side = 'left' | 'right';

export interface PlayStep {
  /** Index in the playlist. */
  index: number;
  poseId: string;
  pose: YogaPose | null;
  seconds: number;
  side?: Side;
  note?: string;
  /** Pose was swapped for its gentler version because the user is on her period. */
  periodModified?: boolean;
}

export interface Playlist {
  steps: PlayStep[];
  /** Poses left out because they're best avoided on a period and have no gentler version. */
  skippedForPeriod: YogaPose[];
  totalSeconds: number;
}

/**
 * Expand a session into timed steps: per-side poses become Left + Right steps
 * (each lasting the hold time), and — when on a period — poses marked avoidDuringPeriod
 * use their modification, or are skipped when there isn't one.
 */
export function buildPlaylist(
  session: YogaSession,
  poses: ReadonlyArray<YogaPose>,
  opts: { onPeriod?: boolean } = {}
): Playlist {
  const byId = new Map(poses.map((p) => [p.id, p]));
  const steps: PlayStep[] = [];
  const skipped: YogaPose[] = [];
  for (const item of session.items) {
    const pose = byId.get(item.poseId) ?? null;
    let periodModified = false;
    if (pose && opts.onPeriod && pose.avoidDuringPeriod) {
      if (pose.modification) periodModified = true;
      else {
        if (!skipped.includes(pose)) skipped.push(pose);
        continue;
      }
    }
    const seconds = Math.max(5, Math.round(item.seconds ?? pose?.holdSeconds ?? 30));
    const base = { poseId: item.poseId, pose, seconds, note: item.note, periodModified };
    if (pose?.perSide) {
      steps.push({ ...base, index: 0, side: 'left' });
      steps.push({ ...base, index: 0, side: 'right' });
    } else {
      steps.push({ ...base, index: 0 });
    }
  }
  steps.forEach((s, i) => (s.index = i));
  return { steps, skippedForPeriod: skipped, totalSeconds: steps.reduce((a, s) => a + s.seconds, 0) };
}

/** Unique pose count in a session (per-side poses count once). */
export function poseCount(session: YogaSession): number {
  return new Set(session.items.map((i) => i.poseId)).size;
}

/** All cautions for a session's poses, de-duplicated, in order. */
export function sessionCautions(session: YogaSession, poses: ReadonlyArray<YogaPose>): string[] {
  const byId = new Map(poses.map((p) => [p.id, p]));
  const out: string[] = [];
  for (const it of session.items) {
    for (const c of byId.get(it.poseId)?.cautions ?? []) if (!out.includes(c)) out.push(c);
  }
  return out;
}

/** A session counts as done (and is logged as activity) at ≥ 60 % of its playlist time. */
export const COMPLETE_FRACTION = 0.6;
export function isComplete(doneSeconds: number, totalSeconds: number): boolean {
  return totalSeconds > 0 && doneSeconds / totalSeconds >= COMPLETE_FRACTION;
}

export function intensityFor(level: YogaLevel, goal: YogaGoal): 'light' | 'moderate' | 'vigorous' {
  if (goal === 'stress' || goal === 'evening' || goal === 'period_relief') return 'light';
  if (level === 'beginner') return 'light';
  if (level === 'advanced' && (goal === 'strength' || goal === 'weight_loss')) return 'vigorous';
  return 'moderate';
}

/* -------------------------------- Feeling ------------------------------- */

export type Feel = 'easy' | 'just_right' | 'hard';
export const FEEL_LABEL: Record<Feel, string> = { easy: 'Easy', just_right: 'Just right', hard: 'Hard' };

/** Answers in a row needed before Bloom *offers* (never forces) a level change. */
export const FEEL_STREAK = 3;

/**
 * `recent` is newest-first. Returns the level to suggest when the last three answers were
 * all "easy" (→ one level up) or all "hard" (→ one level down), else null.
 */
export function suggestLevelFromFeel(recent: Feel[], level: YogaLevel): YogaLevel | null {
  if (recent.length < FEEL_STREAK) return null;
  const last = recent.slice(0, FEEL_STREAK);
  const i = LEVELS.indexOf(level);
  if (last.every((f) => f === 'easy') && i < LEVELS.length - 1) return LEVELS[i + 1];
  if (last.every((f) => f === 'hard') && i > 0) return LEVELS[i - 1];
  return null;
}

/* --------------------------- Streaks & weeks ---------------------------- */

/** Consecutive days with a session, ending today (or yesterday, so a streak survives until bedtime). */
export function computeStreak(days: Iterable<DayKey>, today: DayKey): number {
  const set = new Set(days);
  let cursor = set.has(today) ? today : addDays(today, -1);
  let n = 0;
  while (set.has(cursor)) {
    n += 1;
    cursor = addDays(cursor, -1);
  }
  return n;
}

/** Monday of the week containing `day`. */
export function weekStart(day: DayKey): DayKey {
  const [y, m, d] = day.split('-').map(Number);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0 Sun … 6 Sat
  return addDays(day, -((dow + 6) % 7));
}

/** Sessions completed this (Mon–Sun) week. */
export function sessionsThisWeek(days: DayKey[], today: DayKey): number {
  const start = weekStart(today);
  return days.filter((d) => diffDays(start, d) >= 0 && diffDays(d, today) >= 0).length;
}

export const WEEKLY_GOAL_DEFAULT = 4;
export const WEEKLY_GOAL_MIN = 1;
export const WEEKLY_GOAL_MAX = 7;
export function clampWeeklyGoal(n: number): number {
  return Math.min(WEEKLY_GOAL_MAX, Math.max(WEEKLY_GOAL_MIN, Math.round(n)));
}

/* ------------------------------ Formatting ------------------------------ */

export function formatClock(totalSeconds: number): string {
  const s = Math.max(0, Math.ceil(totalSeconds));
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, '0')}`;
}

export function secondsSpoken(s: number): string {
  const sec = Math.round(s);
  if (sec < 60) return `${sec} seconds`;
  const m = Math.floor(sec / 60);
  const r = sec % 60;
  return r ? `${m} minute${m === 1 ? '' : 's'} ${r} seconds` : `${m} minute${m === 1 ? '' : 's'}`;
}
