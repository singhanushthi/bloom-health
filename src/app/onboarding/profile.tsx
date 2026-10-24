/**
 * Onboarding 2/4 (optional): profile & goal. Also used from Plan → "Edit goal" (?edit=1).
 */
import { router, useLocalSearchParams } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { View } from 'react-native';
import { Screen } from '../../components/Screen';
import { Button, CardSkeleton, Text } from '../../components/ui';
import { todayKey } from '../../health/dates';
import type { Profile } from '../../plan/profile';
import { loadProfile, saveProfile } from '../../plan/store';
import { DEFAULT_DRAFT, ProfileForm } from '../../plan/ui/ProfileForm';
import { BackHeader } from '../../plan/ui/parts';
import { space } from '../../theme/tokens';

export default function ProfileStep() {
  const params = useLocalSearchParams<{ edit?: string }>();
  const editing = params?.edit === '1';
  const [initial, setInitial] = useState<Profile | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadProfile()
      .then((p) => setInitial(p ?? DEFAULT_DRAFT()))
      .catch(() => setInitial(DEFAULT_DRAFT()));
  }, []);

  const save = async (p: Profile) => {
    setBusy(true);
    setError(null);
    try {
      const prev = await loadProfile();
      const goalChanged = !prev || prev.targetKg !== p.targetKg || prev.pace !== p.pace || prev.formula !== p.formula;
      await saveProfile({ ...p, startDay: goalChanged ? todayKey() : prev.startDay });
      if (editing) {
        if (router.canGoBack()) router.back();
        else router.replace('/(tabs)/plan');
      } else router.push('/onboarding/connect');
    } catch {
      setError('Couldn’t save. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      {editing ? (
        <BackHeader title="Your goal" subtitle="Change anything — your plan updates right away." />
      ) : (
        <View style={{ gap: space.xs, marginTop: space.md }}>
          <Text variant="label" tone="muted">
            STEP 2 OF 4 · OPTIONAL
          </Text>
          <Text variant="title" accessibilityRole="header">
            A gentle plan, if you’d like one
          </Text>
          <Text tone="muted">
            A few details give you a comfortable daily calorie range, protein and water — with room for treats. Nothing here
            leaves your phone.
          </Text>
        </View>
      )}
      {initial ? (
        <ProfileForm key={initial.startDay} initial={initial} saveLabel={editing ? 'Save my goal' : 'Save and continue'} onSave={save} busy={busy} />
      ) : (
        <CardSkeleton label="profile" height={300} />
      )}
      {error ? (
        <Text tone="danger" accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : null}
      {!editing ? <Button label="Skip for now" variant="ghost" onPress={() => router.push('/onboarding/connect')} /> : null}
      <Text variant="caption" tone="muted">
        General guidance, not medical advice. If you’re pregnant, breastfeeding or managing a health condition, plan with your doctor.
      </Text>
    </Screen>
  );
}
