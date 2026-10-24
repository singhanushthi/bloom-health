/**
 * Today: a calm, glanceable dashboard with one obvious way to log.
 *
 *   Header        date, greeting, Settings gear
 *   At a glance   Steps · Food · Water · Weight tiles (each opens its detail)
 *   Quick log     round buttons: Weight, Food, Water +1 (instant, with undo), Activity, Period, Sleep
 *   Sections      Your cycle · Today's yoga · Move · Sleep & heart · Ask Bloom
 *   Customise     hide/show sections (stored on the phone in the kv table)
 *
 * Sections respect "What you track" (Settings) and "Hide cycle data on Today".
 */
import { router, useFocusEffect } from 'expo-router';
import { Settings, SlidersHorizontal } from 'lucide-react-native';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import { DemoBanner } from '../../components/DemoBanner';
import { Screen } from '../../components/Screen';
import { useLogSheets } from '../../components/sheets/LogSheets';
import { AskBloomCard, CustomiseTodaySheet, GlanceGrid, MoveCard, QuickLogRow, SleepHeartCard } from '../../components/today';
import { Toast, type ToastMsg } from '../../components/Toast';
import { IconButton, SectionHeader, Text, TextButton } from '../../components/ui';
import { useTodayHidden, type TodaySectionId } from '../../components/usePref';
import { useCycleSettings } from '../../cycle/hooks';
import { TodayCycleCard } from '../../cycle/TodayCycleCard';
import { water } from '../../db/repos';
import { getActivityToday, getHeartToday, getLastNightSleep, getLatestSpo2 } from '../../health';
import { todayKey } from '../../health/dates';
import { useMetric } from '../../hooks/useMetric';
import { setWater } from '../../plan/actions';
import { usePlan } from '../../plan/usePlan';
import { PlanSetupCard } from '../../plan/ui/TodayCards';
import { useStepSensor } from '../../sensors/StepSensor';
import { useAppState } from '../../state/AppState';
import { space } from '../../theme/tokens';
import { WatchStatusChip } from '../../watch/components';
import { TodayYogaCard } from '../../yoga/TodayYogaCard';

const GLASS_ML = 250;

function greeting(d: Date) {
  const h = d.getHours();
  if (h < 5) return 'Good night';
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

export default function Today() {
  const { stepGoal, tracks, demoMode } = useAppState();
  const sensor = useStepSensor();
  const { open } = useLogSheets();
  const activity = useMetric(getActivityToday);
  const sleep = useMetric(getLastNightSleep);
  const heart = useMetric(getHeartToday);
  const spo2 = useMetric(getLatestSpo2);
  const plan = usePlan();
  const { settings: cycleSettings } = useCycleSettings();
  const [hidden, setHidden] = useTodayHidden();
  const [customise, setCustomise] = useState(false);
  const [toast, setToast] = useState<ToastMsg | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const reloadAll = useCallback(async () => {
    await Promise.all([activity.reload(), sleep.reload(), heart.reload(), spo2.reload(), plan.reload()]);
  }, [activity, sleep, heart, spo2, plan]);

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

  const dismissToast = useCallback(() => setToast(null), []);
  const addWater = useCallback(async () => {
    if (demoMode) {
      setToast({ id: Date.now(), text: 'Demo mode — sample data isn’t changed.' });
      return;
    }
    try {
      const day = todayKey();
      const before = await water.get(day);
      await setWater(day, before + GLASS_ML);
      const glasses = Math.round((before + GLASS_ML) / GLASS_ML);
      setToast({
        id: Date.now(),
        text: `Added a glass of water · ${glasses} today`,
        actionLabel: 'Undo',
        onAction: () => void setWater(day, before),
      });
    } catch {
      setToast({ id: Date.now(), text: 'Couldn’t save water. Please try again.' });
    }
  }, [demoMode]);

  const now = new Date();
  const dateText = now.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' });
  const name = firstName(plan.state?.profile);
  const hello = `${greeting(now)}${name ? `, ${name}` : ''}`;
  const tracked = (t: (typeof tracks)[number]) => tracks.includes(t);
  const on = (id: TodaySectionId) => !hidden.includes(id);

  const showCycle = on('cycle') && tracked('cycle') && !cycleSettings.hideOnToday;
  const showSleepHeart = on('sleepHeart') && (tracked('sleep') || tracked('heart'));

  return (
    <View style={{ flex: 1 }}>
      <Screen tabBar refreshing={refreshing} onRefresh={onRefresh} contentStyle={{ gap: space.sm }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, marginBottom: space.xs }}>
          <View accessible accessibilityRole="header" accessibilityLabel={`${hello}. ${dateText}`} style={{ flex: 1 }}>
            <Text variant="caption" tone="muted">
              {dateText}
            </Text>
            <Text variant="title">{hello}</Text>
          </View>
          <IconButton icon={Settings} accessibilityLabel="Settings" onPress={() => router.push('/settings')} />
        </View>
        {/* Renders nothing unless a watch was connected directly before. */}
        <WatchStatusChip />
        <DemoBanner />

        {on('glance') ? (
          <>
            <SectionHeader label="Today at a glance" />
            <GlanceGrid plan={plan.state} activity={activity.result} stepGoal={stepGoal} tracks={tracks} />
          </>
        ) : null}

        <SectionHeader label="Quick log" />
        <QuickLogRow tracks={tracks} onWater={addWater} />
        <Toast msg={toast} onDismiss={dismissToast} />

        {plan.state && !plan.state.profile ? <PlanSetupCard compact /> : null}

        {showCycle ? (
          <>
            <SectionHeader
              label="Your cycle"
              action={<TextButton label="Log today" onPress={() => open('day')} accessibilityLabel="Log today: flow, symptoms, mood and more" />}
            />
            <TodayCycleCard compact />
          </>
        ) : null}

        {on('yoga') ? (
          <>
            <SectionHeader label="Today’s yoga" />
            <TodayYogaCard compact />
          </>
        ) : null}

        {on('move') ? (
          <>
            <SectionHeader label="Move" />
            <MoveCard
              activity={activity.result}
              loading={activity.loading}
              plan={plan.state}
              stepGoal={stepGoal}
              showSteps={tracked('steps')}
            />
          </>
        ) : null}

        {showSleepHeart ? (
          <>
            <SectionHeader label="Sleep & heart" />
            <SleepHeartCard
              sleep={sleep.result}
              heart={heart.result}
              spo2={spo2.result}
              loading={{ sleep: sleep.loading, heart: heart.loading, spo2: spo2.loading }}
              showSleep={tracked('sleep')}
              showHeart={tracked('heart')}
            />
          </>
        ) : null}

        {on('ask') ? (
          <>
            <SectionHeader label="Ask Bloom" />
            <AskBloomCard />
          </>
        ) : null}

        <TextButton
          label="Customise Today"
          icon={SlidersHorizontal}
          onPress={() => setCustomise(true)}
          accessibilityHint="Choose which sections Today shows"
          style={{ alignSelf: 'center', marginTop: space.sm }}
        />
      </Screen>
      <CustomiseTodaySheet visible={customise} hidden={hidden} onChange={setHidden} onClose={() => setCustomise(false)} />
    </View>
  );
}

/** First name, if the profile ever carries one (the current profile has no name field). */
function firstName(profile: unknown): string | null {
  const n = (profile as { name?: unknown } | null | undefined)?.name;
  return typeof n === 'string' && n.trim() ? n.trim().split(/\s+/)[0] : null;
}
