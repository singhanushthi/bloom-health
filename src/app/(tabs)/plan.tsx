/**
 * Plan: four calm segments, each with one primary action.
 *   Overview  goal progress hero, today's targets, plan updates, optional AI weekly plan
 *   Food      today's food (range + macros), Log food, meals, next meal ideas, water, Kitchen
 *   Activity  today's activity, Log activity, weekly yoga goal
 *   Weight    trend chart, Log weight, recent entries
 * The last selected segment is remembered on the phone. Friendly, flexible language throughout.
 */
import { router } from 'expo-router';
import { CalendarCheck, Pencil, Plus, Sparkles } from 'lucide-react-native';
import React, { useState } from 'react';
import { Pressable, Switch, useWindowDimensions, View } from 'react-native';
import { useCoach } from '../../ai/CoachState';
import { needsAiSetup } from '../../ai/key';
import { DemoBanner } from '../../components/DemoBanner';
import { Screen } from '../../components/Screen';
import { Button, Card, CardSkeleton, IconButton, SectionHeader, Segmented, Text, TextButton } from '../../components/ui';
import { usePlanSegment, PLAN_SEGMENTS } from '../../components/usePref';
import { MEAL_LABEL, MEALS } from '../../db/repos';
import { formatDay, todayKey } from '../../health/dates';
import { appName } from '../../health/sources';
import { logFood, setWater } from '../../plan/actions';
import { mealSlotFor } from '../../plan/adapt';
import { WEEKLY_PLAN_DISCLAIMER, WEEKLY_PLAN_SYSTEM, weeklyPlanPrompt } from '../../plan/aiPlan';
import type { PlanState } from '../../plan/data';
import { scale } from '../../plan/foodPick';
import { ACTIVITY_LABEL, type ActivityType } from '../../plan/met';
import { usePlan } from '../../plan/usePlan';
import { FoodSummaryCard } from '../../plan/ui/FoodSummary';
import { InfoNote, WaterGlasses, fmtKg, formatShortDay } from '../../plan/ui/parts';
import { PlanSetupCard } from '../../plan/ui/TodayCards';
import { WeightChart } from '../../plan/ui/WeightChart';
import { KitchenEntryCard } from '../../kitchen/ui/KitchenEntryCard';
import { radius, space, touch } from '../../theme/tokens';
import { useTheme } from '../../theme/useTheme';

