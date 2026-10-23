/**
 * Trends: 7/30-day steps, sleep and resting heart rate.
 */
import { CircleAlert, Footprints, HeartPulse, Lock, Moon } from 'lucide-react-native';
import React, { useCallback, useState } from 'react';
import { View } from 'react-native';
import { BarChart, LineChart, type BarDatum } from '../../components/charts';
import { SourceTag } from '../../components/cards';
import { DemoBanner } from '../../components/DemoBanner';
import { Screen } from '../../components/Screen';
import { Card, CardHeader, CardSkeleton, EmptyNote, Segmented, Text } from '../../components/ui';
import { getTrends, type DailyValue, type TrendRange } from '../../health';
import { formatDay, formatDuration, formatDurationLong, todayKey } from '../../health/dates';
import { useMetric } from '../../hooks/useMetric';
import { useAppState } from '../../state/AppState';
import { space } from '../../theme/tokens';
import { useTheme } from '../../theme/useTheme';

function toBars(values: DailyValue[], range: TrendRange): BarDatum[] {
  const today = todayKey();
  return values.map((v, i) => ({
    label:
      range === 7
        ? formatDay(v.day, { weekday: 'narrow' })
        : formatDay(v.day, { day: 'numeric' }),
    value: v.value,
    // 30-day: label every 5th day and today.
    showLabel: range === 7 || (values.length - 1 - i) % 5 === 0,
    highlight: v.day === today,
  }));
}

function stats(values: DailyValue[]) {
  const present = values.filter((v) => v.value !== null) as { day: string; value: number }[];
  if (!present.length) return null;
  const avg = present.reduce((a, b) => a + b.value, 0) / present.length;
  const best = present.reduce((a, b) => (b.value > a.value ? b : a));
  const low = present.reduce((a, b) => (b.value < a.value ? b : a));
  return { avg, best, low, n: present.length };
}

