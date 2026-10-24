/**
 * "Today in your cycle" — self-contained card for the Today screen.
 * Phase, cycle day, next period (or range), what's typical and 3 personalised tips.
 * Renders nothing when cycle tracking is off or "Hide cycle data on Today" is on.
 * Also keeps cycle reminders in sync (idempotent).
 */
import { router } from 'expo-router';
import { CalendarClock, Flower2 } from 'lucide-react-native';
import React, { useState } from 'react';
import { View } from 'react-native';
import { Button, Card, CardHeader, CardSkeleton, Chip, Text, TextButton } from '../components/ui';
import { todayKey } from '../health/dates';
import { useCycleReminderSync } from '../notify/ReminderSync';
import { useAppState } from '../state/AppState';
import { space } from '../theme/tokens';
import { useCycleOverview, useCycleSettings } from './hooks';
import { frequentInPhase } from './insights';
import { lateTitle } from './LateBanner';
import { ContraceptionNote } from './parts';
import { nextPeriodText } from './text';
import { PHASE_TITLE, suggestForPhase } from './suggestions';
import { useCycleColors } from './theme';

/**
 * `compact` (Today screen): phase, day and next period up front; the typical-symptoms line and
 * tips sit behind a "Show tips" toggle, and actions are low-emphasis text buttons.
 */
export function TodayCycleCard({ compact = false }: { compact?: boolean } = {}) {
  const { c, cycleText } = useCycleColors();
  const [showTips, setShowTips] = useState(false);
  const { tracks } = useAppState();
  const { settings, loading: settingsLoading } = useCycleSettings();
  const { loading, result } = useCycleOverview();
  useCycleReminderSync();

  if (!tracks.includes('cycle')) return null;
  if (settingsLoading) return <CardSkeleton label="cycle" height={compact ? 120 : 200} />;
  if (settings.hideOnToday) return null;
  if (loading && !result) return <CardSkeleton label="cycle" height={compact ? 120 : 200} />;
  const o = result?.data;
  const d = o?.cycle;

  if (!o || !d || !d.hasData || d.cycleDay === null || !d.phaseDetail) {
    if (compact) {
      return (
        <Card tint={c.cycleSoft}>
          <Text tone="muted">No period logged yet — add your last one to see your phase.</Text>
          <TextButton label="Set up cycle" icon={Flower2} onPress={() => router.push('/(tabs)/cycle')} style={{ marginTop: space.xxs }} />
        </Card>
      );
    }
    return (
      <Card tint={c.cycleSoft}>
        <CardHeader icon={Flower2} label="Today in your cycle" accent={c.cycle} soft={c.surface} />
        <Text variant="bodyStrong">No period logged yet</Text>
        <Text tone="muted" style={{ marginTop: 2 }}>
          Add your last period to see your phase, the next period and ideas for each phase.
        </Text>
        <Button label="Set up cycle" icon={Flower2} onPress={() => router.push('/(tabs)/cycle')} style={{ marginTop: space.md }} />
      </Card>
    );
  }

  const phase = d.phaseDetail;
  const s = suggestForPhase(phase, {
    diet: o.diet,
    yogaLevel: o.yogaLevel,
    frequentSymptoms: frequentInPhase(o.byPhase, phase),
  });
  const p = d.predictions;
  const next = p.showLateBanner ? lateTitle(p.daysLate) : nextPeriodText(p, todayKey());
  const label = `Today in your cycle: day ${d.cycleDay}, ${PHASE_TITLE[phase]}. ${next}. ${s.typical} Tips: ${s.tips.join(' ')}`;

  if (compact) {
    const shortLabel = `Your cycle: day ${d.cycleDay}, ${PHASE_TITLE[phase]}. ${next}.`;
    return (
      <Card tint={c.cycleSoft}>
        <View accessible accessibilityLabel={shortLabel} style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
          <View style={{ flex: 1 }}>
            <Text variant="title" style={{ color: cycleText }}>
              {PHASE_TITLE[phase]}
            </Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.xs, marginTop: space.xxs }}>
              <CalendarClock size={16} color={c.ink} />
              <Text style={{ flex: 1 }}>{next}</Text>
            </View>
          </View>
          <View style={{ alignItems: 'center', backgroundColor: c.surface, borderRadius: 20, paddingHorizontal: space.sm, paddingVertical: space.xs, minWidth: 64 }}>
            <Text variant="caption" tone="muted">
              DAY
            </Text>
            <Text variant="displaySm" style={{ color: cycleText }}>
              {d.cycleDay}
            </Text>
          </View>
        </View>
        {showTips ? (
          <View accessible accessibilityLabel={`${s.typical} Tips: ${s.tips.join(' ')}`} style={{ marginTop: space.sm, gap: space.xxs }}>
            <Text tone="muted">{s.typical}</Text>
            {s.tips.map((t) => (
              <View key={t} style={{ flexDirection: 'row', gap: space.xs }}>
                <Text tone="muted">•</Text>
                <Text style={{ flex: 1 }}>{t}</Text>
              </View>
            ))}
          </View>
        ) : null}
        {d.settings.goal !== 'track' ? <ContraceptionNote style={{ marginTop: space.sm }} /> : null}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: space.lg, marginTop: space.xxs }}>
          <TextButton
            label={showTips ? 'Hide tips' : 'Tips for this phase'}
            onPress={() => setShowTips((v) => !v)}
            accessibilityState={{ expanded: showTips }}
          />
          <TextButton label="Open cycle" onPress={() => router.push('/(tabs)/cycle')} accessibilityHint="Opens the Cycle tab" />
        </View>
      </Card>
    );
  }

  return (
    <Card tint={c.cycleSoft}>
      <View accessible accessibilityLabel={label}>
        <CardHeader
          icon={Flower2}
          label="Today in your cycle"
          accent={c.cycle}
          soft={c.surface}
          right={<Chip label={`Day ${d.cycleDay}`} bg={c.surface} icon={Flower2} iconColor={c.cycle} />}
        />
        <Text variant="title" style={{ color: cycleText }}>
          {PHASE_TITLE[phase]}
        </Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.xs, marginTop: space.xs }}>
          <CalendarClock size={18} color={c.ink} />
          <Text variant="bodyStrong" style={{ flex: 1 }}>
            {next}
          </Text>
        </View>
        <Text tone="muted" style={{ marginTop: space.xs }}>
          {s.typical}
        </Text>
        <View style={{ marginTop: space.sm, gap: space.xxs }}>
          {s.tips.map((t) => (
            <View key={t} style={{ flexDirection: 'row', gap: space.xs }}>
              <Text tone="muted">•</Text>
              <Text style={{ flex: 1 }}>{t}</Text>
            </View>
          ))}
        </View>
        {d.settings.goal !== 'track' ? <ContraceptionNote style={{ marginTop: space.sm }} /> : null}
      </View>
      <Button
        variant="secondary"
        label="Ideas for this phase"
        onPress={() => router.push('/(tabs)/cycle')}
        style={{ marginTop: space.md }}
        accessibilityHint="Opens the Cycle tab"
      />
    </Card>
  );
}
