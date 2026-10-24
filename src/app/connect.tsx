/**
 * "Connect your apps": Health Connect status on top, then one card per popular app with
 * what it can share, whether Bloom has seen its data in the last 30 days, and a short
 * how-to. Logo-free (monogram circles), read-only, nothing leaves the phone.
 */
import { router } from 'expo-router';
import {
  ArrowLeft,
  Bluetooth,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  CircleCheck,
  CircleDashed,
  CircleSlash,
  ExternalLink,
  HeartPulse,
  Info,
  ShieldCheck,
  Store,
} from 'lucide-react-native';
import React, { useCallback, useEffect, useState } from 'react';
import { Linking, Pressable, AppState as RNAppState, View } from 'react-native';
import { Screen } from '../components/Screen';
import { Button, Card, Chip, IconButton, Skeleton, Text } from '../components/ui';
import { METRIC_LABEL, openHealthConnectInPlayStore, openHealthConnectSettings } from '../health';
import {
  CONNECT_APPS,
  computeStatuses,
  openHealthConnectData,
  playStoreSearchUrl,
  readRecentSources,
  type AppStatusInfo,
  type ConnectApp,
  type ConnectStatus,
} from '../health/apps';
import { useAppState } from '../state/AppState';
import { radius, space, touch } from '../theme/tokens';
import { useTheme } from '../theme/useTheme';

export default function ConnectAppsScreen() {
  const { c } = useTheme();
  const app = useAppState();
  const [status, setStatus] = useState<ConnectStatus | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const sources = await readRecentSources({ ...app.ctx, now: new Date() });
      setStatus(computeStatuses(sources));
    } catch {
      setStatus(computeStatuses({}));
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [app.dataVersion, app.ctx.mode, app.granted]);

  useEffect(() => {
    load();
  }, [load]);

  // Permissions/apps may change while Bloom is in the background.
  useEffect(() => {
    const sub = RNAppState.addEventListener('change', (s) => {
      if (s === 'active') app.refreshConnection();
    });
    return () => sub.remove();
  }, [app.refreshConnection]);

  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = async () => {
    setRefreshing(true);
    await app.refreshConnection();
    await load();
    setRefreshing(false);
  };

  return (
    <Screen refreshing={refreshing} onRefresh={onRefresh}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
        <IconButton
          icon={ArrowLeft}
          accessibilityLabel="Back"
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)/settings'))}
        />
      </View>
      <Text variant="display" accessibilityRole="header">
        Connect your apps
      </Text>
      <Text tone="muted">
        Bloom connects through Health Connect, Android’s health hub — any app that syncs there can share with Bloom.
      </Text>

      <HealthConnectStatusCard />

      <DirectWatchCard />

      <Text variant="title" accessibilityRole="header" style={{ marginTop: space.xs }}>
        Apps
      </Text>
      {CONNECT_APPS.map((a) =>
        loading && !status ? (
          <Card key={a.id} accessibilityLabel={`Loading ${a.name}`}>
            <Skeleton height={20} width={160} />
            <Skeleton height={44} style={{ marginTop: space.sm }} />
          </Card>
        ) : (
          <AppCard key={a.id} app={a} info={status?.byApp[a.id]} />
        )
      )}

      <OtherAppsCard others={status?.others ?? []} loading={loading} />

      <Card tint={c.surfaceAlt}>
        <View style={{ flexDirection: 'row', gap: space.sm }}>
          <Info size={22} color={c.ink} />
          <Text style={{ flex: 1 }}>
            Don’t see your app? If it syncs with Health Connect, it works with Bloom.
          </Text>
        </View>
      </Card>
      <Card tint={c.spo2Soft}>
        <View style={{ flexDirection: 'row', gap: space.sm, alignItems: 'center' }}>
          <ShieldCheck size={22} color={c.spo2} />
          <Text variant="bodyStrong" style={{ flex: 1 }}>
            Data stays on this phone.
          </Text>
        </View>
      </Card>
    </Screen>
  );
}

/* ------------------------- Health Connect status ------------------------ */