export default function TrendsScreen() {
  const { c } = useTheme();
  const { stepGoal } = useAppState();
  const [range, setRange] = useState<TrendRange>(7);
  const reader = useCallback((ctx: Parameters<typeof getTrends>[0]) => getTrends(ctx, range), [range]);
  const { loading, result, reload } = useMetric(reader, [range]);
  const [refreshing, setRefreshing] = useState(false);
  const [w, setW] = useState(0);

  const onRefresh = async () => {
    setRefreshing(true);
    await reload();
    setRefreshing(false);
  };

  const rangeText = range === 7 ? 'last 7 days' : 'last 30 days';
  const d = result?.data;
  const dayName = (k: string) => formatDay(k, { weekday: 'long', day: 'numeric', month: 'short' });

  const body = () => {
    if (loading && !result)
      return (
        <>
          <CardSkeleton label="steps chart" height={240} />
          <CardSkeleton label="sleep chart" height={240} />
          <CardSkeleton label="resting heart rate chart" height={230} />
        </>
      );
    if (!result) return null;
    if (result.status === 'denied' || result.status === 'error' || !d) {
      return (
        <Card>
          <EmptyNote
            icon={result.status === 'denied' ? Lock : CircleAlert}
            accent={c.sleep}
            title={result.status === 'denied' ? 'Permission needed' : "Couldn't load trends"}
            body={
              result.status === 'denied'
                ? 'Allow Steps, Sleep and Resting heart rate in Settings → Manage permissions.'
                : `Pull down to retry. ${result.error ?? ''}`
            }
          />
        </Card>
      );
    }

    const s = stats(d.steps);
    const sl = stats(d.sleepMin);
    const hr = stats(d.restingHr);
    const goalDays = d.steps.filter((v) => (v.value ?? 0) >= stepGoal).length;

    const stepsSummary = s
      ? `Steps, ${rangeText}: average ${Math.round(s.avg).toLocaleString()} a day. Goal of ${stepGoal.toLocaleString()} met on ${goalDays} of ${d.steps.length} days. Highest ${s.best.value.toLocaleString()} on ${dayName(s.best.day)}.`
      : `No step data for the ${rangeText}.`;
    const sleepSummary = sl
      ? `Sleep, ${rangeText}: average ${formatDurationLong(sl.avg)} a night across ${sl.n} nights. Longest ${formatDurationLong(sl.best.value)} on ${dayName(sl.best.day)}, shortest ${formatDurationLong(sl.low.value)} on ${dayName(sl.low.day)}.`
      : `No sleep data for the ${rangeText}.`;
    const hrSummary = hr
      ? `${d.hrKind === 'resting' ? 'Resting heart rate' : 'Daily average of your heart-rate readings'}, ${rangeText}: average ${Math.round(hr.avg)} beats per minute, ranging ${hr.low.value} to ${hr.best.value}.`
      : `No resting heart rate data for the ${rangeText}.`;

    return (
      <>
        <Card>
          <CardHeader icon={Footprints} label="Steps" accent={c.steps} soft={c.stepsSoft} />
          {s ? (
            <>
              <Text variant="displaySm">{Math.round(s.avg).toLocaleString()}</Text>
              <Text variant="caption" tone="muted" style={{ marginBottom: space.sm }}>
                daily average · goal met {goalDays}/{d.steps.length} days
              </Text>
              {w > 0 ? (
                <BarChart
                  width={w}
                  data={toBars(d.steps, range)}
                  color={c.steps}
                  softColor={c.stepsSoft}
                  goal={stepGoal}
                  goalLabel={`Goal ${(stepGoal / 1000).toFixed(stepGoal % 1000 ? 1 : 0)}k`}
                  formatY={(v) => (v >= 1000 ? `${(v / 1000).toFixed(v % 1000 ? 1 : 0)}k` : `${v}`)}
                  yAxisTitle="Steps per day"
                  accessibilityLabel={stepsSummary}
                />
              ) : null}
            </>
          ) : (
            <EmptyNote icon={CircleAlert} accent={c.steps} title="No steps in this range" body="Walk with Bloom open, enter steps on Today, or connect Health Connect in Settings for all-day counting." />
          )}
        <SourceTag sources={d.sourcesBy?.steps ?? []} />
        </Card>

        <Card>
          <CardHeader icon={Moon} label="Sleep" accent={c.sleep} soft={c.sleepSoft} />
          {sl ? (
            <>
              <Text variant="displaySm">{formatDuration(sl.avg)}</Text>
              <Text variant="caption" tone="muted" style={{ marginBottom: space.sm }}>
                average asleep · {sl.n} nights recorded
              </Text>
              {w > 0 ? (
                <BarChart
                  width={w}
                  data={toBars(d.sleepMin, range)}
                  color={c.sleep}
                  softColor={c.sleepSoft}
                  goal={8 * 60}
                  goalLabel="8h"
                  formatY={(v) => `${Math.round(v / 60)}h`}
                  yAxisTitle="Hours asleep (by wake-up day)"
                  accessibilityLabel={sleepSummary}
                />
              ) : null}
            </>
          ) : (
            <EmptyNote icon={CircleAlert} accent={c.sleep} title="No sleep in this range" body="Use the Log button on Today to add sleep, or connect a watch in Settings." />
          )}
        <SourceTag sources={d.sourcesBy?.sleep ?? []} />
        </Card>

        <Card>
          <CardHeader icon={HeartPulse} label={d.hrKind === 'resting' ? 'Resting heart rate' : 'Heart rate · your readings'} accent={c.heart} soft={c.heartSoft} />
          {hr ? (
            <>
              <Text variant="displaySm">{Math.round(hr.avg)} bpm</Text>
              <Text variant="caption" tone="muted" style={{ marginBottom: space.sm }}>
                average · range {hr.low.value}–{hr.best.value}
              </Text>
              {w > 0 ? (
                <LineChart
                  width={w}
                  data={toBars(d.restingHr, range)}
                  color={c.heart}
                  formatY={(v) => `${Math.round(v)}`}
                  yAxisTitle="Beats per minute"
                  accessibilityLabel={hrSummary}
                />
              ) : null}
            </>
          ) : (
            <EmptyNote icon={CircleAlert} accent={c.heart} title="No heart-rate data yet" body="Add readings with the Log button on Today, or connect a watch in Settings for resting heart rate." />
          )}
        <SourceTag sources={d.sourcesBy?.heart ?? []} />
        </Card>
      </>
    );
  };

  return (
    <Screen refreshing={refreshing} onRefresh={onRefresh}>
      <Text variant="display" accessibilityRole="header">
        Trends
      </Text>
      <DemoBanner />
      {/* Full content width; charts subtract card padding (20) + border (1) on each side. */}
      <View onLayout={(e) => setW(Math.floor(e.nativeEvent.layout.width - 42))}>
        <Segmented
          accessibilityLabel="Time range"
          value={range}
          onChange={setRange}
          options={[
            { value: 7, label: '7 days' },
            { value: 30, label: '30 days' },
          ]}
        />
      </View>
      {body()}
    </Screen>
  );
}
