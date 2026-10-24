/** Settings → Period & reminders: wraps the shared cycle settings section. */
import { router } from 'expo-router';
import React from 'react';
import { Screen } from '../../components/Screen';
import { InlineMessage, PageHeader } from '../../components/settings';
import { Button } from '../../components/ui';
import { CycleSettingsSection } from '../../cycle/CycleSettingsSection';
import { useAppState } from '../../state/AppState';

export default function CycleSettingsPage() {
  const { tracks } = useAppState();
  const tracking = tracks.includes('cycle');
  return (
    <Screen>
      <PageHeader title="Period & reminders" subtitle="Your usual cycle, gentle reminders and privacy." fallback="/settings" />
      {!tracking ? (
        <InlineMessage tone="info" title="Cycle tracking is off" body="Turn it on to see your cycle on Today and set your usual lengths.">
          <Button label="Change what you track" variant="secondary" onPress={() => router.push('/settings/profile')} />
        </InlineMessage>
      ) : null}
      <CycleSettingsSection showCycle={tracking} />
    </Screen>
  );
}
