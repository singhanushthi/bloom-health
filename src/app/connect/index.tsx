/**
 * Connect apps & watch: Health Connect status with ONE action that changes with state
 * (Install → Update → Allow access → Connected/Manage), then a calm list of apps. Each row opens
 * a step-by-step wizard (/connect/[appId]). Bloom never talks to other apps directly; it only
 * sees which app wrote each Health Connect record.
 */
import { router } from 'expo-router';
import { Bluetooth, ChevronDown, ChevronUp, HeartPulse, Info, Settings2 } from 'lucide-react-native';
import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, AppState as RNAppState, View } from 'react-native';
import { Screen } from '../../components/Screen';
import { IconBadge, InlineMessage, PageHeader, SettingsGroup, SettingsRow, StatusPill } from '../../components/settings';
import { Button, Card, Skeleton, Text } from '../../components/ui';
import { METRIC_LABEL } from '../../health';
import { CONNECT_APPS, computeStatuses, readRecentSources, type AppStatusInfo, type ConnectApp, type ConnectStatus } from '../../health/apps';
import { FEATURED_APP_IDS, WIZARDS } from '../../health/connectWizard';
import { useHealthConnectAccess } from '../../health/useHealthConnectAccess';
import { useAppState } from '../../state/AppState';
import { space, touch } from '../../theme/tokens';
import { useTheme } from '../../theme/useTheme';

const featured = FEATURED_APP_IDS.map((id) => CONNECT_APPS.find((a) => a.id === id)).filter((a): a is ConnectApp => !!a);
const more = CONNECT_APPS.filter((a) => !FEATURED_APP_IDS.includes(a.id));

export default function ConnectAppsScreen() {
  const { c } = useTheme();
  const app = useAppState();
  const [status, setStatus] = useState<ConnectStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showMore, setShowMore] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setStatus(computeStatuses(await readRecentSources({ ...app.ctx, now: new Date() })));
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

  // Permissions may change in Health Connect while Bloom is in the background.
  useEffect(() => {
    const sub = RNAppState.addEventListener('change', (s) => {
      if (s === 'active') app.refreshConnection();
    });
    return () => sub.remove();
  }, [app.refreshConnection]);

  return (
    <Screen
      refreshing={refreshing}
      onRefresh={async () => {
        setRefreshing(true);
        await app.refreshConnection();
        await load();
        setRefreshing(false);
      }}
    >
      <PageHeader title="Connect apps & watch" subtitle="Bring in data from your watch and other apps. Bloom works fine without them." fallback="/settings" />

      <HealthConnectHero />

      <SettingsGroup title="Your apps">
        {featured.map((a) => (
          <AppRow key={a.id} app={a} info={status?.byApp[a.id]} loading={loading && !status} />
        ))}
        {showMore ? more.map((a) => <AppRow key={a.id} app={a} info={status?.byApp[a.id]} loading={loading && !status} />) : null}
        <Expander open={showMore} onToggle={() => setShowMore((v) => !v)} label={showMore ? 'Show fewer apps' : `Show ${more.length} more apps`} />
      </SettingsGroup>

      <SettingsGroup title="Watch without an app">
        <SettingsRow
          icon={Bluetooth}
          title="Connect a watch directly (beta)"
          body="Heart rate over Bluetooth, if your watch supports it"
          onPress={() => router.push('/watch')}
          accessibilityHint="Opens the direct Bluetooth watch screen"
        />
      </SettingsGroup>

      <OtherApps others={status?.others ?? []} loading={loading} />

      <View accessible style={{ flexDirection: 'row', gap: space.xs, alignItems: 'flex-start', paddingHorizontal: space.xxs }}>
        <Info size={18} color={c.muted} />
        <Text variant="caption" tone="muted" style={{ flex: 1 }}>
          Don’t see your app? If it syncs with Health Connect, it works with Bloom. Your data stays on this phone.
        </Text>
      </View>
    </Screen>
  );
}

/* ----------------------------- Health Connect ----------------------------- */

function HealthConnectHero() {
  const { c } = useTheme();
  const access = useHealthConnectAccess();
  const { state } = access;
  const done = state.kind === 'connected';

  return (
    <Card tint={done ? c.spo2Soft : undefined}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
        <IconBadge icon={HeartPulse} accent={c.heart} soft={done ? c.surface : c.heartSoft} size={48} />
        <View style={{ flex: 1 }}>
          <Text variant="label" tone="muted" style={{ textTransform: 'uppercase' }}>
            Health Connect
          </Text>
          <Text variant="heading" accessibilityRole="header" accessibilityLiveRegion="polite">
            {state.title}
          </Text>
        </View>
      </View>
      <Text style={{ marginTop: space.sm }}>{state.body}</Text>
      {state.kind === 'checking' ? <Skeleton height={52} style={{ marginTop: space.md }} /> : null}
      {state.action ? (
        <Button
          label={state.action}
          icon={done ? Settings2 : undefined}
          variant={done ? 'secondary' : 'primary'}
          onPress={() => void access.run()}
          loading={access.busy}
          accessibilityHint={
            state.kind === 'allow'
              ? 'Opens the Health Connect permission screen'
              : state.kind === 'connected'
                ? 'Opens Health Connect, where you can change what Bloom can read'
                : 'Opens the Play Store'
          }
          style={{ marginTop: space.md }}
        />
      ) : null}
      {access.problem ? (
        <View style={{ marginTop: space.md }}>
          <InlineMessage tone="error" title={access.problem.title} body={access.problem.body}>
            <Button label="Open Health Connect settings" variant="secondary" onPress={access.openSettings} style={{ marginTop: space.xs }} />
          </InlineMessage>
        </View>
      ) : null}
    </Card>
  );
}

