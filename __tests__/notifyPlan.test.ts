import { addDays } from '../src/health/dates';
import { computeCycleStatus, predictCycles } from '../src/health/cyclePrediction';
import { DEFAULT_CYCLE_SETTINGS, type CycleSettings } from '../src/cycle/store';
import { buildReminderPlan, nextDaily, REMINDER_PREFIX } from '../src/notify/plan';
import { __setNotificationsModule, applyReminderPlan, requestReminderPermission } from '../src/notify/scheduler';

jest.mock('react-native', () => ({ Platform: { OS: 'android' } }));

const period = (start: string, len = 5) => Array.from({ length: len }, (_, i) => addDays(start, i));
const days = [...period('2026-01-01'), ...period('2026-01-29'), ...period('2026-02-26')];
const today = '2026-03-02';
const now = new Date('2026-03-02T12:00:00');
const predictions = predictCycles(computeCycleStatus({ bleedingDays: days, today }), today, {
  cycleLength: 28,
  periodLength: 5,
  irregular: false,
});
const settings = (patch: Partial<CycleSettings['reminders']> = {}, discreet = true): CycleSettings => ({
  ...DEFAULT_CYCLE_SETTINGS,
  discreet,
  reminders: { ...DEFAULT_CYCLE_SETTINGS.reminders, ...patch },
});
const local = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;

describe('reminder plan', () => {
  it('defaults: period-soon (2 days before, 9:00) for the next 3 periods + one late check', () => {
    const plan = buildReminderPlan({ settings: settings(), predictions, now });
    const soon = plan.filter((p) => p.kind === 'periodSoon');
    expect(soon.map((p) => local(p.date))).toEqual(['2026-03-24 09:00', '2026-04-21 09:00', '2026-05-19 09:00']);
    const late = plan.filter((p) => p.kind === 'late');
    expect(late).toHaveLength(1);
    expect(local(late[0].date)).toBe('2026-03-30 10:00'); // expected 26 Mar + 4 days
    expect(plan.some((p) => p.kind === 'fertile' || p.kind === 'logDay' || p.kind === 'pill')).toBe(false);
    expect(plan.every((p) => p.id.startsWith(REMINDER_PREFIX))).toBe(true);
    expect(new Set(plan.map((p) => p.id)).size).toBe(plan.length);
  });

  it('discreet wording never mentions periods', () => {
    const plan = buildReminderPlan({ settings: settings({ fertile: true, logDay: true, pill: true }), predictions, now });
    for (const p of plan) {
      expect(p.title).toBe('Bloom reminder');
      expect(`${p.title} ${p.body}`).not.toMatch(/period|fertile|pill|ovulat/i);
    }
  });

  it('plain wording when discreet is off', () => {
    const plan = buildReminderPlan({ settings: settings({ fertile: true, pill: true }, false), predictions, now });
    expect(plan.find((p) => p.kind === 'periodSoon')!.title).toBe('Period may start in 2 days');
    expect(plan.find((p) => p.kind === 'fertile')!.body).toMatch(/Not a method of contraception/);
    expect(plan.find((p) => p.kind === 'pill')!.title).toBe('Pill reminder');
  });

  it('fertile window reminders on the first fertile day', () => {
    const plan = buildReminderPlan({ settings: settings({ periodSoon: false, late: false, fertile: true }), predictions, now });
    expect(plan.map((p) => p.kind)).toEqual(['fertile', 'fertile', 'fertile']);
    expect(local(plan[0].date)).toBe(`${predictions.upcoming[0].fertileStart} 09:00`);
  });

  it('daily log and pill reminders repeat at the chosen time', () => {
    const plan = buildReminderPlan({
      settings: settings({ periodSoon: false, late: false, logDay: true, logTime: '21:15', pill: true, pillTime: '08:05' }),
      predictions: null,
      now,
    });
    const log = plan.find((p) => p.kind === 'logDay')!;
    const pill = plan.find((p) => p.kind === 'pill')!;
    expect(log.repeat).toEqual({ hour: 21, minute: 15 });
    expect(local(log.date)).toBe('2026-03-02 21:15');
    expect(pill.repeat).toEqual({ hour: 8, minute: 5 });
    expect(local(pill.date)).toBe('2026-03-03 08:05'); // already past today
    expect(log.id).toBe(`${REMINDER_PREFIX}logDay`);
  });

  it('nothing when everything is off; never schedules in the past', () => {
    const off = settings({ periodSoon: false, late: false, fertile: false, logDay: false, pill: false });
    expect(buildReminderPlan({ settings: off, predictions, now })).toEqual([]);
    const later = new Date('2026-04-30T12:00:00');
    const plan = buildReminderPlan({ settings: settings({ fertile: true }), predictions, now: later });
    expect(plan.every((p) => p.date.getTime() > later.getTime())).toBe(true);
  });

  it('nextDaily rolls over to tomorrow', () => {
    expect(local(nextDaily(new Date('2026-03-02T21:00:00'), '21:00'))).toBe('2026-03-03 21:00');
    expect(local(nextDaily(new Date('2026-03-02T20:59:00'), '21:00'))).toBe('2026-03-02 21:00');
  });
});

