/**
 * Onboarding 2/4: what to track. Today shows only the chosen areas.
 */
import { router } from 'expo-router';
import { Flower2, Footprints, HeartPulse, Moon, type LucideIcon } from 'lucide-react-native';
import React, { useState } from 'react';
import { View } from 'react-native';
import { Screen } from '../../components/Screen';
import { ToggleChip } from '../../components/sheets/Sheet';
import { Button, Text } from '../../components/ui';
import { ALL_TRACKS, TRACK_LABEL, useAppState, type TrackId } from '../../state/AppState';
import { space } from '../../theme/tokens';
import { useTheme } from '../../theme/useTheme';

const ICON: Record<TrackId, LucideIcon> = { cycle: Flower2, steps: Footprints, sleep: Moon, heart: HeartPulse };
const WHY: Record<TrackId, string> = {
  cycle: 'Log periods, symptoms and mood; see your phase and an estimated next period.',
  steps: 'Your phone counts steps; set a daily goal.',
  sleep: 'Log bedtime and wake time, or let a watch fill it in.',
  heart: 'Add readings by hand, or get them from a watch.',
};

export default function Track() {
  const { c } = useTheme();
  const { tracks, setTracks } = useAppState();
  const [sel, setSel] = useState<TrackId[]>(tracks);
  const [error, setError] = useState<string | null>(null);

  const toggle = (t: TrackId) => {
    setError(null);
    setSel((s) => (s.includes(t) ? s.filter((x) => x !== t) : [...s, t]));
  };

  const next = async () => {
    if (!sel.length) {
      setError('Pick at least one thing to track.');
      return;
    }
    await setTracks(ALL_TRACKS.filter((t) => sel.includes(t)));
    router.push('/onboarding/profile');
  };

  return (
    <Screen>
      <View style={{ gap: space.xs, marginTop: space.md }}>
        <Text variant="label" tone="muted">
          STEP 1 OF 4
        </Text>
        <Text variant="title" accessibilityRole="header">
          What would you like to track?
        </Text>
        <Text tone="muted">You can change this any time in Settings.</Text>
      </View>

      <View style={{ gap: space.sm }}>
        {ALL_TRACKS.map((t) => {
          const Icon = ICON[t];
          const accent = t === 'cycle' ? c.cycle : t === 'steps' ? c.steps : t === 'sleep' ? c.sleep : c.heart;
          return (
            <View key={t} style={{ gap: 4 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.xs }}>
                <Icon size={18} color={accent} />
                <ToggleChip label={TRACK_LABEL[t]} selected={sel.includes(t)} onPress={() => toggle(t)} accent={accent} />
              </View>
              <Text variant="caption" tone="muted">
                {WHY[t]}
              </Text>
            </View>
          );
        })}
      </View>

      {error ? (
        <Text tone="danger" accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : null}
      <Button label="Continue" onPress={next} />
    </Screen>
  );
}
