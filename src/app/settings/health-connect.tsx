/**
 * Settings → Health Connect sharing: optional read/write toggles (asked one at a time), the
 * past-data note, and which app supplied each type of data. Connecting itself lives on /connect.
 */
import { router } from 'expo-router';
import { ArrowLeftRight, History, Plug } from 'lucide-react-native';
import React, { useEffect, useState } from 'react';
import { AppState as RNAppState, View } from 'react-native';
import { Screen } from '../../components/Screen';
import { InlineMessage, PageHeader, SettingsGroup, ToggleRow } from '../../components/settings';
import { Button, Card, CardHeader, Skeleton, Text } from '../../components/ui';
import { appName, getSources, METRIC_LABEL, openHealthConnectSettings, READ_RECORD_TYPES } from '../../health';
import { useMetric } from '../../hooks/useMetric';
import { planGranted, requestPlanPermissions } from '../../plan/hc';
import { loadPlanSettings, savePlanSettings, type PlanSettings } from '../../plan/store';
import { SHARING_TOGGLES, type SharingToggle } from '../../settings/healthSharing';
import { useAppState } from '../../state/AppState';
import { space } from '../../theme/tokens';
import { useTheme } from '../../theme/useTheme';

export default function HealthConnectSharing() {
  const app = useAppState();
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    const sub = RNAppState.addEventListener('change', (s) => {
      if (s === 'active') app.refreshConnection();
    });
    return () => sub.remove();
  }, [app.refreshConnection]);

  const connected = app.availability === 'available' && app.granted.size > 0;

  return (
    <Screen
      refreshing={refreshing}
      onRefresh={async () => {
        setRefreshing(true);
        await app.refreshConnection();
        setRefreshing(false);
      }}
    >
      <PageHeader title="Health Connect sharing" subtitle="Choose what Bloom reads from and saves to Health Connect." fallback="/settings" />
      {!connected && !app.demoMode ? (
        <InlineMessage tone="info" title="Health Connect isn’t connected yet" body="Connect it first. Then come back here to choose extras.">
          <Button label="Connect Health Connect" icon={Plug} onPress={() => router.push('/connect')} style={{ marginTop: space.xs }} />
        </InlineMessage>
      ) : null}
      <SharingToggles />
      <PastDataCard />
      <SourcesCard />
    </Screen>
  );
}

function SharingToggles() {
  const app = useAppState();
  const [s, setS] = useState<PlanSettings | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => {
    loadPlanSettings()
      .then(setS)
      .catch(() => {});
  }, []);
  const ready = app.availability === 'available' && !app.demoMode;

  const toggle = async (t: SharingToggle, on: boolean) => {
    setMsg(null);
    if (!on) {
      setS(await savePlanSettings({ [t.key]: false }));
      return;
    }
    // Ask Health Connect only now, only for this one permission.
    const have = await planGranted();
    const ok = have.has(t.perm) || (await requestPlanPermissions([t.perm]));
    if (!ok) {
      setMsg('Health Connect didn’t allow that.');
      return;
    }
    setS(await savePlanSettings({ [t.key]: true }));
    app.bump();
  };

  return (
    <View style={{ gap: space.xs }}>
      <SettingsGroup title="Extras (all optional, off by default)">
        {SHARING_TOGGLES.map((t) => (
          <ToggleRow key={t.key} title={t.title} body={t.body} value={!!s?.[t.key]} disabled={!ready || !s} onChange={(v) => void toggle(t, v)} />
        ))}
      </SettingsGroup>
      <Text variant="caption" tone="muted" style={{ marginHorizontal: space.xxs }}>
        {ready
          ? 'Bloom asks Health Connect for permission only when you turn one on.'
          : app.demoMode
            ? 'Turn off demo mode to change these.'
            : 'These need Health Connect on this phone.'}
      </Text>
      {msg ? (
        <InlineMessage tone="error" title={msg} body="You can allow it in Health Connect → App permissions → Bloom.">
          <Button label="Open Health Connect settings" variant="secondary" onPress={() => openHealthConnectSettings()} />
        </InlineMessage>
      ) : null}
    </View>
  );
}

function PastDataCard() {
  const { c } = useTheme();
  const app = useAppState();
  if (app.availability !== 'available') return null;
  return (
    <Card>
      <CardHeader icon={History} label="Past data" accent={c.sleep} soft={c.sleepSoft} />
      <Text>
        {app.historyRequested
          ? 'Bloom asked for past data. If your cycle history looks short, turn on “Access past data” for Bloom in Health Connect.'
          : 'Bloom hasn’t asked for past data yet, so it can read only about the last 30 days.'}
      </Text>
      <Button
        label="Open Health Connect settings"
        variant="secondary"
        onPress={() => openHealthConnectSettings()}
        accessibilityHint="Opens Health Connect, where you can allow or remove access for Bloom"
        style={{ marginTop: space.md }}
      />
    </Card>
  );
}

function SourcesCard() {
  const { c } = useTheme();
  const app = useAppState();
  const sources = useMetric(getSources);
  if (!app.demoMode && (app.availability !== 'available' || app.granted.size === 0)) return null;
  return (
    <Card>
      <CardHeader icon={ArrowLeftRight} label="Which app sent what · 30 days" accent={c.sleep} soft={c.sleepSoft} />
      <Text tone="muted" style={{ marginBottom: space.sm }}>
        If several apps send steps, Health Connect removes the doubles using its app-priority order.
      </Text>
      {sources.loading && !sources.result ? (
        <View style={{ gap: space.xs }}>
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} height={40} />
          ))}
        </View>
      ) : (
        READ_RECORD_TYPES.map((t, i) => {
          const allowed = app.demoMode || app.granted.has(t);
          const pkgs = sources.result?.data?.[t] ?? [];
          const value = !allowed ? 'Not allowed' : pkgs.length ? pkgs.map(appName).join(', ') : 'No data yet';
          return (
            <View
              key={t}
              accessible
              accessibilityLabel={`${METRIC_LABEL[t]}: ${value}`}
              style={{ paddingVertical: space.sm, borderTopWidth: i === 0 ? 0 : 1, borderTopColor: c.line, flexDirection: 'row', gap: space.sm }}
            >
              <Text variant="bodyStrong" style={{ flex: 1 }}>
                {METRIC_LABEL[t]}
              </Text>
              <Text tone={pkgs.length ? 'ink' : 'muted'} style={{ flex: 1.2, textAlign: 'right' }}>
                {value}
              </Text>
            </View>
          );
        })
      )}
    </Card>
  );
}
