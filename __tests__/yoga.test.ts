jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

import type { YogaPose, YogaSession } from '../src/content/yoga';
import { setDriver } from '../src/db/driver';
import {
  buildPlaylist,
  clampWeeklyGoal,
  computeStreak,
  formatClock,
  intensityFor,
  isComplete,
  poseCount,
  sessionCautions,
  sessionsThisWeek,
  suggestLevelFromFeel,
  weekStart,
} from '../src/yoga/logic';
import { PROGRAMS, nextProgramDay, programSession } from '../src/yoga/programs';
import { DEFAULT_PREFS, loadPrefs, onYogaChange, savePrefs, yogaHistory } from '../src/yoga/store';
import { memoryDriver } from '../test-utils/memoryDriver';

const pose = (p: Partial<YogaPose> & { id: string }): YogaPose => ({
  name: p.id,
  sanskrit: '',
  level: 'beginner',
  focus: [],
  holdSeconds: 30,
  steps: ['Breathe.'],
  benefits: '',
  cautions: [],
  ...p,
});

const POSES: YogaPose[] = [
  pose({ id: 'mountain' }),
  pose({ id: 'lunge', perSide: true, holdSeconds: 20, cautions: ['Knee injury: pad the back knee.'] }),
  pose({ id: 'twist', avoidDuringPeriod: true, modification: 'Twist gently from the upper back.', cautions: ['Go slow.'] }),
  pose({ id: 'inversion', avoidDuringPeriod: true, cautions: ['Go slow.'] }),
];

const session = (s: Partial<YogaSession> & { id: string }): YogaSession => ({
  title: s.id,
  level: 'beginner',
  minutes: 10,
  goal: 'morning',
  periodFriendly: false,
  items: [],
  description: '',
  ...s,
});

const S = session({
  id: 's1',
  items: [{ poseId: 'mountain' }, { poseId: 'lunge' }, { poseId: 'twist', seconds: 40 }, { poseId: 'inversion' }],
});

describe('buildPlaylist', () => {
  it('expands per-side poses into left + right steps', () => {
    const p = buildPlaylist(S, POSES);
    expect(p.steps.map((s) => `${s.poseId}${s.side ? ':' + s.side : ''}`)).toEqual([
      'mountain',
      'lunge:left',
      'lunge:right',
      'twist',
      'inversion',
    ]);
    expect(p.steps.map((s) => s.index)).toEqual([0, 1, 2, 3, 4]);
    expect(p.totalSeconds).toBe(30 + 20 + 20 + 40 + 30);
  });

  it('on a period: uses the easier version or skips poses to avoid', () => {
    const p = buildPlaylist(S, POSES, { onPeriod: true });
    expect(p.steps.map((s) => s.poseId)).toEqual(['mountain', 'lunge', 'lunge', 'twist']);
    expect(p.steps.find((s) => s.poseId === 'twist')!.periodModified).toBe(true);
    expect(p.skippedForPeriod.map((x) => x.id)).toEqual(['inversion']);
  });

  it('copes with unknown pose ids', () => {
    const p = buildPlaylist(session({ id: 'x', items: [{ poseId: 'nope' }] }), POSES);
    expect(p.steps).toHaveLength(1);
    expect(p.steps[0].pose).toBeNull();
    expect(p.steps[0].seconds).toBe(30);
  });

  it('counts poses and cautions once', () => {
    expect(poseCount(S)).toBe(4);
    expect(sessionCautions(S, POSES)).toEqual(['Knee injury: pad the back knee.', 'Go slow.']);
  });
});

describe('completion, intensity, feel', () => {
  it('completes at 60 %', () => {
    expect(isComplete(59, 100)).toBe(false);
    expect(isComplete(60, 100)).toBe(true);
    expect(isComplete(0, 0)).toBe(false);
  });

  it('picks a sensible intensity', () => {
    expect(intensityFor('beginner', 'strength')).toBe('light');
    expect(intensityFor('intermediate', 'strength')).toBe('moderate');
    expect(intensityFor('advanced', 'weight_loss')).toBe('vigorous');
    expect(intensityFor('advanced', 'evening')).toBe('light');
  });

  it('only suggests a level change after three matching answers', () => {
    expect(suggestLevelFromFeel(['easy', 'easy'], 'beginner')).toBeNull();
    expect(suggestLevelFromFeel(['easy', 'easy', 'easy'], 'beginner')).toBe('intermediate');
    expect(suggestLevelFromFeel(['easy', 'just_right', 'easy'], 'beginner')).toBeNull();
    expect(suggestLevelFromFeel(['hard', 'hard', 'hard', 'easy'], 'advanced')).toBe('intermediate');
    expect(suggestLevelFromFeel(['hard', 'hard', 'hard'], 'beginner')).toBeNull();
    expect(suggestLevelFromFeel(['easy', 'easy', 'easy'], 'advanced')).toBeNull();
  });
});