/* --------------------------------- Rows ---------------------------------- */

function Monogram({ text }: { text: string }) {
  const { c } = useTheme();
  return (
    <View
      importantForAccessibility="no-hide-descendants"
      style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: c.cycleSoft, alignItems: 'center', justifyContent: 'center' }}
    >
      <Text variant="bodyStrong">{text}</Text>
    </View>
  );
}

function rowStatus(info: AppStatusInfo | undefined): { tone: 'done' | 'todo' | 'warn'; label: string } {
  if (info?.status === 'sharing') return { tone: 'done', label: 'Connected ✓' };
  if (info?.status === 'not-android') return { tone: 'warn', label: 'Not on Android' };
  if (info?.status === 'no-health-connect') return { tone: 'warn', label: 'Needs a bridge' };
  return { tone: 'todo', label: 'Set up →' };
}

function AppRow({ app: a, info, loading }: { app: ConnectApp; info?: AppStatusInfo; loading: boolean }) {
  const { c } = useTheme();
  const st = rowStatus(info);
  const sub = WIZARDS[a.id]?.path?.gets ?? a.note ?? a.shares.slice(0, 3).join(', ');
  return (
    <Pressable
      onPress={() => router.push(`/connect/${a.id}`)}
      accessibilityRole="button"
      accessibilityLabel={`${a.name}. ${loading ? 'Checking' : st.label.replace(/[✓→]/g, '').trim()}. ${sub}`}
      accessibilityHint={`Opens step-by-step setup for ${a.name}`}
      android_ripple={{ color: c.line }}
      style={({ pressed }) => ({
        minHeight: touch.min + 28,
        flexDirection: 'row',
        alignItems: 'center',
        gap: space.sm,
        paddingHorizontal: space.md,
        paddingVertical: space.sm,
        backgroundColor: pressed ? c.surfaceAlt : 'transparent',
      })}
    >
      <Monogram text={a.monogram} />
      <View style={{ flex: 1 }}>
        <Text variant="bodyStrong">{a.name}</Text>
        <Text variant="caption" tone="muted" numberOfLines={1}>
          {sub}
        </Text>
      </View>
      {loading ? <Skeleton height={28} width={88} /> : <StatusPill tone={st.tone} label={st.label} />}
    </Pressable>
  );
}

function Expander({ open, onToggle, label }: { open: boolean; onToggle: () => void; label: string }) {
  const { c } = useTheme();
  const Icon = open ? ChevronUp : ChevronDown;
  return (
    <Pressable
      onPress={onToggle}
      accessibilityRole="button"
      accessibilityState={{ expanded: open }}
      accessibilityLabel={label}
      android_ripple={{ color: c.line }}
      style={({ pressed }) => ({
        minHeight: touch.min + 8,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: space.xs,
        backgroundColor: pressed ? c.surfaceAlt : 'transparent',
      })}
    >
      <Text variant="bodyStrong">{label}</Text>
      <Icon size={20} color={c.ink} />
    </Pressable>
  );
}

function OtherApps({ others, loading }: { others: ConnectStatus['others']; loading: boolean }) {
  const [open, setOpen] = useState(false);
  const label = loading ? 'Other apps sending data' : `Other apps sending data (${others.length})`;
  return (
    <SettingsGroup>
      <Expander open={open} onToggle={() => setOpen((v) => !v)} label={label} />
      {open ? (
        <View style={{ padding: space.md, gap: space.sm }}>
          {loading ? (
            <Skeleton height={24} />
          ) : others.length === 0 ? (
            <Text tone="muted">None in the last 30 days.</Text>
          ) : (
            others.map((o) => (
              <View key={o.pkg} accessible accessibilityLabel={`${o.name}. Sends ${o.metrics.map((m) => METRIC_LABEL[m]).join(', ')}`}>
                <Text variant="bodyStrong">{o.name}</Text>
                <Text variant="caption" tone="muted">
                  {o.metrics.map((m) => METRIC_LABEL[m]).join(', ')} · {o.pkg}
                </Text>
              </View>
            ))
          )}
        </View>
      ) : null}
    </SettingsGroup>
  );
}