export default function PlanScreen() {
  const { state, loading, error, reload } = usePlan();
  const [segment, setSegment] = usePlanSegment();
  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = async () => {
    setRefreshing(true);
    await reload();
    setRefreshing(false);
  };
  return (
    <Screen tabBar refreshing={refreshing} onRefresh={onRefresh} contentStyle={{ gap: space.sm }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
        <View style={{ flex: 1 }}>
          <Text variant="caption" tone="muted">
            Gentle and flexible
          </Text>
          <Text variant="title" accessibilityRole="header">
            Your plan
          </Text>
        </View>
        {state?.profile ? <IconButton icon={Pencil} accessibilityLabel="Edit goal" onPress={() => router.push('/onboarding/profile?edit=1')} /> : null}
      </View>
      <Segmented options={PLAN_SEGMENTS} value={segment} onChange={setSegment} accessibilityLabel="Plan sections" />
      <DemoBanner />
      {error ? <Text tone="danger">Couldn’t load your plan. Pull down to try again.</Text> : null}
      {loading && !state ? (
        <>
          <CardSkeleton label="plan" height={200} />
          <CardSkeleton label="targets" height={160} />
        </>
      ) : state ? (
        segment === 'food' ? (
          <FoodSegment state={state} />
        ) : segment === 'activity' ? (
          <ActivitySegment state={state} />
        ) : segment === 'weight' ? (
          <WeightSegment state={state} />
        ) : (
          <OverviewSegment state={state} />
        )
      ) : null}
    </Screen>
  );
}

/* -------------------------------- Overview -------------------------------- */

function OverviewSegment({ state }: { state: PlanState }) {
  return (
    <>
      {state.profile ? <HeroCard state={state} /> : <PlanSetupCard />}
      <TargetsCard state={state} />
      {state.profile ? (
        <>
          <SectionHeader label="Plan updates" />
          <UpdatesCard state={state} />
        </>
      ) : null}
      <SectionHeader label="Weekly plan · AI" />
      <WeeklyPlanCard state={state} primary={!!state.profile} />
    </>
  );
}

function TargetsCard({ state }: { state: PlanState }) {
  const t = state.plan?.targets ?? null;
  if (!t || !state.allowance) return null;
  return (
    <>
      <SectionHeader label="Today’s targets" />
      <Card>
        <View
          accessible
          accessibilityLabel={`Today's targets. Aim around ${state.allowance.min} to ${state.allowance.max} kilocalories. Protein about ${t.proteinG} grams. Fibre ${t.fibreG} grams. Water ${(t.waterMl / 1000).toFixed(1)} litres. Steps ${t.steps}. Weekly flex ${t.flexWeeklyKcal} kilocalories for treats.`}
        >
          <Text variant="displaySm">
            {state.allowance.min.toLocaleString()}–{state.allowance.max.toLocaleString()} kcal
          </Text>
          <Text tone="muted">Aim around this — a little room either way is completely fine.</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.xs, marginTop: space.sm }}>
            <Pill text={`Protein ~${t.proteinG} g`} />
            <Pill text={`Fibre ${t.fibreG} g`} />
            <Pill text={`Water ${(t.waterMl / 1000).toFixed(1)} L`} />
            <Pill text={`${t.steps.toLocaleString()} steps`} />
          </View>
          <Text variant="caption" tone="muted" style={{ marginTop: space.sm }}>
            Weekly flex: ~{t.flexWeeklyKcal} kcal for treats — enjoy them, it’s part of the plan.
            {state.adjustKcal ? ` Includes ${state.adjustKcal > 0 ? '+' : ''}${state.adjustKcal} kcal from weekly updates.` : ''}
          </Text>
        </View>
      </Card>
    </>
  );
}

/* ---------------------------------- Food ---------------------------------- */

function FoodSegment({ state }: { state: PlanState }) {
  return (
    <>
      <FoodSummaryCard state={state} />
      <Button label="Log food" icon={Plus} onPress={() => router.push('/food/add')} />
      <SectionHeader
        label="Today’s meals"
        action={<TextButton label="Food diary" onPress={() => router.push('/food')} accessibilityHint="Opens today's food with edit and delete" />}
      />
      <MealsCard state={state} />
      {state.plan?.targets ? (
        <>
          <SectionHeader label="Next meal ideas" />
          <IdeasCard state={state} />
        </>
      ) : null}
      <SectionHeader label="Water" />
      <Card>
        <WaterGlasses ml={state.waterMl} goalMl={state.plan?.targets?.waterMl ?? 2000} onChange={(ml) => void setWater(state.today, ml)} />
      </Card>
      <SectionHeader label="Kitchen" />
      <KitchenEntryCard diet={state.profile?.diet ?? null} />
    </>
  );
}

function MealsCard({ state }: { state: PlanState }) {
  const { c } = useTheme();
  return (
    <Card style={{ paddingVertical: space.xs }}>
      {MEALS.map((m, i) => {
        const list = state.food.filter((f) => f.meal === m);
        const kcal = Math.round(list.reduce((s, f) => s + f.kcal, 0));
        const names = list.map((f) => f.name).join(', ');
        return (
          <Pressable
            key={m}
            onPress={() => router.push(`/food/add?meal=${m}`)}
            accessibilityRole="button"
            accessibilityLabel={`${MEAL_LABEL[m]}: ${list.length ? `${kcal} kilocalories, ${names}` : 'nothing logged'}. Add food to ${MEAL_LABEL[m]}`}
            android_ripple={{ color: c.line }}
            style={({ pressed }) => ({
              flexDirection: 'row',
              alignItems: 'center',
              gap: space.sm,
              minHeight: 56,
              paddingVertical: space.xs,
              borderTopWidth: i ? 1 : 0,
              borderTopColor: c.line,
              opacity: pressed ? 0.7 : 1,
            })}
          >
            <View style={{ flex: 1 }}>
              <Text variant="bodyStrong">{MEAL_LABEL[m]}</Text>
              <Text variant="caption" tone="muted" numberOfLines={1}>
                {list.length ? names : 'Nothing yet'}
              </Text>
            </View>
            {list.length ? <Text variant="bodyStrong">{kcal} kcal</Text> : null}
            <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: c.surfaceAlt, alignItems: 'center', justifyContent: 'center' }}>
              <Plus size={16} color={c.ink} />
            </View>
          </Pressable>
        );
      })}
    </Card>
  );
}

