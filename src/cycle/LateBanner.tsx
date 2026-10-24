/**
 * Gentle "late period" note, shown when no period is logged more than 3 days after the
 * expected start.
 */
import { CalendarClock, ChevronDown, ChevronUp } from 'lucide-react-native';
import React, { useState } from 'react';
import { Pressable, View } from 'react-native';
import { Card, Text } from '../components/ui';
import { space, touch } from '../theme/tokens';
import type { CycleGoal } from './store';
import { useCycleColors } from './theme';

export function lateTitle(daysLate: number): string {
  return `Your period is ${daysLate} ${daysLate === 1 ? 'day' : 'days'} later than expected`;
}

export function lateTips(goal: CycleGoal): string[] {
  return [
    'Stress, travel, illness, sleep changes and big changes in exercise or weight can all shift your cycle.',
    goal === 'conceive'
      ? 'If you might be pregnant, a home pregnancy test is most reliable from the day your period was due.'
      : 'If there’s any chance of pregnancy, consider taking a home pregnancy test.',
    'See a doctor if you miss periods for 3 months or more, or if your cycles are often shorter than 21 or longer than 35 days.',
  ];
}

export function LateBanner({ daysLate, goal, compact = false }: { daysLate: number; goal: CycleGoal; compact?: boolean }) {
  const { c } = useCycleColors();
  const [open, setOpen] = useState(!compact);
  const tips = lateTips(goal);
  return (
    <Card tint={c.stepsSoft}>
      <View accessible accessibilityRole="text" accessibilityLabel={`${lateTitle(daysLate)}. ${open ? tips.join(' ') : ''}`} style={{ flexDirection: 'row', gap: space.sm }}>
        <CalendarClock size={22} color={c.steps} style={{ marginTop: 2 }} />
        <View style={{ flex: 1 }}>
          <Text variant="bodyStrong">{lateTitle(daysLate)}</Text>
          <Text tone="muted" style={{ marginTop: 2 }}>
            That happens, and it’s usually nothing to worry about. Log it when it starts and Bloom will adjust.
          </Text>
          {open
            ? tips.map((t) => (
                <View key={t} style={{ flexDirection: 'row', gap: space.xs, marginTop: space.xs }}>
                  <Text tone="muted">•</Text>
                  <Text style={{ flex: 1 }}>{t}</Text>
                </View>
              ))
            : null}
        </View>
      </View>
      {compact ? (
        <Pressable
          onPress={() => setOpen((o) => !o)}
          accessibilityRole="button"
          accessibilityState={{ expanded: open }}
          accessibilityLabel={open ? 'Hide tips' : 'Show tips'}
          style={{ minHeight: touch.min, flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', marginTop: space.xs }}
        >
          {open ? <ChevronUp size={18} color={c.ink} /> : <ChevronDown size={18} color={c.ink} />}
          <Text variant="bodyStrong">{open ? 'Hide tips' : 'What can cause this?'}</Text>
        </Pressable>
      ) : null}
    </Card>
  );
}
