/**
 * Bloom's multi-day programs. Each day names a goal; the actual session is picked from
 * SESSIONS (deterministically, rotating through matches) so programs stay in sync with
 * the content library.
 */
import type { YogaLevel, YogaSession } from '../content/yoga';
import { LEVELS, type YogaGoal } from './logic';

export interface YogaProgram {
  id: string;
  title: string;
  level: YogaLevel;
  blurb: string;
  /** One goal per day. */
  days: YogaGoal[];
}

const repeat = <T,>(xs: T[], n: number): T[] => Array.from({ length: n }, (_, i) => xs[i % xs.length]);

export const PROGRAMS: YogaProgram[] = [
  {
    id: 'beginner-start-7',
    title: '7-day Beginner Start',
    level: 'beginner',
    blurb: 'Short, gentle sessions to learn the basics and build a little daily habit.',
    days: ['morning', 'flexibility', 'stress', 'digestion', 'morning', 'flexibility', 'evening'],
  },
  {
    id: 'flexibility-14',
    title: '14-day Flexibility',
    level: 'beginner',
    blurb: 'Two weeks of slow stretching for hips, hamstrings, back and shoulders.',
    days: repeat<YogaGoal>(['flexibility', 'evening', 'flexibility', 'stress', 'flexibility', 'morning', 'evening'], 14),
  },
  {
    id: 'strength-core-21',
    title: '21-day Strength & Core',
    level: 'intermediate',
    blurb: 'Three weeks of standing strength, balance and core work, with easier recovery days.',
    days: repeat<YogaGoal>(['strength', 'weight_loss', 'flexibility', 'strength', 'morning', 'strength', 'stress'], 21),
  },
];

export function getProgram(id: string | null | undefined): YogaProgram | null {
  return PROGRAMS.find((p) => p.id === id) ?? null;
}

const levelRank = (l: YogaLevel) => LEVELS.indexOf(l);

/**
 * Session for program day `dayIndex` (0-based). Prefers the program's level and the day's
 * goal; falls back to an easier level with that goal, then any session at the level.
 */
export function programSession(
  program: YogaProgram,
  dayIndex: number,
  sessions: ReadonlyArray<YogaSession>
): YogaSession | null {
  const goal = program.days[dayIndex];
  if (!goal || !sessions.length) return null;
  // n-th time this goal appears in the program → rotate through matches.
  const nth = program.days.slice(0, dayIndex).filter((g) => g === goal).length;
  const exact = sessions.filter((s) => s.goal === goal && s.level === program.level);
  const easier = sessions
    .filter((s) => s.goal === goal && levelRank(s.level) <= levelRank(program.level))
    .sort((a, b) => levelRank(b.level) - levelRank(a.level));
  const anyGoal = sessions.filter((s) => s.goal === goal);
  const atLevel = sessions.filter((s) => s.level === program.level);
  const pool = exact.length ? exact : easier.length ? easier : anyGoal.length ? anyGoal : atLevel.length ? atLevel : [...sessions];
  return pool[nth % pool.length];
}

export interface ProgramProgress {
  programId: string;
  /** Day key the program was started. */
  startedDay: string;
  /** 0-based program days completed. */
  completed: number[];
}

/** Next day to do (first not completed), or null when finished. */
export function nextProgramDay(program: YogaProgram, progress: ProgramProgress | null): number | null {
  const done = new Set(progress?.programId === program.id ? progress.completed : []);
  for (let i = 0; i < program.days.length; i++) if (!done.has(i)) return i;
  return null;
}