/* -------------------------------- Activity -------------------------------- */

const ACT_SOURCE: Record<string, string> = { manual: 'Logged in Bloom', 'bloom-yoga': 'Bloom Yoga' };

function ActivitySegment({ state }: { state: PlanState }) {
  const kcal = Math.round(state.exerciseKcal);
  const rows = [
    ...state.activities.map((a) => ({
      key: `a${a.id}`,
      title: a.title ?? ACTIVITY_LABEL[a.type as ActivityType] ?? a.type,
      detail: `${a.minutes} min · ~${Math.round(a.kcal)} kcal · ${ACT_SOURCE[a.source] ?? appName(a.source)}`,
    })),
    ...state.hcSessions.map((h, i) => ({ key: `h${i}`, title: h.title, detail: `${h.minutes} min · ${appName(h.source)}` })),
  ];
  return (
    <>
      <Card>
        <View accessible accessibilityLabel={`Activity today: ${state.activityMinutes} minutes, about ${kcal} kilocalories extra burn.`}>
          <View style={{ flexDirection: 'row', gap: space.xl }}>
            <View>
              <Text variant="display">{state.activityMinutes}</Text>
              <Text variant="caption" tone="muted">
                active minutes
              </Text>
            </View>
            <View>
              <Text variant="display">{kcal}</Text>
              <Text variant="caption" tone="muted">
                kcal extra burn
              </Text>
            </View>
          </View>
          <Text variant="caption" tone="muted" style={{ marginTop: space.xs }}>
            Half of it is added to today’s food allowance.
          </Text>
        </View>
      </Card>
      <Button label="Log activity" icon={Plus} onPress={() => router.push('/activity/add')} />
      <SectionHeader
        label="Today’s activities"
        action={<TextButton label="See today" onPress={() => router.push('/activity')} accessibilityHint="Opens today's activities with edit and delete" />}
      />
      <Card style={{ paddingVertical: rows.length ? space.xs : undefined }}>
        {rows.length ? (
          rows.map((r, i) => <ListRow key={r.key} title={r.title} detail={r.detail} first={i === 0} />)
        ) : (
          <Text tone="muted">Nothing logged yet today — a short walk counts too.</Text>
        )}
      </Card>
      <YogaCard state={state} />
    </>
  );
}

/* --------------------------------- Weight --------------------------------- */

