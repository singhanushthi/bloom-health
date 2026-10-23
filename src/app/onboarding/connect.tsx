/**
 * Onboarding 3/4: optional Health Connect. Skippable — Bloom works without it.
 * Also offers the phone's step sensor permission when steps are tracked.
 */
import { router } from 'expo-router';
import { Download, Footprints, Info, Link2 } from 'lucide-react-native';
import React, { useEffect, useState } from 'react';
import { AppState as RNAppState, View } from 'react-native';
import { Screen } from '../../components/Screen';
import { Button, Card, Text } from '../../components/ui';
import { openHealthConnectInPlayStore } from '../../health';
import { androidApiLevel, PHONE_STEPS_MIN_API } from '../../health/capabilities';
import { useStepSensor } from '../../sensors/StepSensor';
import { useAppState } from '../../state/AppState';
import { space } from '../../theme/tokens';
import { useTheme } from '../../theme/useTheme';

export default function Connect() {
  const { c } = useTheme();
  const { availability, requestPermissions, refreshConnection, tracks, granted } = useAppState();
  const sensor = useStepSensor();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Re-check when returning from the Play Store.
  useEffect(() => {
    const sub = RNAppState.addEventListener('change', (s) => {
      if (s === 'active') refreshConnection();
    });
    return () => sub.remove();
  }, [refreshConnection]);

  const api = androidApiLevel();
  const allDay = api !== null && api >= PHONE_STEPS_MIN_API;
  const wantsSteps = tracks.includes('steps');

  const finish = async () => {
    // Without Health Connect steps, ask for the phone's activity sensor (foreground counting).
    if (wantsSteps && sensor.permission === 'undetermined') {
      await sensor.request().catch(() => {});
    }
    router.push('/onboarding/done');
  };

  const connect = async () => {
    setBusy(true);
    setError(null);
    try {
      const g = await requestPermissions();
      if (wantsSteps && !g.includes('Steps') && sensor.permission === 'undetermined') await sensor.request().catch(() => {});
      router.push('/onboarding/done');
    } catch (e) {
      setError(`Couldn't open the Health Connect permission sheet. You can try again later in Settings.`);
    } finally {
      setBusy(false);
    }
  };

  const needsInstall = availability === 'unavailable' || availability === 'update-required';
  const canConnect = availability === 'available';

  return (
    <Screen>
      <View style={{ gap: space.xs, marginTop: space.md }}>
        <Text variant="label" tone="muted">
          STEP 2 OF 3 · OPTIONAL
        </Text>
        <Text variant="title" accessibilityRole="header">
          Connect Health Connect for all-day steps (and your watch/Flo if you use them)
        </Text>
        <Text tone="muted">
          {allDay
            ? 'On your phone, Health Connect counts steps all day, even when Bloom is closed.'
            : 'Health Connect lets Bloom read data from a watch, Flo or Google Fit.'}{' '}
          Bloom only reads — it never writes or deletes anything there. Skip this and Bloom still works.
        </Text>
      </View>

      <Card>
        <View style={{ gap: space.sm }}>
          <Row icon={Footprints} accent={c.steps} title="Steps" body={allDay ? 'All-day steps from your phone, plus any watch.' : 'Steps from a watch or fitness app.'} />
          <Row icon={Link2} accent={c.cycle} title="Other apps (optional)" body="Periods from Flo; sleep, heart rate and SpO₂ from a watch via NoiseFit → Google Fit." />
          <Row icon={Info} accent={c.sleep} title="Without it" body={wantsSteps ? 'Bloom counts steps only while it’s open, and you log the rest yourself.' : 'You log everything yourself.'} />
        </View>
      </Card>

      {needsInstall ? (
        <Button label="Get Health Connect" icon={Download} onPress={openHealthConnectInPlayStore} accessibilityHint="Opens the Play Store" />
      ) : canConnect ? (
        <Button label={granted.size ? 'Connected — review permissions' : 'Connect Health Connect'} onPress={connect} loading={busy} accessibilityHint="Opens the Health Connect permission sheet" />
      ) : (
        <Text variant="caption" tone="muted">
          Health Connect isn’t available in this build. You can still use everything else.
        </Text>
      )}
      {error ? (
        <Text tone="danger" accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : null}
      <Button label="Skip for now" variant="ghost" onPress={finish} />
    </Screen>
  );
}

function Row({ icon: Icon, accent, title, body }: { icon: typeof Info; accent: string; title: string; body: string }) {
  return (
    <View accessible accessibilityLabel={`${title}. ${body}`} style={{ flexDirection: 'row', gap: space.sm }}>
      <Icon size={20} color={accent} style={{ marginTop: 2 }} />
      <View style={{ flex: 1 }}>
        <Text variant="bodyStrong">{title}</Text>
        <Text tone="muted">{body}</Text>
      </View>
    </View>
  );
}
