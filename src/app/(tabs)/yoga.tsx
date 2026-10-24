/**
 * Yoga tab: level, today's session, streak + weekly goal, goal filters, the session
 * library, multi-day programs and history. All content is Bloom's own.
 */
import { router } from 'expo-router';
import {
  CalendarCheck,
  ChevronDown,
  ChevronUp,
  CircleCheck,
  Circle as CircleIcon,
  Clock,
  Flame,
  Flower2,
  Layers,
  Minus,
  Plus,
  Target,
} from 'lucide-react-native';
import React, { useMemo, useState } from 'react';
import { Alert, Pressable, View } from 'react-native';
import { Screen } from '../../components/Screen';
import { ToggleChip } from '../../components/sheets/Sheet';
import { Button, Card, CardHeader, Chip, IconButton, Segmented, Skeleton, Text } from '../../components/ui';
import { SESSIONS, type YogaLevel, type YogaSession } from '../../content/yoga';
import { formatDay, todayKey } from '../../health/dates';
import { radius, space, touch } from '../../theme/tokens';
import { useTheme } from '../../theme/useTheme';
import { useOnPeriod, useYogaHistory, useYogaPrefs } from '../../yoga/hooks';
import {
  FEEL_LABEL,
  GOALS,
  GOAL_LABEL,
  LEVELS,
  LEVEL_LABEL,
  WEEKLY_GOAL_MAX,
  WEEKLY_GOAL_MIN,
  computeStreak,
  poseCount,
  sessionsThisWeek,
  type YogaGoal,
} from '../../yoga/logic';
import { PROGRAMS, nextProgramDay, programSession, type YogaProgram } from '../../yoga/programs';
import { TodayYogaCard } from '../../yoga/TodayYogaCard';