function WeightSegment({ state }: { state: PlanState }) {
  const { c } = useTheme();
  const { width } = useWindowDimensions();
  const [showNight, setShowNight] = useState(false);
  const chartW = Math.min(width, 640) - space.md * 2 - (space.md + space.xxs) * 2;
  const recent = [...state.weights].reverse().slice(0, 5);
  return (
    <>
      <Card>
        <WeightChart points={state.weights} today={state.today} targetKg={state.profile?.targetKg ?? null} showNight={showNight} width={chartW} />
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, minHeight: 48, marginTop: space.xs }}>
          <Text style={{ flex: 1 }} nativeID="nightToggle">
            Show night weights
          </Text>
          <Switch
            value={showNight}
            onValueChange={setShowNight}
            accessibilityLabel="Show night weights"
            trackColor={{ false: c.line, true: c.spo2 }}
            thumbColor={c.surface}
            style={{ minWidth: 48, minHeight: 48 }}
          />
        </View>
        <Text variant="caption" tone="muted">
          Only morning weights drive the trend — night weight is usually 0.5–1.5 kg higher from the day’s food and water.
        </Text>
        {state.cycleNote ? (
          <View style={{ marginTop: space.sm }}>
            <InfoNote tint={c.cycleSoft} accent={c.cycle}>
              {state.cycleNote}
            </InfoNote>
          </View>
        ) : null}
      </Card>
      <Button label="Log weight" icon={Plus} onPress={() => router.push('/weight')} />
      <SectionHeader
        label="Recent entries"
        action={recent.length ? <TextButton label="Edit entries" onPress={() => router.push('/weight')} /> : undefined}
      />
      <Card style={{ paddingVertical: recent.length ? space.xs : undefined }}>
        {recent.length ? (
          recent.map((w, i) => (
            <ListRow
              key={`${w.day}-${w.slot}-${w.id ?? i}`}
              first={i === 0}
              title={fmtKg(w.kg)}
              detail={`${formatShortDay(w.day)} · ${w.slot === 'night' ? 'Night' : 'Morning'}${w.source && w.source !== 'bloom' ? ` · ${appName(w.source)}` : ''}`}
            />
          ))
        ) : (
          <Text tone="muted">No weights yet. Weigh in the morning, after the bathroom and before breakfast.</Text>
        )}
      </Card>
    </>
  );
}

function ListRow({ title, detail, first }: { title: string; detail: string; first?: boolean }) {
  const { c } = useTheme();
  return (
    <View
      accessible
      accessibilityLabel={`${title}, ${detail}`}
      style={{ minHeight: touch.min + 4, justifyContent: 'center', paddingVertical: space.xs, borderTopWidth: first ? 0 : 1, borderTopColor: c.line }}
    >
      <Text variant="bodyStrong">{title}</Text>
      <Text variant="caption" tone="muted">
        {detail}
      </Text>
    </View>
  );
}

function Pill({ text }: { text: string }) {
  const { c } = useTheme();
  return (
    <View style={{ backgroundColor: c.surfaceAlt, borderRadius: radius.pill, paddingHorizontal: space.sm, paddingVertical: 6 }}>
      <Text variant="caption">{text}</Text>
    </View>
  );
}

function HeroCard({ state }: { state: PlanState }) {
  const { c } = useTheme();
  const p = state.profile!;
  const pr = state.progress;
  const plan = state.plan;
  const goalText =
    plan?.mode === 'lose' ? 'Losing gently' : plan?.mode === 'gain' ? 'Gaining gently' : 'Maintaining';
  const label = pr
    ? `${goalText}. Start ${pr.startKg.toFixed(1)} kilograms, now ${pr.nowKg.toFixed(1)}, target ${pr.targetKg.toFixed(1)}. ${pr.toGoKg} kilograms to go, ${pr.percent} percent done.${
        plan?.goalDay ? ` Projected around ${formatDay(plan.goalDay, { day: 'numeric', month: 'long', year: 'numeric' })}.` : ''
      }`
    : goalText;
  return (
    <Card tint={c.cycleSoft}>
      <View accessible accessibilityLabel={label}>
        <Text variant="label" tone="muted">
          {goalText.toUpperCase()}
          {plan && plan.paceKgWeek > 0 ? ` · ~${plan.paceKgWeek} KG/WEEK` : ''}
        </Text>
        {pr ? (
          <>
            <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', marginTop: space.sm }}>
              <Stat label="Start" value={pr.startKg.toFixed(1)} />
              <Stat label="Now" value={pr.nowKg.toFixed(1)} big />
              <Stat label="Target" value={pr.targetKg.toFixed(1)} />
            </View>
            <View style={{ height: 12, borderRadius: 6, backgroundColor: c.surface, marginTop: space.md, overflow: 'hidden' }}>
              <View style={{ width: `${pr.percent}%`, height: '100%', backgroundColor: c.cycle, borderRadius: 6 }} />
            </View>
            <Text style={{ marginTop: space.xs }}>
              <Text variant="bodyStrong">{pr.percent}% done</Text> · {fmtKg(pr.toGoKg)} to go
              {plan?.goalDay ? ` · around ${formatDay(plan.goalDay, { day: 'numeric', month: 'short', year: 'numeric' })}` : ''}
            </Text>
          </>
        ) : null}
        {plan?.minor ? (
          <Text style={{ marginTop: space.sm }}>Bloom’s plans are for adults — please plan with a doctor or parent. Tracking still works.</Text>
        ) : null}
        {plan?.notes.filter((n) => !n.startsWith('Bloom’s plans')).map((n) => (
          <Text key={n} variant="caption" style={{ marginTop: space.xs }}>
            {n}
          </Text>
        ))}
      </View>
    </Card>
  );
}

