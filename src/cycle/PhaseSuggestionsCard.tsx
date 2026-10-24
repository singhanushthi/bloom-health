/**
 * "For this phase" suggestions: food, movement (linked to yoga sessions) and self-care.
 * Starts on today's phase; chips let you peek at the other phases.
 */
import { router } from 'expo-router';
import { Footprints, HeartHandshake, Leaf, PersonStanding, Sparkles } from 'lucide-react-native';
import React, { useEffect, useMemo, useState } from 'react';
import { View } from 'react-native';
import { ChipRow, ToggleChip } from '../components/sheets/Sheet';
import { Card, CardHeader, Text } from '../components/ui';
import { PHASE_DETAIL_LABEL, type PhaseDetail } from '../health/cyclePrediction';
import { space } from '../theme/tokens';
import { frequentInPhase } from './insights';
import type { CycleOverview } from './data';
import { LinkRow } from './parts';
import { suggestForPhase } from './suggestions';
import { useCycleColors } from './theme';

const ORDER: PhaseDetail[] = ['menstrual', 'follicular', 'ovulation', 'luteal', 'pms'];
const SHORT: Record<PhaseDetail, string> = {
  menstrual: 'Period',
  follicular: 'Follicular',
  ovulation: 'Ovulation',
  luteal: 'Luteal',
  pms: 'PMS',
};

function Bullet({ children }: { children: React.ReactNode }) {
  return (
    <View style={{ flexDirection: 'row', gap: space.xs, marginTop: space.xxs }}>
      <Text tone="muted">•</Text>
      <Text style={{ flex: 1 }}>{children}</Text>
    </View>
  );
}

export function PhaseSuggestionsCard({ current, overview }: { current: PhaseDetail | null; overview: CycleOverview }) {
  const { c, cycleText } = useCycleColors();
  const [phase, setPhase] = useState<PhaseDetail>(current ?? 'follicular');
  useEffect(() => {
    if (current) setPhase(current);
  }, [current]);
  const s = useMemo(
    () =>
      suggestForPhase(phase, {
        diet: overview.diet,
        yogaLevel: overview.yogaLevel,
        frequentSymptoms: frequentInPhase(overview.byPhase, phase),
      }),
    [phase, overview]
  );

  const section = (Icon: typeof Leaf, title: string) => (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.xs, marginTop: space.md }}>
      <Icon size={18} color={c.cycle} />
      <Text variant="heading" accessibilityRole="header">
        {title}
      </Text>
    </View>
  );

  return (
    <Card>
      <CardHeader icon={Sparkles} label="Ideas for your cycle" accent={c.cycle} soft={c.cycleSoft} />
      <ChipRow label="Choose a phase">
        {ORDER.map((p) => (
          <ToggleChip
            key={p}
            label={p === current ? `${SHORT[p]} · now` : SHORT[p]}
            role="radio"
            selected={phase === p}
            onPress={() => setPhase(p)}
            accent={c.cycle}
            soft={c.cycleSoft}
          />
        ))}
      </ChipRow>
      <Text variant="title" style={{ color: cycleText, marginTop: space.md }} accessibilityRole="header">
        {s.title}
      </Text>
      <Text tone="muted" style={{ marginTop: space.xxs }}>
        {s.typical}
      </Text>

      {section(Leaf, 'Food')}
      {s.food.map((f) => (
        <View key={f.name} accessible accessibilityLabel={`${f.name}. ${f.why}`} style={{ marginTop: space.xs }}>
          <Text variant="bodyStrong">{f.name}</Text>
          <Text tone="muted">{f.why}</Text>
        </View>
      ))}
      {s.foodNote ? (
        <Text variant="caption" tone="muted" style={{ marginTop: space.xs }}>
          {s.foodNote}
        </Text>
      ) : null}
      {overview.diet ? null : (
        <Text variant="caption" tone="muted" style={{ marginTop: space.xxs }}>
          Set your food preference in Plan to match these to your diet.
        </Text>
      )}

      {section(PersonStanding, 'Movement')}
      <View style={{ gap: space.xs, marginTop: space.xs }}>
        {s.movement.sessions.map((y) => (
          <LinkRow
            key={y.id}
            icon={PersonStanding}
            label={y.title}
            hint={`${y.minutes} min yoga${y.periodFriendly ? ' · period-friendly' : ''}`}
            onPress={() => router.push(`/yoga/${y.id}`)}
            accent={c.spo2}
            soft={c.spo2Soft}
          />
        ))}
      </View>
      <View style={{ flexDirection: 'row', gap: space.xs, marginTop: space.sm }}>
        <Footprints size={18} color={c.steps} style={{ marginTop: 3 }} />
        <Text style={{ flex: 1 }}>{s.movement.walk}</Text>
      </View>
      <Text variant="caption" tone="muted" style={{ marginTop: space.xxs }}>
        {s.movement.note}
      </Text>

      {section(HeartHandshake, 'Self-care')}
      {s.selfCare.map((t) => (
        <Bullet key={t}>{t}</Bullet>
      ))}

      <Text variant="caption" tone="muted" style={{ marginTop: space.md }}>
        General wellbeing ideas for {PHASE_DETAIL_LABEL[phase].toLowerCase()} — not medical advice. Talk to a doctor about severe pain or very heavy bleeding.
      </Text>
    </Card>
  );
}