export default function YogaScreen() {
  const { c } = useTheme();
  const { prefs, loaded, update } = useYogaPrefs();
  const history = useYogaHistory(20);
  const onPeriod = useOnPeriod();
  const [goal, setGoal] = useState<YogaGoal | null>(null);
  const level: YogaLevel = prefs.level ?? 'beginner';

  const today = todayKey();
  const streak = computeStreak(history.days, today);
  const thisWeek = sessionsThisWeek(history.days, today);

  const list = useMemo(() => {
    const atLevel = SESSIONS.filter((s) => s.level === level && (!goal || s.goal === goal));
    const pool = atLevel.length ? atLevel : goal ? SESSIONS.filter((s) => s.goal === goal) : atLevel;
    const sorted = [...pool].sort((a, b) => {
      if (onPeriod && a.periodFriendly !== b.periodFriendly) return a.periodFriendly ? -1 : 1;
      return a.minutes - b.minutes;
    });
    return { sessions: sorted, otherLevels: !atLevel.length && pool.length > 0 };
  }, [level, goal, onPeriod]);

  return (
    <Screen onRefresh={history.reload} refreshing={false}>
      <Text variant="display" accessibilityRole="header">
        Yoga
      </Text>

      {/* Level */}
      <View style={{ gap: space.xs }}>
        <Text variant="label" tone="muted" style={{ textTransform: 'uppercase' }} nativeID="yoga-level">
          Your level
        </Text>
        <Segmented<YogaLevel>
          accessibilityLabel="Your yoga level"
          value={level}
          onChange={(v) => update({ level: v })}
          options={LEVELS.map((l) => ({ value: l, label: LEVEL_LABEL[l] }))}
        />
        {loaded && prefs.level === null ? (
          <Card tint={c.sleepSoft}>
            <Text variant="bodyStrong">Not sure? Start with Beginner.</Text>
            <Text style={{ marginTop: 2 }}>You can change your level any time, and Bloom will check in as you go.</Text>
            <Button
              label="Start with Beginner"
              variant="secondary"
              onPress={() => update({ level: 'beginner' })}
              style={{ marginTop: space.sm }}
            />
          </Card>
        ) : null}
      </View>

      {/* Today */}
      <TodayYogaCard hero />

      {/* Streak + weekly goal */}
      <View style={{ flexDirection: 'row', gap: space.sm }}>
        <Card style={{ flex: 1 }} accessibilityLabel={`Streak: ${streak} day${streak === 1 ? '' : 's'}`}>
          <CardHeader icon={Flame} label="Streak" accent={c.steps} soft={c.stepsSoft} />
          {history.loading ? (
            <Skeleton height={44} />
          ) : (
            <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6 }}>
              <Text variant="display">{streak}</Text>
              <Text tone="muted">day{streak === 1 ? '' : 's'}</Text>
            </View>
          )}
        </Card>
        <Card style={{ flex: 1 }}>
          <CardHeader icon={Target} label="This week" accent={c.spo2} soft={c.spo2Soft} />
          {history.loading ? (
            <Skeleton height={44} />
          ) : (
            <View
              accessible
              accessibilityLabel={`${thisWeek} of ${prefs.weeklyGoal} sessions this week${thisWeek >= prefs.weeklyGoal ? ', goal reached' : ''}`}
              style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6 }}
            >
              <Text variant="display">{thisWeek}</Text>
              <Text tone="muted">/ {prefs.weeklyGoal}</Text>
              {thisWeek >= prefs.weeklyGoal ? <CircleCheck size={20} color={c.spo2} /> : null}
            </View>
          )}
        </Card>
      </View>
      <Card>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
          <View style={{ flex: 1 }}>
            <Text variant="bodyStrong">Weekly goal</Text>
            <Text tone="muted">
              {prefs.weeklyGoal} session{prefs.weeklyGoal === 1 ? '' : 's'} a week
            </Text>
          </View>
          <IconButton
            icon={Minus}
            accessibilityLabel={`Fewer sessions per week, now ${prefs.weeklyGoal}`}
            disabled={prefs.weeklyGoal <= WEEKLY_GOAL_MIN}
            onPress={() => update({ weeklyGoal: prefs.weeklyGoal - 1 })}
          />
          <IconButton
            icon={Plus}
            accessibilityLabel={`More sessions per week, now ${prefs.weeklyGoal}`}
            disabled={prefs.weeklyGoal >= WEEKLY_GOAL_MAX}
            onPress={() => update({ weeklyGoal: prefs.weeklyGoal + 1 })}
          />
        </View>
      </Card>

      {/* Goals + sessions */}
      <Text variant="title" accessibilityRole="header" style={{ marginTop: space.xs }}>
        Sessions
      </Text>
      <View accessibilityRole="radiogroup" accessibilityLabel="Filter by goal" style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.xs }}>
        <ToggleChip label="All" role="radio" selected={goal === null} onPress={() => setGoal(null)} />
        {GOALS.map((g) => (
          <ToggleChip
            key={g.id}
            role="radio"
            label={g.label}
            selected={goal === g.id}
            onPress={() => setGoal(goal === g.id ? null : g.id)}
            accent={g.id === 'period_relief' ? c.cycle : undefined}
            soft={g.id === 'period_relief' ? c.cycleSoft : undefined}
          />
        ))}
      </View>
      {list.otherLevels ? (
        <Text tone="muted">
          No {GOAL_LABEL[goal!].toLowerCase()} sessions at {LEVEL_LABEL[level]} yet — here are ones from other levels.
        </Text>
      ) : null}
      {list.sessions.length === 0 ? (
        <Card>
          <Text tone="muted">No sessions match. Try another goal.</Text>
        </Card>
      ) : (
        list.sessions.map((s) => <SessionCard key={s.id} session={s} />)
      )}

      {/* Programs */}
      <Text variant="title" accessibilityRole="header" style={{ marginTop: space.xs }}>
        Programs
      </Text>
      {PROGRAMS.map((p) => (
        <ProgramCard
          key={p.id}
          program={p}
          active={prefs.program?.programId === p.id}
          completed={prefs.program?.programId === p.id ? prefs.program.completed : []}
          otherActive={!!prefs.program && prefs.program.programId !== p.id}
          onStart={() => {
            const begin = () => update({ program: { programId: p.id, startedDay: today, completed: [] } });
            if (prefs.program && prefs.program.programId !== p.id) {
              Alert.alert('Switch program?', 'Your progress in the current program will be cleared.', [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Switch', onPress: begin },
              ]);
            } else begin();
          }}
          onLeave={() =>
            Alert.alert('Leave program?', 'Your progress in this program will be cleared.', [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Leave', style: 'destructive', onPress: () => update({ program: null }) },
            ])
          }
        />
      ))}

      {/* History */}
      <Text variant="title" accessibilityRole="header" style={{ marginTop: space.xs }}>
        History
      </Text>
      <Card>
        {history.loading ? (
          <Skeleton height={60} />
        ) : history.entries.length === 0 ? (
          <Text tone="muted">Your finished sessions will show up here.</Text>
        ) : (
          <View style={{ gap: space.sm }}>
            {history.entries.slice(0, 10).map((e) => (
              <View
                key={e.id}
                accessible
                accessibilityLabel={`${formatDay(e.day, { weekday: 'long', day: 'numeric', month: 'long' })}: ${e.title}, ${Math.round(e.minutes)} minutes${e.feel ? `, felt ${FEEL_LABEL[e.feel].toLowerCase()}` : ''}`}
                style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}
              >
                <CalendarCheck size={20} color={c.spo2} />
                <View style={{ flex: 1 }}>
                  <Text variant="bodyStrong">{e.title}</Text>
                  <Text variant="caption" tone="muted">
                    {formatDay(e.day, { weekday: 'short', day: 'numeric', month: 'short' })} · {Math.round(e.minutes)} min
                    {e.feel ? ` · ${FEEL_LABEL[e.feel]}` : ''}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        )}
      </Card>
      <Text variant="caption" tone="muted" style={{ textAlign: 'center' }}>
        Move gently and stop if anything hurts. Your yoga history stays on this phone.
      </Text>
    </Screen>
  );
}