function Stat({ label, value, big }: { label: string; value: string; big?: boolean }) {
  return (
    <View style={{ alignItems: 'center' }}>
      <Text variant={big ? 'display' : 'displaySm'}>{value}</Text>
      <Text variant="caption" tone="muted">
        {label} · kg
      </Text>
    </View>
  );
}

function IdeasCard({ state }: { state: PlanState }) {
  const { c } = useTheme();
  const [added, setAdded] = useState<string | null>(null);
  if (!state.plan?.targets) return null;
  const left = state.allowance ? state.allowance.kcal - state.totals.kcal : 0;
  return (
    <Card>
      {state.ideas.length ? (
        <View style={{ gap: space.xs }}>
          <Text tone="muted">About {Math.max(0, Math.round(left))} kcal left today. A few ideas that fit:</Text>
          {state.ideas.map((idea) => (
            <View key={idea.title} style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingVertical: 4 }}>
              <View accessible accessibilityLabel={`${idea.title}: about ${idea.kcal} kilocalories, ${idea.protein} grams protein. ${idea.why}.`} style={{ flex: 1 }}>
                <Text variant="bodyStrong">{idea.title}</Text>
                <Text variant="caption" tone="muted">
                  ~{idea.kcal} kcal · {idea.protein} g protein · {idea.why}
                </Text>
              </View>
              <IconButton
                icon={Plus}
                accessibilityLabel={`Log ${idea.title}`}
                onPress={async () => {
                  const meal = mealSlotFor(new Date().getHours());
                  for (const it of idea.items) {
                    const n = scale({ ...it.food.per, fiber: it.food.per.fiber ?? 0 }, it.servings);
                    await logFood({ day: todayKey(), meal, foodKey: `db:${it.food.id}`, name: it.food.name, servings: it.servings, grams: null, ...n, source: 'db' });
                  }
                  setAdded(`Logged ${idea.title}.`);
                }}
              />
            </View>
          ))}
          {added ? (
            <Text variant="caption" accessibilityLiveRegion="polite">
              {added}
            </Text>
          ) : null}
        </View>
      ) : (
        <Text tone="muted">You’ve about reached today’s range — if you’re hungry, fruit, salad or buttermilk are light options.</Text>
      )}
    </Card>
  );
}

function YogaCard({ state }: { state: PlanState }) {
  const { c } = useTheme();
  const goal = state.profile?.yogaPerWeek ?? 4;
  const done = state.yogaThisWeek;
  if (!goal) return null;
  return (
    <>
    <SectionHeader label="Yoga · last 7 days" />
    <Card>
      <View accessible accessibilityLabel={`Yoga, last 7 days: ${done} of ${goal} sessions${done >= goal ? ', goal met' : ''}.`}>
        <Text variant="displaySm">
          {done} of {goal} sessions{done >= goal ? ' ✓' : ''}
        </Text>
        <View style={{ flexDirection: 'row', gap: space.xs, marginTop: space.sm }}>
          {Array.from({ length: Math.max(goal, done) }, (_, i) => (
            <View
              key={i}
              style={{
                width: 28,
                height: 28,
                borderRadius: 14,
                borderWidth: 2,
                borderStyle: i < done ? 'solid' : 'dashed',
                borderColor: i < done ? c.sleep : c.muted,
                backgroundColor: i < done ? c.sleepSoft : 'transparent',
              }}
            />
          ))}
        </View>
        <Text variant="caption" tone="muted" style={{ marginTop: space.xs }}>
          Sessions from the Yoga tab count automatically.
        </Text>
      </View>
      <TextButton label="Open Yoga" onPress={() => router.push('/(tabs)/yoga')} style={{ marginTop: space.xxs }} />
    </Card>
    </>
  );
}