function HealthConnectStatusCard() {
  const { c } = useTheme();
  const app = useAppState();
  const [busy, setBusy] = useState(false);
  const a = app.availability;
  const grantedCount = app.granted.size;

  let title: string;
  let body: string;
  let StatusIcon = CircleDashed;
  let action: { label: string; onPress: () => void; hint: string } | null = null;

  if (a === 'checking') {
    title = 'Checking Health Connect…';
    body = 'One moment.';
  } else if (a === 'unsupported' || a === 'unavailable') {
    title = 'Health Connect isn’t installed';
    body = 'Install it from the Play Store (it’s free, from Google). Android 14+ phones already have it built in.';
    StatusIcon = CircleSlash;
    action = { label: 'Get Health Connect', onPress: () => openHealthConnectInPlayStore(), hint: 'Opens the Play Store' };
  } else if (a === 'update-required') {
    title = 'Health Connect needs an update';
    body = 'Update it from the Play Store, then come back.';
    StatusIcon = CircleSlash;
    action = { label: 'Update Health Connect', onPress: () => openHealthConnectInPlayStore(), hint: 'Opens the Play Store' };
  } else if (grantedCount === 0) {
    title = 'Installed — not connected yet';
    body = 'Allow Bloom to read your data. Bloom only reads; it never writes or uploads.';
    action = {
      label: 'Connect Health Connect',
      hint: 'Opens the Health Connect permission screen',
      onPress: async () => {
        setBusy(true);
        try {
          await app.requestPermissions();
        } finally {
          setBusy(false);
        }
      },
    };
  } else {
    title = 'Connected';
    body = `Bloom can read ${grantedCount} type${grantedCount === 1 ? '' : 's'} of data.`;
    StatusIcon = CircleCheck;
    action = { label: 'Manage permissions', onPress: () => openHealthConnectSettings(), hint: 'Opens Health Connect settings' };
  }

  return (
    <Card>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, marginBottom: space.sm }}>
        <View
          importantForAccessibility="no-hide-descendants"
          style={{
            width: 44,
            height: 44,
            borderRadius: 22,
            backgroundColor: c.heartSoft,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <HeartPulse size={22} color={c.heart} />
        </View>
        <View style={{ flex: 1 }}>
          <Text variant="label" tone="muted" style={{ textTransform: 'uppercase' }}>
            Health Connect
          </Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <StatusIcon size={18} color={c.ink} />
            <Text variant="bodyStrong" accessibilityLiveRegion="polite">
              {title}
            </Text>
          </View>
        </View>
      </View>
      <Text tone="muted">{body}</Text>
      {action ? (
        <Button
          label={action.label}
          onPress={action.onPress}
          loading={busy}
          accessibilityHint={action.hint}
          style={{ marginTop: space.md }}
        />
      ) : null}
    </Card>
  );
}

/* --------------------------- Direct watch card --------------------------- */

