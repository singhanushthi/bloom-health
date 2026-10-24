/** Settings → You & your goals: profile summary, edit goal, what Today shows. */
import { router, useFocusEffect } from 'expo-router';
import { LayoutGrid, RotateCcw, Target } from 'lucide-react-native';
import React, { useCallback, useState } from 'react';
import { View } from 'react-native';
import { Screen } from '../../components/Screen';
import { ChipRow, ToggleChip } from '../../components/sheets/Sheet';
import { PageHeader } from '../../components/settings';
import { Button, Card, CardHeader, Skeleton, Text } from '../../components/ui';
import { ACTIVITY_COPY, ageFrom, DIET_LABEL, PACE_LABEL, type Profile } from '../../plan/profile';
import { loadProfile } from '../../plan/store';
import { ALL_TRACKS, TRACK_LABEL, useAppState, type TrackId } from '../../state/AppState';
import { space } from '../../theme/tokens';
import { useTheme } from '../../theme/useTheme';

export default function ProfileSettings() {
  return (
    <Screen>
      <PageHeader title="You & your goals" subtitle="Your goal, and what Bloom shows on Today." fallback="/settings" />
      <GoalCard />
      <TracksCard />
      <OnboardingAgain />
    </Screen>
  );
}

function GoalCard() {
  const { c } = useTheme();
  const { dataVersion } = useAppState();
  const [profile, setProfile] = useState<Profile | null | undefined>(undefined);

  // Reload after returning from the editor.
  useFocusEffect(
    useCallback(() => {
      let alive = true;
      loadProfile()
        .then((p) => alive && setProfile(p))
        .catch(() => alive && setProfile(null));
      return () => {
        alive = false;
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [dataVersion])
  );

  const rows: [string, string][] = profile
    ? [
        ['Now', `${profile.weightKg} kg`],
        ['Goal', `${profile.targetKg} kg`],
        ['Pace', PACE_LABEL[profile.pace]],
        ['Food', DIET_LABEL[profile.diet]],
        ['Activity', ACTIVITY_COPY[profile.activity].label],
        ['Age', String(ageFrom(profile.birthYear))],
      ]
    : [];

  return (
    <Card>
      <CardHeader icon={Target} label="Your goal" accent={c.cycle} soft={c.cycleSoft} />
      {profile === undefined ? (
        <Skeleton height={96} />
      ) : profile ? (
        <View accessible accessibilityLabel={rows.map(([k, v]) => `${k}: ${v}`).join(', ')} style={{ flexDirection: 'row', flexWrap: 'wrap', rowGap: space.sm }}>
          {rows.map(([k, v]) => (
            <View key={k} style={{ width: '50%' }}>
              <Text variant="caption" tone="muted">
                {k}
              </Text>
              <Text variant="bodyStrong">{v}</Text>
            </View>
          ))}
        </View>
      ) : (
        <Text tone="muted">No goal yet. Set one up to get a gentle food and activity plan. It takes about a minute.</Text>
      )}
      <Button
        label={profile ? 'Edit my goal' : 'Set up my goal'}
        icon={Target}
        onPress={() => router.push('/onboarding/profile?edit=1')}
        accessibilityHint="Opens the goal and profile editor"
        style={{ marginTop: space.md }}
      />
    </Card>
  );
}

function TracksCard() {
  const { c } = useTheme();
  const { tracks, setTracks } = useAppState();
  const toggle = (t: TrackId) => {
    if (tracks.includes(t) && tracks.length === 1) return; // keep at least one
    const next = tracks.includes(t) ? tracks.filter((x) => x !== t) : [...tracks, t];
    setTracks(ALL_TRACKS.filter((x) => next.includes(x)));
  };
  return (
    <Card>
      <CardHeader icon={LayoutGrid} label="What you track" accent={c.cycle} soft={c.cycleSoft} />
      <Text tone="muted" style={{ marginBottom: space.sm }}>
        Today shows only these. Keep at least one.
      </Text>
      <ChipRow label="What you track">
        {ALL_TRACKS.map((t) => (
          <ToggleChip key={t} label={TRACK_LABEL[t]} selected={tracks.includes(t)} onPress={() => toggle(t)} accent={c.cycle} soft={c.cycleSoft} />
        ))}
      </ChipRow>
    </Card>
  );
}

function OnboardingAgain() {
  const app = useAppState();
  return (
    <Button
      label="Show the welcome steps again"
      variant="ghost"
      icon={RotateCcw}
      accessibilityHint="Restarts the short setup. Your data is kept."
      onPress={async () => {
        await app.resetOnboarding();
        router.replace('/onboarding');
      }}
    />
  );
}
