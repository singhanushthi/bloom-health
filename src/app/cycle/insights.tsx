/**
 * Cycle insights: averages, cycle-length chart (last 12 cycles with average line), symptom
 * patterns, mood by phase and the full history. Plain, friendly language.
 */
import { router } from 'expo-router';
import { ChartColumn, ChevronLeft, Droplet, Smile, Sparkles } from 'lucide-react-native';
import React, { useState } from 'react';
import { View } from 'react-native';
import { BarChart } from '../../components/charts';
import { DemoBanner } from '../../components/DemoBanner';
import { Screen } from '../../components/Screen';
import { Card, CardHeader, CardSkeleton, EmptyNote, IconButton, Text } from '../../components/ui';
import { useCycleOverview } from '../../cycle/hooks';
import { barsSummary, cycleBars, moodSentence } from '../../cycle/insights';
import { useCycleColors } from '../../cycle/theme';
import { CONFIDENCE_LABEL, PHASE_DETAIL_LABEL, type PhaseDetail } from '../../health/cyclePrediction';
import { formatDay } from '../../health/dates';
import { space } from '../../theme/tokens';

const PHASES: PhaseDetail[] = ['menstrual', 'follicular', 'ovulation', 'luteal', 'pms'];

function Stat({ label, value, unit }: { label: string; value: string; unit: string }) {
  const { cycleText } = useCycleColors();
  return (
    <View accessible accessibilityLabel={`${label}: ${value} ${unit}`} style={{ flex: 1 }}>
      <Text variant="label" tone="muted">
        {label.toUpperCase()}
      </Text>
      <Text variant="displaySm" style={{ color: cycleText }}>
        {value}
      </Text>
      <Text variant="caption" tone="muted">
        {unit}
      </Text>
    </View>
  );
}