describe('streaks and weeks', () => {
  it('counts consecutive days ending today or yesterday', () => {
    expect(computeStreak(['2026-10-24', '2026-10-23', '2026-10-22', '2026-10-20'], '2026-10-24')).toBe(3);
    expect(computeStreak(['2026-10-23', '2026-10-22'], '2026-10-24')).toBe(2);
    expect(computeStreak(['2026-10-21'], '2026-10-24')).toBe(0);
    expect(computeStreak([], '2026-10-24')).toBe(0);
  });

  it('weeks start on Monday', () => {
    expect(weekStart('2026-10-24')).toBe('2026-10-19'); // Saturday → Monday
    expect(weekStart('2026-10-19')).toBe('2026-10-19');
    expect(weekStart('2026-10-25')).toBe('2026-10-19'); // Sunday
    expect(sessionsThisWeek(['2026-10-18', '2026-10-19', '2026-10-24', '2026-10-25'], '2026-10-24')).toBe(2);
  });

  it('clamps the weekly goal and formats the clock', () => {
    expect(clampWeeklyGoal(0)).toBe(1);
    expect(clampWeeklyGoal(12)).toBe(7);
    expect(formatClock(65)).toBe('1:05');
    expect(formatClock(0.2)).toBe('0:01');
  });
});

describe('programs', () => {
  const sessions = [
    session({ id: 'b-morning-1', goal: 'morning' }),
    session({ id: 'b-morning-2', goal: 'morning' }),
    session({ id: 'b-flex', goal: 'flexibility' }),
    session({ id: 'i-strength', goal: 'strength', level: 'intermediate' }),
    session({ id: 'b-strength', goal: 'strength' }),
  ];

  it('has the three programs with the right lengths', () => {
    expect(PROGRAMS.map((p) => p.days.length)).toEqual([7, 14, 21]);
  });

  it('rotates through matching sessions and falls back sensibly', () => {
    const start = PROGRAMS[0];
    expect(programSession(start, 0, sessions)!.id).toBe('b-morning-1');
    expect(programSession(start, 4, sessions)!.id).toBe('b-morning-2'); // 2nd morning day
    // 'stress' has no match → any beginner session
    expect(programSession(start, 2, sessions)!.level).toBe('beginner');
    const strength = PROGRAMS[2];
    expect(programSession(strength, 0, sessions)!.id).toBe('i-strength');
    expect(programSession(start, 99, sessions)).toBeNull();
  });

  it('finds the next day to do', () => {
    const p = PROGRAMS[0];
    expect(nextProgramDay(p, null)).toBe(0);
    expect(nextProgramDay(p, { programId: p.id, startedDay: '2026-10-01', completed: [0, 1] })).toBe(2);
    expect(nextProgramDay(p, { programId: 'other', startedDay: '', completed: [0, 1] })).toBe(0);
    expect(nextProgramDay(p, { programId: p.id, startedDay: '', completed: [0, 1, 2, 3, 4, 5, 6] })).toBeNull();
  });
});

describe('store', () => {
  beforeEach(() => setDriver(memoryDriver()));
  afterAll(() => setDriver(null));

  it('creates its table lazily and round-trips history', async () => {
    let changes = 0;
    const off = onYogaChange(() => changes++);
    const id = await yogaHistory.add({
      day: '2026-10-24',
      sessionId: 's1',
      title: 'Morning',
      level: 'beginner',
      minutes: 9.6,
      poses: 5,
      fraction: 0.82,
      programId: null,
      programDay: null,
    });
    await yogaHistory.add({
      day: '2026-10-23',
      sessionId: 's2',
      title: 'Evening',
      level: 'beginner',
      minutes: 12,
      poses: 6,
      fraction: 1,
      programId: 'beginner-start-7',
      programDay: 0,
    });
    await yogaHistory.setFeel(id, 'easy');
    off();
    expect(changes).toBe(3);
    const list = await yogaHistory.list();
    expect(list).toHaveLength(2);
    expect(list.find((e) => e.id === id)!.feel).toBe('easy');
    expect(await yogaHistory.days()).toEqual(['2026-10-24', '2026-10-23']);
    expect((await yogaHistory.doneOn('2026-10-24')).map((e) => e.title)).toEqual(['Morning']);
    expect(await yogaHistory.recentFeels(0)).toEqual(['easy']);
    expect(await yogaHistory.recentFeels(id)).toEqual([]);
    expect(await yogaHistory.lastId()).toBeGreaterThanOrEqual(id);
  });

  it('persists prefs with defaults and clamping', async () => {
    expect(await loadPrefs()).toEqual(DEFAULT_PREFS);
    const p = await savePrefs({ level: 'intermediate', weeklyGoal: 20 });
    expect(p.weeklyGoal).toBe(7);
    expect((await loadPrefs()).level).toBe('intermediate');
  });
});

describe('pose figures', () => {
  it('draws every pose used in Beginner sessions (incl. Surya Namaskar)', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const content = require('../src/content/yoga') as typeof import('../src/content/yoga');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { figureKeyFor } = require('../src/yoga/PoseFigure') as typeof import('../src/yoga/PoseFigure');
    const ids = new Set(
      content.SESSIONS.filter((s) => s.level === 'beginner').flatMap((s) => s.items.map((i) => i.poseId))
    );
    for (const id of ['prayer', 'upward-salute', 'standing-forward-fold', 'low-lunge', 'plank', 'knees-chest-chin', 'cobra', 'downward-dog', 'mountain'])
      ids.add(id);
    const missing = [...ids].filter((id) => {
      const p = content.POSES.find((x) => x.id === id);
      return !p || figureKeyFor(p) === null;
    });
    expect(missing).toEqual([]);
  });

  it('every session references known poses and builds a playlist', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const content = require('../src/content/yoga') as typeof import('../src/content/yoga');
    for (const s of content.SESSIONS) {
      const p = buildPlaylist(s, content.POSES, { onPeriod: true });
      expect(p.steps.every((x) => x.pose !== null)).toBe(true);
    }
  });
});