/* ------------------------------ Session card ----------------------------- */

function SessionCard({ session: s }: { session: YogaSession }) {
  const { c } = useTheme();
  const n = poseCount(s);
  return (
    <Pressable
      onPress={() => router.push({ pathname: '/yoga/[id]', params: { id: s.id } })}
      accessibilityRole="button"
      accessibilityLabel={`${s.title}. ${s.minutes} minutes, ${n} poses, ${LEVEL_LABEL[s.level]}${s.periodFriendly ? ', period-friendly' : ''}`}
      accessibilityHint="Opens the session details"
      style={({ pressed }) => ({ opacity: pressed ? 0.9 : 1, transform: [{ scale: pressed ? 0.99 : 1 }] })}
    >
      <Card>
        <Text variant="heading">{s.title}</Text>
        <Text tone="muted" numberOfLines={2} style={{ marginTop: 2 }}>
          {s.description}
        </Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.xs, marginTop: space.sm }}>
          <Chip label={`${s.minutes} min`} icon={Clock} />
          <Chip label={`${n} poses`} icon={Layers} />
          <Chip label={GOAL_LABEL[s.goal]} />
          {s.periodFriendly ? <Chip label="Period-friendly" icon={Flower2} iconColor={c.cycle} bg={c.cycleSoft} /> : null}
        </View>
      </Card>
    </Pressable>
  );
}

/* ------------------------------ Program card ----------------------------- */

