/**
 * Today dashboard. Shows only the areas chosen in onboarding/settings, a small "Ask Bloom"
 * card (AI coach), compact plan cards (weight, food, activity), today's yoga, and one floating
 * "Log" button that opens the action sheet. Settings opens from the gear in the header.
 */
import { router, useFocusEffect } from 'expo-router';
import { ChevronRight, Settings, Sparkles } from 'lucide-react-native';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, View } from 'react-native';
import { ActivityCard, CycleCard, HeartCard, SleepCard, Spo2Card } from '../../components/cards';
import { DemoBanner } from '../../components/DemoBanner';
import { Screen } from '../../components/Screen';
import { LogFab } from '../../components/sheets/LogSheets';
import { IconButton, Text } from '../../components/ui';
import {
  getActivityToday,
  getCycleStatus,
  getHeartToday,
  getLastNightSleep,
  getLatestSpo2,
} from '../../health';
import { useMetric } from '../../hooks/useMetric';
import { usePlan } from '../../plan/usePlan';
import { ActivityTodayCard, FoodTodayCard, PlanSetupCard, WeightTodayCard } from '../../plan/ui/TodayCards';
import { TodayYogaCard } from '../../yoga/TodayYogaCard';
import { useStepSensor } from '../../sensors/StepSensor';
import { useAppState } from '../../state/AppState';
import { radius, space, touch } from '../../theme/tokens';
import { useTheme } from '../../theme/useTheme';

function greeting(d: Date) {
  const h = d.getHours();
  if (h < 5) return 'Good night';
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

export default function Today() {
  const { stepGoal, tracks } = useAppState();
  const sensor = useStepSensor();
  const cycle = useMetric(getCycleStatus);
  const activity = useMetric(getActivityToday);
  const sleep = useMetric(getLastNightSleep);
  const heart = useMetric(getHeartToday);
  const spo2 = useMetric(getLatestSpo2);
  const plan = usePlan();
  const [refreshing, setRefreshing] = useState(false);

  const reloadAll = useCallback(async () => {
    await Promise.all([cycle.reload(), activity.reload(), sleep.reload(), heart.reload(), spo2.reload(), plan.reload()]);
  }, [cycle, activity, sleep, heart, spo2, plan]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await reloadAll();
    setRefreshing(false);
  }, [reloadAll]);

  // Live step count: re-read activity whenever the foreground sensor saves steps.
  const reloadActivity = useRef(activity.reload);
  reloadActivity.current = activity.reload;
  useEffect(() => sensor.onSaved(() => void reloadActivity.current()), [sensor]);

  // Refresh steps when returning to the tab (skip the first focus — useMetric already loaded).
  const first = useRef(true);
  useFocusEffect(
    useCallback(() => {
      if (first.current) {
        first.current = false;
        return;
      }
      reloadActivity.current();
    }, [])
  );

  const now = new Date();
  const dateText = now.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' });
  const show = (t: (typeof tracks)[number]) => tracks.includes(t);

  return (
    <View style={{ flex: 1 }}>
      <Screen refreshing={refreshing} onRefresh={onRefresh} contentStyle={{ paddingBottom: 112 }}>
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: space.sm }}>
          <View accessible accessibilityRole="header" accessibilityLabel={`${greeting(now)}. ${dateText}`} style={{ flex: 1 }}>
            <Text variant="caption" tone="muted">
              {dateText}
            </Text>
            <Text variant="display">{greeting(now)}</Text>
          </View>
          <IconButton icon={Settings} accessibilityLabel="Settings" onPress={() => router.push('/settings')} />
        </View>
        <DemoBanner />
        <AskBloomCard />
        {plan.state && !plan.state.profile ? <PlanSetupCard /> : null}
        <WeightTodayCard state={plan.state} loading={plan.loading} />
        <FoodTodayCard state={plan.state} loading={plan.loading} />
        <ActivityTodayCard state={plan.state} loading={plan.loading} />
        <TodayYogaCard />
        {show('cycle') ? <CycleCard loading={cycle.loading} result={cycle.result} /> : null}
        {show('steps') ? <ActivityCard loading={activity.loading} result={activity.result} goal={stepGoal} /> : null}
        {show('sleep') ? <SleepCard loading={sleep.loading} result={sleep.result} /> : null}
        {show('heart') ? (
          <>
            <HeartCard loading={heart.loading} result={heart.result} />
            <Spo2Card loading={spo2.loading} result={spo2.result} />
          </>
        ) : null}
      </Screen>
      <LogFab />
    </View>
  );
}

function AskBloomCard() {
  const { c } = useTheme();
  return (
    <Pressable
      onPress={() => router.push('/coach')}
      accessibilityRole="button"
      accessibilityLabel="Ask Bloom, your AI coach"
      accessibilityHint="Opens a chat that explains your data in plain language"
      android_ripple={{ color: c.line }}
      style={({ pressed }) => ({
        minHeight: touch.min + 12,
        flexDirection: 'row',
        alignItems: 'center',
        gap: space.sm,
        paddingHorizontal: space.md,
        paddingVertical: space.sm,
        borderRadius: radius.card,
        backgroundColor: c.sleepSoft,
        opacity: pressed ? 0.85 : 1,
      })}
    >
      <Sparkles size={22} color={c.sleep} />
      <View style={{ flex: 1 }}>
        <Text variant="bodyStrong">Ask Bloom</Text>
        <Text variant="caption" tone="muted">
          Morning brief, weekly review or any question about your data
        </Text>
      </View>
      <ChevronRight size={20} color={c.muted} />
    </Pressable>
  );
}