function UpdatesCard({ state }: { state: PlanState }) {
  const { c } = useTheme();
  if (!state.profile) return null;
  const list = [...state.adjustments].reverse();
  return (
    <Card>
      {list.length ? (
        list.map((a, i) => (
          <View key={a.weekStart} style={{ flexDirection: 'row', gap: space.xs, paddingVertical: space.xs, borderTopWidth: i ? 1 : 0, borderTopColor: c.line }}>
            <CalendarCheck size={18} color={a.deltaKcal ? c.cycle : c.muted} style={{ marginTop: 3 }} />
            <Text style={{ flex: 1 }}>
              {a.reason}
              {a.deltaKcal ? ` (${a.deltaKcal > 0 ? '+' : ''}${a.deltaKcal} kcal)` : ''}
            </Text>
          </View>
        ))
      ) : (
        <Text tone="muted">
          Each week Bloom checks your morning trend (4 weigh-ins are enough) and gently adjusts your plan by 100 kcal if needed.
        </Text>
      )}
    </Card>
  );
}

function WeeklyPlanCard({ state, primary }: { state: PlanState; primary: boolean }) {
  const { c } = useTheme();
  const coach = useCoach();
  const [text, setText] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [needsSetup, setNeedsSetup] = useState(false);
  const ask = async () => {
    setBusy(true);
    setError(null);
    setNeedsSetup(false);
    try {
      const r = await coach.ask({ system: WEEKLY_PLAN_SYSTEM, turns: [{ role: 'user', text: weeklyPlanPrompt(state) }], onText: setText });
      setText(r.text);
    } catch (e) {
      setNeedsSetup(needsAiSetup(e));
      setError(e instanceof Error ? e.message : 'Couldn’t make a plan right now.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <Card tint={c.sleepSoft}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.xs, marginBottom: space.xxs }}>
        <Sparkles size={18} color={c.sleep} />
        <Text variant="bodyStrong">Ask Bloom for a weekly plan</Text>
      </View>
      {coach.hasKey ? (
        <>
          <Text tone="muted">A simple 7-day Indian meal and yoga outline from your goal and recent logs — flexible, with a treat built in.</Text>
          <Button
            label={text ? 'Make a new plan' : 'Make my weekly plan'}
            variant={primary ? 'primary' : 'secondary'}
            icon={Sparkles}
            onPress={ask}
            loading={busy}
            style={{ marginTop: space.sm }}
          />
          {error ? (
            <Text tone="danger" accessibilityLiveRegion="polite" style={{ marginTop: space.xs }}>
              {error}
            </Text>
          ) : null}
          {error && needsSetup ? (
            <TextButton label="Set up AI Coach" onPress={() => router.push('/settings/ai')} accessibilityHint="Opens AI Coach setup" style={{ marginTop: space.xxs }} />
          ) : null}
          {text ? (
            <View style={{ marginTop: space.md, gap: space.xs }}>
              <Text>{text}</Text>
              <Text variant="caption" tone="muted">
                {WEEKLY_PLAN_DISCLAIMER} Your goal, ranges and recent food names are sent to Google to make this.
              </Text>
            </View>
          ) : null}
        </>
      ) : (
        <>
          <Text tone="muted">Add your free Gemini key in Settings → AI Coach to get a friendly weekly meal and yoga outline.</Text>
          <TextButton label="Set up AI Coach" onPress={() => router.push('/settings/ai')} accessibilityHint="Opens Settings, AI Coach, to add your Gemini key" style={{ marginTop: space.xxs }} />
        </>
      )}
    </Card>
  );
}