function DirectWatchCard() {
  const { c } = useTheme();
  return (
    <Pressable
      onPress={() => router.push('/watch')}
      accessibilityRole="button"
      accessibilityLabel="Connect a watch directly (beta). Heart rate over Bluetooth, no companion app, if your watch supports it."
      accessibilityHint="Opens the direct Bluetooth watch screen"
      android_ripple={{ color: c.line }}
      style={({ pressed }) => ({ opacity: pressed ? 0.85 : 1, borderRadius: radius.card })}
    >
      <Card>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
          <View
            importantForAccessibility="no-hide-descendants"
            style={{
              width: 44,
              height: 44,
              borderRadius: 22,
              backgroundColor: c.sleepSoft,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Bluetooth size={22} color={c.sleep} />
          </View>
          <View style={{ flex: 1 }}>
            <Text variant="heading">Connect a watch directly (beta)</Text>
            <Text variant="caption" tone="muted">
              Heart rate over Bluetooth, no companion app — if your watch supports it.
            </Text>
          </View>
          <ChevronRight size={22} color={c.ink} />
        </View>
      </Card>
    </Pressable>
  );
}

/* -------------------------------- App card ------------------------------- */

function Monogram({ text }: { text: string }) {
  const { c } = useTheme();
  return (
    <View
      importantForAccessibility="no-hide-descendants"
      style={{
        width: 48,
        height: 48,
        borderRadius: 24,
        backgroundColor: c.cycleSoft,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Text variant="title" style={{ fontSize: 22, lineHeight: 28 }}>
        {text}
      </Text>
    </View>
  );
}

function statusText(info: AppStatusInfo | undefined): string {
  switch (info?.status) {
    case 'sharing':
      return 'Sharing with Bloom';
    case 'no-health-connect':
      return 'Can’t connect directly';
    case 'not-android':
      return 'Not available on Android';
    default:
      return 'Not connected yet';
  }
}

function AppCard({ app: a, info }: { app: ConnectApp; info?: AppStatusInfo }) {
  const { c } = useTheme();
  const [open, setOpen] = useState(false);
  const sharing = info?.status === 'sharing';
  const label = statusText(info);
  const StatusIcon = sharing ? CircleCheck : info?.status === 'not-android' || info?.status === 'no-health-connect' ? CircleSlash : CircleDashed;

  return (
    <Card>
      <View style={{ flexDirection: 'row', gap: space.sm, alignItems: 'center' }}>
        <Monogram text={a.monogram} />
        <View style={{ flex: 1 }}>
          <Text variant="heading" accessibilityRole="header">
            {a.name}
          </Text>
          {a.note ? (
            <Text variant="caption" tone="muted">
              {a.note}
            </Text>
          ) : null}
        </View>
      </View>

      {/* Status: icon + text (never colour alone) */}
      <View
        accessible
        accessibilityLabel={`${a.name}: ${label}`}
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 6,
          alignSelf: 'flex-start',
          marginTop: space.sm,
          paddingHorizontal: space.sm,
          paddingVertical: 6,
          borderRadius: radius.chip,
          backgroundColor: sharing ? c.spo2Soft : c.surfaceAlt,
        }}
      >
        <StatusIcon size={16} color={sharing ? c.spo2 : c.muted} />
        <Text variant="caption">{label}</Text>
      </View>

      <Text variant="label" tone="muted" style={{ marginTop: space.sm, textTransform: 'uppercase' }}>
        Can share
      </Text>
      <View
        accessible
        accessibilityLabel={`Can share: ${a.shares.join(', ')}`}
        style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.xs, marginTop: 6 }}
      >
        {a.shares.map((s) => (
          <Chip key={s} label={s} />
        ))}
      </View>

      {sharing && info?.metrics.length ? (
        <Text tone="muted" style={{ marginTop: space.sm }}>
          Seen in the last 30 days: {info.metrics.map((m) => METRIC_LABEL[m]).join(', ')}.
        </Text>
      ) : null}

      {!sharing ? (
        <>
          <Pressable
            onPress={() => setOpen((v) => !v)}
            accessibilityRole="button"
            accessibilityState={{ expanded: open }}
            accessibilityLabel={`How to connect ${a.name}`}
            android_ripple={{ color: c.line }}
            style={({ pressed }) => ({
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              minHeight: touch.min,
              marginTop: space.sm,
              opacity: pressed ? 0.8 : 1,
            })}
          >
            <Text variant="bodyStrong">How to connect</Text>
            {open ? <ChevronUp size={22} color={c.ink} /> : <ChevronDown size={22} color={c.ink} />}
          </Pressable>
          {open && a.directOption ? (
            <View style={{ gap: space.xs, marginTop: space.xxs }}>
              <Text variant="label" tone="muted" style={{ textTransform: 'uppercase' }}>
                Option 1
              </Text>
              <Text variant="bodyStrong">{a.directOption.title}</Text>
              <Text>{a.directOption.body}</Text>
              <Button
                variant="secondary"
                icon={Bluetooth}
                label="Connect watch directly (beta)"
                accessibilityHint="Opens the direct Bluetooth watch screen"
                onPress={() => router.push(a.directOption!.route)}
              />
              <Text variant="label" tone="muted" style={{ textTransform: 'uppercase', marginTop: space.sm }}>
                Option 2
              </Text>
              <Text variant="bodyStrong">{a.note ? `${a.note} (full data)` : 'Through Health Connect (full data)'}</Text>
            </View>
          ) : null}
          {open ? (
            <View style={{ gap: space.xs, marginTop: space.xxs }}>
              {a.steps.map((s, i) => (
                <View key={i} style={{ flexDirection: 'row', gap: space.sm }}>
                  <View
                    importantForAccessibility="no-hide-descendants"
                    style={{
                      width: 24,
                      height: 24,
                      borderRadius: 12,
                      backgroundColor: c.surfaceAlt,
                      alignItems: 'center',
                      justifyContent: 'center',
                      marginTop: 2,
                    }}
                  >
                    <Text variant="caption">{i + 1}</Text>
                  </View>
                  <Text style={{ flex: 1 }} accessibilityLabel={`Step ${i + 1}: ${s}`}>
                    {s}
                  </Text>
                </View>
              ))}
            </View>
          ) : null}
          {a.route !== 'not-android' ? (
            <View style={{ gap: space.xs, marginTop: space.md }}>
              {a.storeQuery ? (
                <Button
                  variant="secondary"
                  icon={Store}
                  label="Open in Play Store"
                  accessibilityLabel={`Open ${a.name} in the Play Store`}
                  onPress={() => Linking.openURL(playStoreSearchUrl(a.storeQuery!)).catch(() => {})}
                />
              ) : null}
              <Button
                variant="ghost"
                icon={ExternalLink}
                label="Open Health Connect"
                accessibilityHint="Opens Health Connect's data and access screen"
                onPress={openHealthConnectData}
              />
            </View>
          ) : null}
        </>
      ) : null}
    </Card>
  );
}

/* ----------------------------- Other origins ----------------------------- */

function OtherAppsCard({ others, loading }: { others: ConnectStatus['others']; loading: boolean }) {
  const { c } = useTheme();
  return (
    <Card>
      <Text variant="heading" accessibilityRole="header">
        Other apps sending data
      </Text>
      {loading ? (
        <Skeleton height={24} style={{ marginTop: space.sm }} />
      ) : others.length === 0 ? (
        <Text tone="muted" style={{ marginTop: space.xxs }}>
          None in the last 30 days.
        </Text>
      ) : (
        <View style={{ gap: space.sm, marginTop: space.sm }}>
          {others.map((o) => (
            <View
              key={o.pkg}
              accessible
              accessibilityLabel={`${o.name}, ${o.pkg}. Shares ${o.metrics.map((m) => METRIC_LABEL[m]).join(', ')}`}
              style={{ flexDirection: 'row', gap: space.sm, alignItems: 'center' }}
            >
              <View
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 18,
                  backgroundColor: c.surfaceAlt,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Text variant="bodyStrong">{o.name.charAt(0).toUpperCase()}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text variant="bodyStrong">{o.name}</Text>
                <Text variant="caption" tone="muted">
                  {o.pkg} · {o.metrics.map((m) => METRIC_LABEL[m]).join(', ')}
                </Text>
              </View>
            </View>
          ))}
        </View>
      )}
    </Card>
  );
}
