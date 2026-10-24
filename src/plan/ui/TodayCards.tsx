/**
 * Compact plan cards for the Today screen: Weight, Food and Activity.
 * Each has a spoken summary on its content and a separately focusable action button.
 */
import { router } from 'expo-router';
import { Activity, ArrowDownRight, ArrowRight, ArrowUpRight, Plus, Scale, Target, Utensils } from 'lucide-react-native';
import React from 'react';
import { View } from 'react-native';
import { Ring } from '../../components/charts';
import { Button, Card, CardHeader, CardSkeleton, Text } from '../../components/ui';
import { space } from '../../theme/tokens';
import { useTheme } from '../../theme/useTheme';
import type { PlanState } from '../data';
import { fmtKg } from './parts';

export function PlanSetupCard() {
  const { c } = useTheme();
  return (
    <Card tint={c.cycleSoft}>
      <View accessible accessibilityLabel="Your plan. Set a goal to get a gentle daily calorie range, protein and water targets.">
        <CardHeader icon={Target} label="Your plan" accent={c.cycle} soft={c.surface} />
        <Text variant="bodyStrong">Set a gentle goal</Text>
        <Text tone="muted" style={{ marginTop: 2 }}>
          A comfortable daily range, protein and water — with room for treats.
        </Text>
      </View>
      <Button label="Set up my plan" icon={ArrowRight} onPress={() => router.push('/onboarding/profile')} style={{ marginTop: space.md }} />
    </Card>
  );
}

export function WeightTodayCard({ state, loading }: { state: PlanState | null; loading: boolean }) {
  const { c } = useTheme();
  if (loading && !state) return <CardSkeleton label="weight" height={150} />;
  if (!state) return null;
  const last = state.latestMorning;
  const dir = state.direction;
  const Arrow = dir?.dir === 'down' ? ArrowDownRight : dir?.dir === 'up' ? ArrowUpRight : ArrowRight;
  const dirText = dir
    ? dir.dir === 'flat'
      ? 'steady this week'
      : `${dir.dir === 'down' ? 'down' : 'up'} ${Math.abs(dir.delta).toFixed(1)} kg this week`
    : 'trend after a few mornings';
  const label = last
    ? `Weight. Latest morning ${last.kg.toFixed(1)} kilograms. Trend ${state.trendKg !== null ? `${state.trendKg.toFixed(1)} kilograms, ` : ''}${dirText}.`
    : 'Weight. No morning weight logged yet.';
  return (
    <Card>
      <View accessible accessibilityLabel={label}>
        <CardHeader icon={Scale} label="Weight" accent={c.spo2} soft={c.spo2Soft} />
        {last ? (
          <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: space.md }}>
            <View>
              <Text variant="display">{last.kg.toFixed(1)}</Text>
              <Text variant="caption" tone="muted">
                kg · latest morning
              </Text>
            </View>
            <View style={{ flex: 1, gap: 2, paddingBottom: 4 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <Arrow size={18} color={c.spo2} />
                <Text variant="bodyStrong">{dirText}</Text>
              </View>
              {state.trendKg !== null ? (
                <Text variant="caption" tone="muted">
                  7-day trend {fmtKg(state.trendKg)}
                </Text>
              ) : null}
            </View>
          </View>
        ) : (
          <Text tone="muted">Weigh yourself in the morning, after the bathroom and before breakfast, for the steadiest trend.</Text>
        )}
        {state.cycleNote ? (
          <Text variant="caption" tone="muted" style={{ marginTop: space.xs }}>
            {state.cycleNote}
          </Text>
        ) : null}
      </View>
      <Button label="Log weight" variant="secondary" icon={Plus} onPress={() => router.push('/weight')} style={{ marginTop: space.md }} />
    </Card>
  );
}

export function FoodTodayCard({ state, loading }: { state: PlanState | null; loading: boolean }) {
  const { c } = useTheme();
  if (loading && !state) return <CardSkeleton label="food" height={170} />;
  if (!state) return null;
  const eaten = state.totals.kcal;
  const a = state.allowance;
  const label = a
    ? `Food today: ${eaten} kilocalories eaten. Aim around ${a.min} to ${a.max}. Protein ${state.totals.protein} grams.`
    : `Food today: ${eaten} kilocalories eaten. Protein ${state.totals.protein} grams.`;
  return (
    <Card>
      <View accessible accessibilityLabel={label}>
        <CardHeader icon={Utensils} label="Food" accent={c.steps} soft={c.stepsSoft} />
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.lg }}>
          {a ? (
            <Ring value={eaten} goal={a.kcal} size={104} stroke={12} color={c.steps} track={c.stepsSoft} accessibilityLabel={label}>
              <Text variant="caption" tone="muted">
                {Math.round((eaten / a.kcal) * 100)}%
              </Text>
            </Ring>
          ) : null}
          <View style={{ flex: 1, gap: 2 }}>
            <Text variant="displaySm">{eaten.toLocaleString()}</Text>
            <Text variant="caption" tone="muted">
              {a ? `kcal · aim around ${a.min.toLocaleString()}–${a.max.toLocaleString()}` : 'kcal eaten today'}
            </Text>
            <Text variant="caption" tone="muted">
              Protein {state.totals.protein} g{state.plan?.targets ? ` of ${state.plan.targets.proteinG} g` : ''}
            </Text>
          </View>
        </View>
      </View>
      <Button label="Log food" variant="secondary" icon={Plus} onPress={() => router.push('/food')} style={{ marginTop: space.md }} />
    </Card>
  );
}

export function ActivityTodayCard({ state, loading }: { state: PlanState | null; loading: boolean }) {
  const { c } = useTheme();
  if (loading && !state) return <CardSkeleton label="workouts" height={140} />;
  if (!state) return null;
  const kcal = Math.round(state.exerciseKcal);
  const label = `Workouts today: ${state.activityMinutes} minutes, about ${kcal} kilocalories extra burn from what you logged.`;
  return (
    <Card>
      <View accessible accessibilityLabel={label}>
        <CardHeader icon={Activity} label="Workouts" accent={c.heart} soft={c.heartSoft} />
        <View style={{ flexDirection: 'row', gap: space.xl }}>
          <View>
            <Text variant="displaySm">{state.activityMinutes}</Text>
            <Text variant="caption" tone="muted">
              minutes
            </Text>
          </View>
          <View>
            <Text variant="displaySm">{kcal}</Text>
            <Text variant="caption" tone="muted">
              kcal extra burn
            </Text>
          </View>
        </View>
      </View>
      <Button label="Log activity" variant="secondary" icon={Plus} onPress={() => router.push('/activity/add')} style={{ marginTop: space.md }} />
    </Card>
  );
}
