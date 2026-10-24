/**
 * Today's suggested session: the active program's next day when there is one (and it
 * suits a period day, if relevant), otherwise the library's daily pick for the level.
 */
import { SESSIONS, todaysSession, type YogaLevel, type YogaSession } from '../content/yoga';
import type { DayKey } from '../health/dates';
import { getProgram, nextProgramDay, programSession, type ProgramProgress, type YogaProgram } from './programs';
import { useOnPeriod, useYogaHistory, useYogaPrefs } from './hooks';
import type { YogaHistoryEntry } from './store';
import { todayKey } from '../health/dates';

export interface TodayPick {
  session: YogaSession | null;
  program: YogaProgram | null;
  /** 0-based program day, when the pick comes from a program. */
  programDay: number | null;
  /** True when a program session was swapped for a period-friendly one. */
  swappedForPeriod: boolean;
}

export function pickToday(args: {
  level: YogaLevel;
  dateKey: DayKey;
  onPeriod: boolean;
  progress: ProgramProgress | null;
  /** Program days already completed *today* (one program day per calendar day). */
  programDoneToday: boolean;
  sessions?: ReadonlyArray<YogaSession>;
}): TodayPick {
  const sessions = args.sessions ?? SESSIONS;
  const program = getProgram(args.progress?.programId);
  if (program && !args.programDoneToday) {
    const day = nextProgramDay(program, args.progress);
    if (day !== null) {
      const s = programSession(program, day, sessions);
      if (s && (!args.onPeriod || s.periodFriendly)) {
        return { session: s, program, programDay: day, swappedForPeriod: false };
      }
      if (s) {
        const alt = safeToday(args);
        return { session: alt, program: null, programDay: null, swappedForPeriod: true };
      }
    }
  }
  return { session: safeToday(args), program: null, programDay: null, swappedForPeriod: false };
}

function safeToday(args: { level: YogaLevel; dateKey: DayKey; onPeriod: boolean }): YogaSession | null {
  try {
    return todaysSession({ level: args.level, dateKey: args.dateKey, onPeriod: args.onPeriod }) ?? null;
  } catch {
    return null;
  }
}

/** Hook: today's pick plus whether a session was already completed today. */
export function useToday(): TodayPick & {
  loading: boolean;
  level: YogaLevel;
  levelChosen: boolean;
  onPeriod: boolean;
  doneToday: YogaHistoryEntry[];
} {
  const { prefs, loaded } = useYogaPrefs();
  const history = useYogaHistory(30);
  const onPeriod = useOnPeriod();
  const level = prefs.level ?? 'beginner';
  const dateKey = todayKey();
  const programDoneToday = history.today.some((e) => e.programId && e.programId === prefs.program?.programId);
  const pick = pickToday({ level, dateKey, onPeriod, progress: prefs.program, programDoneToday });
  return {
    ...pick,
    loading: !loaded || history.loading,
    level,
    levelChosen: prefs.level !== null,
    onPeriod,
    doneToday: history.today,
  };
}