function ProgramCard({
  program,
  active,
  completed,
  otherActive,
  onStart,
  onLeave,
}: {
  program: YogaProgram;
  active: boolean;
  completed: number[];
  otherActive: boolean;
  onStart: () => void;
  onLeave: () => void;
}) {
  const { c } = useTheme();
  const [open, setOpen] = useState(active);
  const total = program.days.length;
  const doneCount = completed.length;
  const next = nextProgramDay(program, active ? { programId: program.id, startedDay: '', completed } : null);
  const finished = active && next === null;

  return (
    <Card tint={active ? c.surface : undefined}>
      <CardHeader
        icon={CalendarCheck}
        label={`${total} days · ${LEVEL_LABEL[program.level]}`}
        accent={c.sleep}
        soft={c.sleepSoft}
        right={active ? <Chip label={finished ? 'Finished' : 'In progress'} icon={finished ? CircleCheck : undefined} /> : undefined}
      />
      <Text variant="title" accessibilityRole="header">
        {program.title}
      </Text>
      <Text tone="muted" style={{ marginTop: 2 }}>
        {program.blurb}
      </Text>

      {active ? (
        <View
          accessible
          accessibilityRole="progressbar"
          accessibilityLabel={`${doneCount} of ${total} days done`}
          accessibilityValue={{ min: 0, max: total, now: doneCount }}
          style={{ marginTop: space.sm, gap: 6 }}
        >
          <Text variant="caption">
            {doneCount} of {total} days done
          </Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4 }}>
            {program.days.map((_, i) => {
              const d = completed.includes(i);
              return (
                <View
                  key={i}
                  style={{
                    width: 14,
                    height: 14,
                    borderRadius: 7,
                    backgroundColor: d ? c.sleep : 'transparent',
                    borderWidth: 1.5,
                    borderColor: d ? c.sleep : c.muted,
                  }}
                />
              );
            })}
          </View>
        </View>
      ) : null}

      <View style={{ flexDirection: 'row', gap: space.xs, marginTop: space.md, flexWrap: 'wrap' }}>
        {!active ? (
          <Button
            label={otherActive ? 'Switch to this' : 'Start program'}
            variant={otherActive ? 'secondary' : 'primary'}
            onPress={() => {
              onStart();
              setOpen(true);
            }}
            accessibilityLabel={`Start ${program.title}`}
          />
        ) : next !== null ? (
          <Button
            label={`Day ${next + 1}`}
            accessibilityLabel={`Open day ${next + 1} of ${program.title}`}
            onPress={() => {
              const s = programSession(program, next, SESSIONS);
              if (s) router.push({ pathname: '/yoga/[id]', params: { id: s.id, program: program.id, day: String(next) } });
            }}
          />
        ) : null}
        {active ? <Button label={finished ? 'Close program' : 'Leave'} variant="ghost" onPress={onLeave} /> : null}
      </View>

      <Pressable
        onPress={() => setOpen((v) => !v)}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={`Day by day plan for ${program.title}`}
        style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: touch.min, marginTop: space.xs }}
      >
        <Text variant="bodyStrong">Day by day</Text>
        {open ? <ChevronUp size={22} color={c.ink} /> : <ChevronDown size={22} color={c.ink} />}
      </Pressable>
      {open ? (
        <View style={{ gap: 2 }}>
          {program.days.map((g, i) => {
            const s = programSession(program, i, SESSIONS);
            const d = active && completed.includes(i);
            const isNext = active && next === i;
            return (
              <Pressable
                key={i}
                disabled={!s}
                onPress={() =>
                  s &&
                  router.push({
                    pathname: '/yoga/[id]',
                    params: active ? { id: s.id, program: program.id, day: String(i) } : { id: s.id },
                  })
                }
                accessibilityRole="button"
                accessibilityLabel={`Day ${i + 1}: ${s?.title ?? GOAL_LABEL[g]}${s ? `, ${s.minutes} minutes` : ''}${d ? ', done' : isNext ? ', up next' : ''}`}
                style={({ pressed }) => ({
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: space.sm,
                  minHeight: touch.min,
                  paddingHorizontal: space.xs,
                  borderRadius: radius.chip,
                  backgroundColor: isNext ? c.sleepSoft : 'transparent',
                  opacity: pressed ? 0.8 : 1,
                })}
              >
                {d ? <CircleCheck size={20} color={c.sleep} /> : <CircleIcon size={20} color={c.muted} />}
                <Text variant="caption" tone="muted" style={{ width: 48 }}>
                  Day {i + 1}
                </Text>
                <Text style={{ flex: 1 }} numberOfLines={1}>
                  {s?.title ?? GOAL_LABEL[g]}
                </Text>
                {s ? (
                  <Text variant="caption" tone="muted">
                    {s.minutes} min
                  </Text>
                ) : null}
              </Pressable>
            );
          })}
        </View>
      ) : null}
    </Card>
  );
}
