import {
  POSES,
  SESSIONS,
  sessionDurationSeconds,
  suggestSessions,
  todaysSession,
  type YogaLevel,
  type YogaSession,
} from '../src/content/yoga';

const RANK: Record<YogaLevel, number> = { beginner: 0, intermediate: 1, advanced: 2 };
const LEVELS: YogaLevel[] = ['beginner', 'intermediate', 'advanced'];
const GOALS: YogaSession['goal'][] = [
  'weight_loss',
  'flexibility',
  'strength',
  'stress',
  'morning',
  'evening',
  'period_relief',
  'digestion',
];
const poseById = new Map(POSES.map((p) => [p.id, p]));

describe('yoga content: poses', () => {
  it('has a sensible number of poses across all levels', () => {
    expect(POSES.length).toBeGreaterThanOrEqual(45);
    expect(POSES.length).toBeLessThanOrEqual(65);
    for (const l of LEVELS) expect(POSES.some((p) => p.level === l)).toBe(true);
  });

  it('has unique pose ids', () => {
    expect(new Set(POSES.map((p) => p.id)).size).toBe(POSES.length);
  });

  it('includes the required pranayama and shavasana', () => {
    for (const id of ['anulom-vilom', 'bhramari', 'kapalbhati', 'shavasana']) expect(poseById.has(id)).toBe(true);
    expect(poseById.get('kapalbhati')!.avoidDuringPeriod).toBe(true);
  });

  it('every pose is well-formed', () => {
    for (const p of POSES) {
      expect(p.name.length).toBeGreaterThan(0);
      expect(p.sanskrit.length).toBeGreaterThan(0);
      expect(p.focus.length).toBeGreaterThan(0);
      expect(p.holdSeconds).toBeGreaterThan(0);
      expect(p.steps.length).toBeGreaterThanOrEqual(3);
      expect(p.steps.length).toBeLessThanOrEqual(6);
      expect(p.benefits.length).toBeGreaterThan(0);
      expect(Array.isArray(p.cautions)).toBe(true);
      // Every pose that is skipped on period days offers an easier variation.
      if (p.avoidDuringPeriod) expect(p.modification).toBeTruthy();
    }
  });

  it('makes no medical or weight-loss promises', () => {
    const banned = /\b(cure|cures|heal|heals|treat|treats|burns? fat|lose weight|weight loss|detox|guarantee)/i;
    for (const p of POSES) expect(`${p.benefits} ${p.steps.join(' ')}`).not.toMatch(banned);
    for (const s of SESSIONS) expect(`${s.title} ${s.description}`).not.toMatch(banned);
  });
});

describe('yoga content: sessions', () => {
  it('has 4–6 sessions per level and 12–18 total', () => {
    expect(SESSIONS.length).toBeGreaterThanOrEqual(12);
    expect(SESSIONS.length).toBeLessThanOrEqual(18);
    for (const l of LEVELS) {
      const n = SESSIONS.filter((s) => s.level === l).length;
      expect(n).toBeGreaterThanOrEqual(4);
      expect(n).toBeLessThanOrEqual(6);
    }
  });

  it('has unique session ids', () => {
    expect(new Set(SESSIONS.map((s) => s.id)).size).toBe(SESSIONS.length);
  });

  it('covers every goal at least once, incl. Surya Namaskar, period relief and bedtime', () => {
    for (const g of GOALS) expect(SESSIONS.some((s) => s.goal === g)).toBe(true);
    expect(SESSIONS.some((s) => /surya namaskar/i.test(`${s.title} ${s.description}`))).toBe(true);
    expect(SESSIONS.some((s) => s.goal === 'period_relief' && s.level === 'beginner' && s.periodFriendly)).toBe(true);
    expect(SESSIONS.some((s) => s.goal === 'evening' && s.periodFriendly)).toBe(true);
  });

  it('every session poseId exists', () => {
    for (const s of SESSIONS) for (const it of s.items) expect(poseById.has(it.poseId)).toBe(true);
  });

  it('periodFriendly sessions contain no avoidDuringPeriod poses', () => {
    for (const s of SESSIONS.filter((x) => x.periodFriendly)) {
      for (const it of s.items) expect(poseById.get(it.poseId)!.avoidDuringPeriod).toBeUndefined();
    }
  });

  it('pose level never exceeds session level', () => {
    for (const s of SESSIONS) {
      for (const it of s.items) expect(RANK[poseById.get(it.poseId)!.level]).toBeLessThanOrEqual(RANK[s.level]);
    }
  });

  it('stated minutes are 10–35 and within ±25% of the computed duration', () => {
    for (const s of SESSIONS) {
      expect(s.minutes).toBeGreaterThanOrEqual(10);
      expect(s.minutes).toBeLessThanOrEqual(35);
      const ratio = sessionDurationSeconds(s) / (s.minutes * 60);
      expect(ratio).toBeGreaterThanOrEqual(0.75);
      expect(ratio).toBeLessThanOrEqual(1.25);
    }
  });

  it('every session starts and ends calmly (ends in shavasana)', () => {
    for (const s of SESSIONS) expect(s.items[s.items.length - 1].poseId).toBe('shavasana');
  });
});