export default function CycleInsights() {
  const { c } = useCycleColors();
  const { loading, result, reload } = useCycleOverview();
  const [width, setWidth] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const o = result?.data;
  const d = o?.cycle;

  const header = (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
      <IconButton icon={ChevronLeft} onPress={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)/cycle'))} accessibilityLabel="Back" />
      <Text variant="display" accessibilityRole="header" style={{ flex: 1 }}>
        Insights
      </Text>
    </View>
  );

  const body = () => {
    if (loading && !result) return <CardSkeleton label="cycle insights" height={320} />;
    if (!o || !d || !d.hasData) {
      return (
        <Card>
          <EmptyNote icon={ChartColumn} accent={c.cycle} title="Nothing to show yet" body="Log your periods for a couple of cycles and your averages and patterns will appear here." />
        </Card>
      );
    }
    const bars = cycleBars(d.history, 12);
    const avg = d.predictions.cycleLength;
    const summary = barsSummary(bars, avg);
    return (
      <>
        <Card tint={c.cycleSoft}>
          <CardHeader icon={Sparkles} label="Your averages" accent={c.cycle} soft={c.surface} />
          <View style={{ flexDirection: 'row', gap: space.md }}>
            <Stat label="Cycle" value={`${avg}`} unit="days" />
            <Stat label="Period" value={`${d.predictions.periodLength}`} unit="days" />
            <Stat label="Cycles" value={`${bars.length}`} unit="logged" />
          </View>
          <Text tone="muted" style={{ marginTop: space.sm }}>
            {d.predictions.cyclesUsed >= 2
              ? `${CONFIDENCE_LABEL[d.predictions.confidence]} — from your last ${d.predictions.cyclesUsed} cycles${
                  d.predictions.sd !== null ? `, which vary by about ${Math.round(d.predictions.sd)} ${Math.round(d.predictions.sd) === 1 ? 'day' : 'days'}` : ''
                }.`
              : 'Using your usual cycle length until you’ve logged 2 cycles.'}
          </Text>
          {d.predictions.range ? (
            <Text tone="muted" style={{ marginTop: space.xxs }}>
              Your cycles range from {d.predictions.range.min} to {d.predictions.range.max} days.
            </Text>
          ) : null}
        </Card>

        <Card>
          <CardHeader icon={ChartColumn} label="Cycle length" accent={c.cycle} soft={c.cycleSoft} />
          <View onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
            {bars.length >= 2 ? (
              <BarChart
                data={bars.map((b, i) => ({
                  label: formatDay(b.start, { month: 'short' }),
                  value: b.length,
                  showLabel: bars.length <= 8 || i % 2 === bars.length % 2 || i === bars.length - 1,
                  highlight: i === bars.length - 1,
                }))}
                color={c.cycle}
                softColor={c.cycleSoft}
                width={width || 300}
                goal={avg}
                goalLabel={`avg ${avg}`}
                formatY={(v) => `${Math.round(v)}`}
                yAxisTitle="days"
                accessibilityLabel={summary}
              />
            ) : (
              <Text tone="muted">Log at least 2 full cycles to see this chart.</Text>
            )}
          </View>
          {bars.length >= 2 ? (
            <Text variant="caption" tone="muted" style={{ marginTop: space.xs }}>
              Each bar is one cycle, labelled with the month it started; the newest is filled in. The dashed line is your average.
            </Text>
          ) : null}
        </Card>

        <Card>
          <CardHeader icon={Droplet} label="Symptom patterns" accent={c.cycle} soft={c.cycleSoft} />
          {o.patterns.length ? (
            o.patterns.slice(0, 8).map((p, i) => (
              <View key={p.id} accessible accessibilityLabel={`${p.text}. Seen in ${p.cycles} of ${p.outOf} cycles.`} style={{ paddingVertical: space.xs, borderTopWidth: i ? 1 : 0, borderTopColor: c.line }}>
                <Text variant="bodyStrong">{p.text}</Text>
                <Text variant="caption" tone="muted">
                  Seen in {p.cycles} of {p.outOf} cycles you logged
                </Text>
              </View>
            ))
          ) : (
            <Text tone="muted">Log symptoms across 2 or more cycles and Bloom will point out what repeats — like cramps on day 1 or headaches before your period.</Text>
          )}
        </Card>

        <Card>
          <CardHeader icon={Smile} label="Mood by phase" accent={c.sleep} soft={c.sleepSoft} />
          {PHASES.map((ph, i) => {
            const s = moodSentence(o.byPhase, ph);
            return (
              <View
                key={ph}
                accessible
                accessibilityLabel={`${PHASE_DETAIL_LABEL[ph]}: ${s ?? 'not enough mood logs yet'}`}
                style={{ flexDirection: 'row', minHeight: 48, alignItems: 'center', borderTopWidth: i ? 1 : 0, borderTopColor: c.line, gap: space.sm }}
              >
                <Text variant="bodyStrong" style={{ width: 150 }}>
                  {PHASE_DETAIL_LABEL[ph]}
                </Text>
                <Text tone={s ? 'ink' : 'muted'} style={{ flex: 1 }}>
                  {s ?? 'Not enough logs yet'}
                </Text>
              </View>
            );
          })}
        </Card>

        <Card>
          <CardHeader icon={Droplet} label="History" accent={c.cycle} soft={c.cycleSoft} />
          {d.history.map((h, i) => (
            <View
              key={h.start}
              accessible
              accessibilityLabel={`Started ${formatDay(h.start, { day: 'numeric', month: 'long', year: 'numeric' })}. Period ${h.periodLength} days. ${h.cycleLength === null ? 'Current cycle' : `Cycle ${h.cycleLength} days`}.`}
              style={{ flexDirection: 'row', alignItems: 'center', minHeight: 48, borderTopWidth: i ? 1 : 0, borderTopColor: c.line }}
            >
              <Text variant="bodyStrong" style={{ flex: 1 }}>
                {formatDay(h.start, { day: 'numeric', month: 'short', year: 'numeric' })}
              </Text>
              <Text tone="muted" style={{ width: 90 }}>
                {h.periodLength}d period
              </Text>
              <Text variant="bodyStrong" style={{ width: 80, textAlign: 'right' }}>
                {h.cycleLength === null ? 'Now' : `${h.cycleLength} days`}
              </Text>
            </View>
          ))}
        </Card>
        <Text variant="caption" tone="muted">
          Insights describe what you logged. They’re not a diagnosis. Talk to a doctor if something worries you.
        </Text>
      </>
    );
  };

  return (
    <Screen
      refreshing={refreshing}
      onRefresh={async () => {
        setRefreshing(true);
        await reload();
        setRefreshing(false);
      }}
    >
      {header}
      <DemoBanner />
      {body()}
    </Screen>
  );
}