describe('scheduler (mocked expo-notifications)', () => {
  function fake(granted = true) {
    const scheduled = new Map<string, unknown>([
      ['bloom-cycle:old', {}],
      ['someone-else:keep', {}],
    ]);
    const m = {
      AndroidImportance: { DEFAULT: 3 },
      AndroidNotificationVisibility: { PRIVATE: 0, PUBLIC: 1 },
      SchedulableTriggerInputTypes: { DAILY: 'daily', DATE: 'date' },
      setNotificationHandler: jest.fn(),
      setNotificationChannelAsync: jest.fn(async () => null),
      getPermissionsAsync: jest.fn(async () => ({ granted, status: granted ? 'granted' : 'undetermined', canAskAgain: true })),
      requestPermissionsAsync: jest.fn(async () => ({ granted: true, status: 'granted', canAskAgain: true })),
      getAllScheduledNotificationsAsync: jest.fn(async () => Array.from(scheduled.keys()).map((identifier) => ({ identifier }))),
      cancelScheduledNotificationAsync: jest.fn(async (id: string) => void scheduled.delete(id)),
      scheduleNotificationAsync: jest.fn(async (r: { identifier: string }) => {
        scheduled.set(r.identifier, r);
        return r.identifier;
      }),
    };
    __setNotificationsModule(m as never);
    return { m, scheduled };
  }
  afterEach(() => __setNotificationsModule(undefined));

  const plan = buildReminderPlan({ settings: settings({ logDay: true }), predictions, now });

  it('cancels only Bloom cycle ids, then schedules the plan on the "cycle" channel (idempotent)', async () => {
    const { m, scheduled } = fake();
    const r1 = await applyReminderPlan(plan, { discreet: true });
    expect(r1.cancelled).toBe(1);
    expect(r1.scheduled).toHaveLength(plan.length);
    expect(scheduled.has('someone-else:keep')).toBe(true);
    expect(m.setNotificationChannelAsync).toHaveBeenCalledWith('cycle', expect.objectContaining({ name: 'Cycle reminders' }));
    const daily = m.scheduleNotificationAsync.mock.calls.map((c) => c[0] as { identifier: string; trigger: { type: string; channelId: string } }).find((c) => c.identifier.endsWith('logDay'))!;
    expect(daily.trigger).toMatchObject({ type: 'daily', hour: 21, minute: 0, channelId: 'cycle' });
    const sizeAfterFirst = scheduled.size;
    await applyReminderPlan(plan, { discreet: true });
    expect(scheduled.size).toBe(sizeAfterFirst);
    expect(m.requestPermissionsAsync).not.toHaveBeenCalled();
  });

  it('never prompts for permission while scheduling; skips without it', async () => {
    const { m } = fake(false);
    const r = await applyReminderPlan(plan, { discreet: true });
    expect(r.skipped).toBe('no-permission');
    expect(m.scheduleNotificationAsync).not.toHaveBeenCalled();
    expect(m.requestPermissionsAsync).not.toHaveBeenCalled();
  });

  it('requestReminderPermission creates the channel first, then asks', async () => {
    const { m } = fake(false);
    expect(await requestReminderPermission(true)).toBe('granted');
    const chOrder = m.setNotificationChannelAsync.mock.invocationCallOrder[0];
    const reqOrder = m.requestPermissionsAsync.mock.invocationCallOrder[0];
    expect(chOrder).toBeLessThan(reqOrder);
  });
});

describe('reminder sync', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { setDriver } = require('../src/db/driver') as typeof import('../src/db/driver');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { memoryDriver } = require('../test-utils/memoryDriver') as typeof import('../test-utils/memoryDriver');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const sync = require('../src/notify/sync') as typeof import('../src/notify/sync');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const store = require('../src/cycle/store') as typeof import('../src/cycle/store');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const repos = require('../src/db/repos') as typeof import('../src/db/repos');

  const mk = () => {
    const ids = new Set<string>();
    const m = {
      AndroidImportance: { DEFAULT: 3 },
      AndroidNotificationVisibility: { PRIVATE: 0, PUBLIC: 1 },
      SchedulableTriggerInputTypes: { DAILY: 'daily', DATE: 'date' },
      setNotificationHandler: jest.fn(),
      setNotificationChannelAsync: jest.fn(async () => null),
      getPermissionsAsync: jest.fn(async () => ({ granted: true, status: 'granted', canAskAgain: true })),
      requestPermissionsAsync: jest.fn(),
      getAllScheduledNotificationsAsync: jest.fn(async () => Array.from(ids).map((identifier) => ({ identifier }))),
      cancelScheduledNotificationAsync: jest.fn(async (id: string) => void ids.delete(id)),
      scheduleNotificationAsync: jest.fn(async (r: { identifier: string }) => (ids.add(r.identifier), r.identifier)),
    };
    __setNotificationsModule(m as never);
    return { m, ids };
  };
  const ctx = { mode: 'live' as const, granted: new Set<never>() };

  beforeEach(() => {
    setDriver(memoryDriver());
    sync.__resetReminderSync();
  });
  afterEach(() => __setNotificationsModule(undefined));

  it('reschedules from logs and settings; skips the native module when all off', async () => {
    const { m, ids } = mk();
    await store.saveCycleSettings({ reminders: { periodSoon: false, late: false } });
    await sync.rescheduleCycleReminders(ctx);
    expect(m.getAllScheduledNotificationsAsync).not.toHaveBeenCalled();

    await repos.periods.add({ startDay: '2026-10-10', endDay: '2026-10-14' });
    await store.saveCycleSettings({ reminders: { periodSoon: true, logDay: true } });
    const r = await sync.rescheduleCycleReminders(ctx);
    expect(r!.scheduled.length).toBeGreaterThan(1);
    expect(Array.from(ids).every((id) => id.startsWith(REMINDER_PREFIX))).toBe(true);

    await store.saveCycleSettings({ reminders: { periodSoon: false, logDay: false } });
    await sync.rescheduleCycleReminders(ctx);
    expect(ids.size).toBe(0);
  });

  it('never schedules in demo mode', async () => {
    const { m } = mk();
    expect(await sync.rescheduleCycleReminders({ ...ctx, mode: 'demo' })).toBeNull();
    expect(m.getAllScheduledNotificationsAsync).not.toHaveBeenCalled();
  });
});