describe('sessionDurationSeconds', () => {
  it('sums (seconds ?? holdSeconds) × sides + 5 s per item', () => {
    const tree = poseById.get('tree')!; // perSide
    const mountain = poseById.get('mountain')!;
    const s: YogaSession = {
      id: 't',
      title: 't',
      level: 'beginner',
      minutes: 1,
      goal: 'morning',
      periodFriendly: true,
      description: '',
      items: [{ poseId: 'mountain' }, { poseId: 'tree' }, { poseId: 'tree', seconds: 10 }, { poseId: 'mountain', seconds: 7 }],
    };
    expect(tree.perSide).toBe(true);
    expect(sessionDurationSeconds(s)).toBe(mountain.holdSeconds + 5 + tree.holdSeconds * 2 + 5 + 20 + 5 + 7 + 5);
  });
});

describe('suggestSessions', () => {
  it('never suggests above the level and allows at most one level below', () => {
    for (const level of LEVELS) {
      const res = suggestSessions({ level });
      expect(res.length).toBeGreaterThan(0);
      for (const s of res) {
        expect(RANK[s.level]).toBeLessThanOrEqual(RANK[level]);
        expect(RANK[s.level]).toBeGreaterThanOrEqual(RANK[level] - 1);
      }
    }
    expect(suggestSessions({ level: 'beginner' }).every((s) => s.level === 'beginner')).toBe(true);
    expect(suggestSessions({ level: 'advanced' }).some((s) => s.level === 'intermediate')).toBe(true);
  });

  it('onPeriod returns only periodFriendly sessions, for every level', () => {
    for (const level of LEVELS) {
      const res = suggestSessions({ level, onPeriod: true });
      expect(res.length).toBeGreaterThan(0);
      expect(res.every((s) => s.periodFriendly)).toBe(true);
    }
  });

  it('ranks goal matches first, then exact level', () => {
    const res = suggestSessions({ level: 'advanced', goal: 'stress' });
    expect(res[0].goal).toBe('stress');
    const firstNonGoal = res.findIndex((s) => s.goal !== 'stress');
    expect(res.slice(firstNonGoal).every((s) => s.goal !== 'stress')).toBe(true);
    const rest = res.slice(firstNonGoal);
    const firstLower = rest.findIndex((s) => s.level !== 'advanced');
    expect(rest.slice(firstLower).every((s) => s.level === 'intermediate')).toBe(true);

    const flex = suggestSessions({ level: 'advanced', goal: 'flexibility' });
    expect(flex[0].level).toBe('advanced');
    expect(flex[0].goal).toBe('flexibility');
    expect(flex[1].goal).toBe('flexibility');
    expect(flex[1].level).toBe('intermediate');
  });

  it('respects maxMinutes', () => {
    const res = suggestSessions({ level: 'intermediate', maxMinutes: 15 });
    expect(res.length).toBeGreaterThan(0);
    expect(res.every((s) => s.minutes <= 15)).toBe(true);
    expect(suggestSessions({ level: 'beginner', maxMinutes: 1 })).toEqual([]);
  });

  it('every level can find a period-relief or calm session on period days', () => {
    for (const level of LEVELS) {
      const res = suggestSessions({ level, goal: 'period_relief', onPeriod: true });
      expect(res[0].periodFriendly).toBe(true);
    }
  });
});

describe('todaysSession', () => {
  it('is deterministic for the same inputs', () => {
    for (const level of LEVELS) {
      const a = todaysSession({ level, dateKey: '2026-10-24' });
      const b = todaysSession({ level, dateKey: '2026-10-24' });
      expect(a.id).toBe(b.id);
    }
  });

  it('rotates across days through suggestSessions results', () => {
    const pool = suggestSessions({ level: 'beginner' }).map((s) => s.id);
    const seen = new Set<string>();
    for (let d = 1; d <= pool.length; d++) {
      const id = todaysSession({ level: 'beginner', dateKey: `2026-11-${String(d).padStart(2, '0')}` }).id;
      expect(pool).toContain(id);
      seen.add(id);
    }
    expect(seen.size).toBe(pool.length);
  });

  it('respects onPeriod and level rules', () => {
    for (const level of LEVELS) {
      for (let d = 1; d <= 20; d++) {
        const dateKey = `2026-12-${String(d).padStart(2, '0')}`;
        const s = todaysSession({ level, dateKey, onPeriod: true });
        expect(s.periodFriendly).toBe(true);
        expect(RANK[s.level]).toBeLessThanOrEqual(RANK[level]);
        const t = todaysSession({ level, dateKey });
        expect(RANK[t.level]).toBeLessThanOrEqual(RANK[level]);
        expect(RANK[t.level]).toBeGreaterThanOrEqual(RANK[level] - 1);
      }
    }
  });

  it('stays on the requested goal when one exists', () => {
    for (let d = 1; d <= 10; d++) {
      const s = todaysSession({ level: 'intermediate', goal: 'flexibility', dateKey: `2027-01-${String(d).padStart(2, '0')}` });
      expect(s.goal).toBe('flexibility');
    }
  });

  it('always returns a session, even for odd date keys', () => {
    expect(todaysSession({ level: 'beginner', dateKey: 'not-a-date' })).toBeTruthy();
    expect(todaysSession({ level: 'advanced', dateKey: '' })).toBeTruthy();
  });
});
