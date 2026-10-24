/**
 * Settings (opened from the gear on Today): what to track, your plan (goal + optional Health
 * Connect sharing), connect apps, steps (goal, stride, phone sensor), AI Coach (Gemini key),
 * Health Connect (optional), connected apps checklist (optional), your data (export/delete),
 * demo mode and privacy.
 */
import { router } from 'expo-router';
import {
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  CircleCheck,
  Database,
  Download,
  ExternalLink,
  Footprints,
  KeyRound,
  LayoutGrid,
  Link2,
  Minus,
  Plus,
  RefreshCw,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Store,
  Target,
  Trash2,
  Plug,
} from 'lucide-react-native';
import React, { useEffect, useState } from 'react';
import { Alert, Pressable, AppState as RNAppState, Switch, TextInput, View } from 'react-native';
import { useCoach } from '../../ai/CoachState';
import { clearSummaryCache } from '../../ai/summary';
import { Screen } from '../../components/Screen';
import { Field, Input, ToggleChip, ChipRow } from '../../components/sheets/Sheet';
import { SyncChecklist } from '../../components/SyncChecklist';
import { Button, Card, CardHeader, IconButton, Skeleton, Text } from '../../components/ui';
import { deleteAllData } from '../../db/repos';
import { exportAndShare } from '../../db/share';
import {
  appName,
  getSources,
  METRIC_LABEL,
  openHealthConnectInPlayStore,
  openHealthConnectSettings,
  READ_RECORD_TYPES,
} from '../../health';
import { androidApiLevel, PHONE_STEPS_MIN_API } from '../../health/capabilities';
import { useMetric } from '../../hooks/useMetric';
import { useStepSensor } from '../../sensors/StepSensor';
import {
  ALL_TRACKS,
  STEP_GOAL_MAX,
  STEP_GOAL_MIN,
  STRIDE_MAX_M,
  STRIDE_MIN_M,
  TRACK_LABEL,
  useAppState,
  type TrackId,
} from '../../state/AppState';
import { fonts, radius, space } from '../../theme/tokens';
import { useTheme } from '../../theme/useTheme';
import { planGranted, requestPlanPermissions, type PlanPermission } from '../../plan/hc';
import { loadPlanSettings, savePlanSettings, type PlanSettings } from '../../plan/store';
import { touch } from '../../theme/tokens';

export default function SettingsScreen() {
  const { c } = useTheme();
  const app = useAppState();
  const [refreshing, setRefreshing] = useState(false);

  // Permissions may change in Health Connect / Android settings while we're backgrounded.
  useEffect(() => {
    const sub = RNAppState.addEventListener('change', (s) => {
      if (s === 'active') app.refreshConnection();
    });
    return () => sub.remove();
  }, [app.refreshConnection]);

  const onRefresh = async () => {
    setRefreshing(true);
    await app.refreshConnection();
    setRefreshing(false);
  };

  return (
    <Screen refreshing={refreshing} onRefresh={onRefresh}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
        <IconButton
          icon={ChevronLeft}
          accessibilityLabel="Back"
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)'))}
        />
        <Text variant="display" accessibilityRole="header" style={{ flex: 1 }}>
          Settings
        </Text>
      </View>

      <TracksCard />
      <PlanCard />
      <NavRow
        icon={Plug}
        title="Connect apps"
        body="Health Connect, Google Fit, a watch or Flo — step by step"
        onPress={() => router.push('/connect')}
      />
      <StepsCard />
      <CoachCard />
      <HealthConnectCard />
      <SourcesCard />

      <Card>
        <CardHeader icon={Link2} label="Connected apps (optional)" accent={c.spo2} soft={c.spo2Soft} />
        <Text tone="muted" style={{ marginBottom: space.sm }}>
          Bloom works on its own. If you also use Flo or a Noise watch, these steps let their data flow into Health
          Connect so Bloom can show it too.
        </Text>
        <SyncChecklist />
      </Card>

      <DataCard />

      {/* Demo mode */}
      <Card>
        <CardHeader icon={Sparkles} label="Demo mode" accent={c.sleep} soft={c.sleepSoft} />
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: 48 }}>
          <View style={{ flex: 1 }}>
            <Text variant="bodyStrong">Show sample data</Text>
            <Text tone="muted">Preview every screen with realistic mock data. Your real data is untouched.</Text>
          </View>
          <Switch
            value={app.demoMode}
            onValueChange={(v) => {
              clearSummaryCache();
              app.setDemoMode(v);
            }}
            accessibilityLabel="Demo mode"
            accessibilityHint="Replaces your data with sample data on every screen"
            trackColor={{ false: c.line, true: c.sleep }}
            thumbColor={c.surface}
            style={{ minWidth: 48, minHeight: 48 }}
          />
        </View>
      </Card>

      {/* Privacy */}
      <Card tint={c.spo2Soft}>
        <View style={{ flexDirection: 'row', gap: space.sm }}>
          <ShieldCheck size={22} color={c.spo2} />
          <View style={{ flex: 1, gap: 4 }}>
            <Text variant="bodyStrong">Your data stays on this phone</Text>
            <Text>
              Everything you log is stored only on this phone. Health Connect is on-device; Bloom only writes to it if you
              turn that on under Your plan. There’s no account, no server and no analytics. The only thing that ever leaves the phone is what you send to the
              optional AI coach (your question plus a data summary, to Google).
            </Text>
          </View>
        </View>
      </Card>

      <Button
        label="Show onboarding again"
        variant="ghost"
        onPress={async () => {
          await app.resetOnboarding();
          router.replace('/onboarding');
        }}
      />
    </Screen>
  );
}

/* ------------------------------- Tracking -------------------------------- */

function TracksCard() {
  const { c } = useTheme();
  const { tracks, setTracks } = useAppState();
  const toggle = (t: TrackId) => {
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
          <ToggleChip
            key={t}
            label={TRACK_LABEL[t]}
            selected={tracks.includes(t)}
            onPress={() => (tracks.includes(t) && tracks.length === 1 ? undefined : toggle(t))}
            accent={c.cycle}
            soft={c.cycleSoft}
          />
        ))}
      </ChipRow>
    </Card>
  );
}

/* ---------------------------------- Plan ---------------------------------- */

function NavRow({ icon: Icon, title, body, onPress }: { icon: typeof Plug; title: string; body: string; onPress: () => void }) {
  const { c } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityHint={body}
      android_ripple={{ color: c.line }}
      style={({ pressed }) => ({
        minHeight: touch.min + 20,
        flexDirection: 'row',
        alignItems: 'center',
        gap: space.sm,
        padding: space.md,
        borderRadius: radius.card,
        backgroundColor: c.surface,
        borderWidth: 1,
        borderColor: c.line,
        opacity: pressed ? 0.85 : 1,
      })}
    >
      <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: c.spo2Soft, alignItems: 'center', justifyContent: 'center' }}>
        <Icon size={20} color={c.spo2} />
      </View>
      <View style={{ flex: 1 }}>
        <Text variant="bodyStrong">{title}</Text>
        <Text variant="caption" tone="muted">
          {body}
        </Text>
      </View>
      <ChevronRight size={20} color={c.muted} />
    </Pressable>
  );
}

const PLAN_TOGGLES: { key: keyof PlanSettings; perm: PlanPermission; title: string; body: string }[] = [
  { key: 'hcReadWeight', perm: 'read:Weight', title: 'Read weight from Health Connect', body: 'From a smart scale or Google Health. Shown with its source.' },
  { key: 'hcWriteWeight', perm: 'write:Weight', title: 'Save my weights to Health Connect', body: 'So other apps can see weights you log in Bloom.' },
  { key: 'hcWriteNutrition', perm: 'write:Nutrition', title: 'Save meals to Health Connect', body: 'Each food you log, as a nutrition record.' },
  { key: 'hcWriteExercise', perm: 'write:ExerciseSession', title: 'Save workouts to Health Connect', body: 'Activities and yoga sessions you log in Bloom.' },
];

function PlanCard() {
  const { c } = useTheme();
  const app = useAppState();
  const [s, setS] = useState<PlanSettings | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => {
    loadPlanSettings()
      .then(setS)
      .catch(() => {});
  }, []);
  const hcReady = app.availability === 'available' && !app.demoMode;

  const toggle = async (key: keyof PlanSettings, perm: PlanPermission, on: boolean) => {
    setMsg(null);
    if (!on) {
      setS(await savePlanSettings({ [key]: false }));
      return;
    }
    // Ask Health Connect only now, only for this one permission.
    const have = await planGranted();
    const ok = have.has(perm) || (await requestPlanPermissions([perm]));
    if (!ok) {
      setMsg('Health Connect didn’t allow that. You can allow it in Health Connect → App permissions → Bloom.');
      return;
    }
    setS(await savePlanSettings({ [key]: true }));
    app.bump();
  };

  return (
    <Card>
      <CardHeader icon={Target} label="Your plan" accent={c.cycle} soft={c.cycleSoft} />
      <Button label="Edit goal and profile" variant="secondary" icon={Target} onPress={() => router.push('/onboarding/profile?edit=1')} />
      <Text variant="bodyStrong" style={{ marginTop: space.md }}>
        Health Connect sharing (optional)
      </Text>
      <Text variant="caption" tone="muted" style={{ marginBottom: space.xs }}>
        {hcReady
          ? 'Off by default. Bloom asks Health Connect for permission only when you turn one on.'
          : 'Needs Health Connect on this phone (and demo mode off).'}
      </Text>
      {PLAN_TOGGLES.map((t) => (
        <View key={t.key} style={{ flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: 56, borderTopWidth: 1, borderTopColor: c.line }}>
          <View style={{ flex: 1 }}>
            <Text>{t.title}</Text>
            <Text variant="caption" tone="muted">
              {t.body}
            </Text>
          </View>
          <Switch
            value={!!s?.[t.key]}
            disabled={!hcReady || !s}
            onValueChange={(v) => void toggle(t.key, t.perm, v)}
            accessibilityLabel={t.title}
            trackColor={{ false: c.line, true: c.cycle }}
            thumbColor={c.surface}
            style={{ minWidth: 48, minHeight: 48 }}
          />
        </View>
      ))}
      {msg ? (
        <Text tone="danger" variant="caption" accessibilityLiveRegion="polite">
          {msg}
        </Text>
      ) : null}
    </Card>
  );
}

/* --------------------------------- Steps --------------------------------- */

function StepsCard() {
  const { c } = useTheme();
  const { stepGoal, setStepGoal, strideM, setStride, demoMode } = useAppState();
  const sensor = useStepSensor();
  const [draft, setDraft] = useState(String(stepGoal));
  const [error, setError] = useState<string | null>(null);
  const [strideDraft, setStrideDraft] = useState(String(Math.round(strideM * 100)));
  const [strideError, setStrideError] = useState<string | null>(null);

  useEffect(() => setDraft(String(stepGoal)), [stepGoal]);
  useEffect(() => setStrideDraft(String(Math.round(strideM * 100))), [strideM]);

  const commit = (raw: string) => {
    const n = Number(raw.replace(/[^0-9]/g, ''));
    if (!Number.isFinite(n) || n < STEP_GOAL_MIN || n > STEP_GOAL_MAX) {
      setError(`Enter a goal between ${STEP_GOAL_MIN.toLocaleString()} and ${STEP_GOAL_MAX.toLocaleString()} steps.`);
      return;
    }
    setError(null);
    setStepGoal(n);
  };

  const bump = (delta: number) => {
    const n = Math.min(STEP_GOAL_MAX, Math.max(STEP_GOAL_MIN, stepGoal + delta));
    setError(null);
    setStepGoal(n);
  };

  const commitStride = (raw: string) => {
    const cm = Number(raw.replace(',', '.'));
    if (!Number.isFinite(cm) || cm < STRIDE_MIN_M * 100 || cm > STRIDE_MAX_M * 100) {
      setStrideError(`Enter a stride between ${STRIDE_MIN_M * 100} and ${STRIDE_MAX_M * 100} cm.`);
      return;
    }
    setStrideError(null);
    setStride(cm / 100);
  };

  const api = androidApiLevel();
  const sensorText =
    sensor.permission === 'granted'
      ? 'Allowed — Bloom counts steps while it’s open.'
      : sensor.permission === 'denied'
        ? 'Not allowed. Turn on “Physical activity” in Android Settings → Apps → Bloom → Permissions.'
        : sensor.permission === 'unavailable'
          ? 'This phone has no step sensor Bloom can use.'
          : 'Not asked yet.';

  return (
    <Card>
      <CardHeader icon={Target} label="Steps" accent={c.steps} soft={c.stepsSoft} />
      <Text variant="bodyStrong" nativeID="goalLabel" style={{ marginBottom: space.xs }}>
        Daily step goal
      </Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
        <IconButton icon={Minus} onPress={() => bump(-500)} accessibilityLabel="Decrease goal by 500 steps" disabled={stepGoal <= STEP_GOAL_MIN} />
        <TextInput
          value={draft}
          onChangeText={setDraft}
          onEndEditing={(e) => commit(e.nativeEvent.text)}
          onSubmitEditing={(e) => commit(e.nativeEvent.text)}
          keyboardType="number-pad"
          returnKeyType="done"
          maxLength={5}
          accessibilityLabel="Daily step goal"
          accessibilityLabelledBy="goalLabel"
          accessibilityHint={`Between ${STEP_GOAL_MIN} and ${STEP_GOAL_MAX}`}
          style={{
            flex: 1,
            minHeight: 52,
            borderWidth: error ? 2 : 1.5,
            borderColor: error ? c.danger : c.line,
            borderRadius: radius.chip,
            textAlign: 'center',
            fontFamily: fonts.display,
            fontSize: 32,
            color: c.ink,
            backgroundColor: c.surface,
          }}
        />
        <IconButton icon={Plus} onPress={() => bump(500)} accessibilityLabel="Increase goal by 500 steps" disabled={stepGoal >= STEP_GOAL_MAX} />
      </View>
      {error ? (
        <Text tone="danger" variant="caption" accessibilityLiveRegion="polite" style={{ marginTop: space.xs }}>
          {error}
        </Text>
      ) : (
        <Text variant="caption" tone="muted" style={{ marginTop: space.xs }}>
          Default is 8,000.
        </Text>
      )}

      <View style={{ marginTop: space.md }}>
        <Field label="Stride length (cm)" error={strideError} hint="Used for distance when no app provides it: steps × stride. Default 72 cm.">
          <Input
            value={strideDraft}
            onChangeText={setStrideDraft}
            onEndEditing={(e) => commitStride(e.nativeEvent.text)}
            onSubmitEditing={(e) => commitStride(e.nativeEvent.text)}
            keyboardType="number-pad"
            maxLength={3}
            error={!!strideError}
            accessibilityLabel="Stride length in centimetres"
          />
        </Field>
      </View>

      <View style={{ marginTop: space.md, gap: space.xs }}>
        <Text variant="bodyStrong">Count steps with this phone</Text>
        <View accessible style={{ flexDirection: 'row', gap: space.xs, alignItems: 'flex-start' }}>
          {sensor.permission === 'granted' ? <CircleCheck size={18} color={c.spo2} /> : <CircleAlert size={18} color={c.steps} />}
          <Text tone="muted" style={{ flex: 1 }}>
            {sensorText}
          </Text>
        </View>
        {sensor.permission !== 'granted' && sensor.permission !== 'unavailable' && !demoMode ? (
          <Button label="Allow physical activity" variant="secondary" icon={Footprints} onPress={() => sensor.request()} />
        ) : null}
        <Text variant="caption" tone="muted">
          {api !== null && api >= PHONE_STEPS_MIN_API
            ? 'Your phone runs Android 14 or newer: connect Health Connect below and it counts steps all day, even when Bloom is closed.'
            : 'Bloom counts only while it’s open. All-day counting needs Android 14+ with Health Connect, or a fitness app that writes to Health Connect.'}
        </Text>
      </View>
    </Card>
  );
}

/* -------------------------------- AI Coach ------------------------------- */

function CoachCard() {
  const { c } = useTheme();
  const coach = useCoach();
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const save = async () => {
    setBusy(true);
    setMsg(null);
    const r = await coach.saveAndTestKey(draft);
    setBusy(false);
    setMsg({ ok: r.ok, text: r.message });
    if (r.ok) setDraft('');
  };

  return (
    <Card>
      <CardHeader icon={Sparkles} label="AI Coach" accent={c.sleep} soft={c.sleepSoft} />
      <Text tone="muted" style={{ marginBottom: space.sm }}>
        Uses your own free Google Gemini key. Get one at aistudio.google.com/app/apikey (sign in with Google →
        Create API key), then paste it here. The key is stored encrypted on this phone and only sent to Google.
      </Text>
      {coach.hasKey ? (
        <>
          <View accessible style={{ flexDirection: 'row', alignItems: 'center', gap: space.xs, minHeight: 44 }}>
            <CircleCheck size={20} color={c.spo2} />
            <Text variant="bodyStrong" style={{ flex: 1 }}>
              AI coach is on · key {coach.masked}
            </Text>
          </View>
          {msg?.ok ? (
            <Text variant="caption" accessibilityLiveRegion="polite">
              {msg.text}
            </Text>
          ) : null}
          <Button label="Ask Bloom" icon={Sparkles} onPress={() => router.push('/coach')} style={{ marginTop: space.xs }} />
          <Button
            label="Remove key"
            variant="ghost"
            icon={Trash2}
            onPress={async () => {
              await coach.removeKey();
              setMsg(null);
            }}
            style={{ marginTop: space.xs }}
          />
        </>
      ) : (
        <>
          <Field label="Gemini API key" error={msg && !msg.ok ? msg.text : null} hint="Starts with “AQ.” (new keys) or “AIza” (older keys).">
            <Input
              value={draft}
              onChangeText={(t) => {
                setDraft(t);
                if (msg) setMsg(null);
              }}
              autoCapitalize="none"
              autoCorrect={false}
              secureTextEntry
              textContentType="password"
              importantForAutofill="no"
              error={!!msg && !msg.ok}
              accessibilityLabel="Gemini API key"
            />
          </Field>
          <Button label="Use my key" icon={KeyRound} onPress={save} loading={busy} disabled={!draft.trim()} style={{ marginTop: space.sm }} />
        </>
      )}
      <Text variant="caption" tone="muted" style={{ marginTop: space.sm }}>
        Free limits are small (a few requests a minute and a daily cap) and reset around 12:30–1:30 pm IST. When you
        ask, your question and a summary of your data are sent to Google; on the free tier Google may use them to
        improve its products. Day-log notes are never included.
      </Text>
    </Card>
  );
}

/* ----------------------------- Health Connect ---------------------------- */

function HealthConnectCard() {
  const { c } = useTheme();
  const app = useAppState();

  const status = (() => {
    switch (app.availability) {
      case 'available':
        return app.granted.size
          ? { ok: true, text: `Connected · ${app.granted.size} of ${READ_RECORD_TYPES.length} data types allowed` }
          : { ok: false, text: 'Health Connect found · not connected yet' };
      case 'update-required':
        return { ok: false, text: 'Health Connect needs an update' };
      case 'unavailable':
        return { ok: false, text: 'Health Connect is not installed' };
      case 'unsupported':
        return { ok: false, text: 'Health Connect isn’t reachable in this build' };
      default:
        return { ok: false, text: 'Checking…' };
    }
  })();
  const needsInstall = app.availability === 'unavailable' || app.availability === 'update-required';

  return (
    <Card>
      <CardHeader icon={Smartphone} label="Health Connect (optional)" accent={c.spo2} soft={c.spo2Soft} />
      <Text tone="muted" style={{ marginBottom: space.sm }}>
        Gives Bloom all-day steps on Android 14+, plus data from a watch, Flo or Google Fit if you use them.
      </Text>
      <View accessible accessibilityLabel={`Status: ${status.text}`} style={{ flexDirection: 'row', alignItems: 'center', gap: space.xs, marginBottom: space.md }}>
        {status.ok ? <CircleCheck size={20} color={c.spo2} /> : <CircleAlert size={20} color={c.steps} />}
        <Text variant="bodyStrong" style={{ flex: 1 }}>
          {status.text}
        </Text>
      </View>
      {needsInstall ? (
        <Button label="Get Health Connect" icon={Store} onPress={openHealthConnectInPlayStore} accessibilityHint="Opens the Play Store" />
      ) : app.availability === 'available' ? (
        <>
          <Button
            label={app.granted.size ? 'Ask for permissions again' : 'Connect Health Connect'}
            icon={RefreshCw}
            onPress={() => {
              app.requestPermissions().catch(() => {
                // The sheet couldn't open (e.g. Health Connect busy/updating); "Manage permissions" still works.
              });
            }}
          />
          <Button
            label="Manage permissions"
            variant="ghost"
            icon={ExternalLink}
            onPress={() => openHealthConnectSettings()}
            accessibilityHint="Opens Health Connect settings, where you can allow or remove access for Bloom"
            style={{ marginTop: space.xs }}
          />
        </>
      ) : null}
      {app.availability === 'available' ? (
        <Text variant="caption" tone="muted" style={{ marginTop: space.sm }}>
          {app.historyRequested
            ? 'Past-data access was requested. If cycle history looks short, enable “Access past data” for Bloom in Health Connect.'
            : 'Past-data access not requested yet — Bloom can only read about the last 30 days from Health Connect.'}
        </Text>
      ) : null}
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
      <CardHeader icon={RefreshCw} label="Health Connect sources · 30 days" accent={c.sleep} soft={c.sleepSoft} />
      <Text tone="muted" style={{ marginBottom: space.sm }}>
        Which app supplied each type of data. Steps from several apps are de-duplicated by Health Connect using its
        app-priority order. Anything you log in Bloom is shown as “Logged in Bloom” on each card.
      </Text>
      {sources.loading && !sources.result ? (
        <View style={{ gap: space.xs }}>
          {Array.from({ length: 6 }, (_, i) => (
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
              accessibilityLabel={`${METRIC_LABEL[t]}: ${value}${pkgs.length ? `. Packages: ${pkgs.join(', ')}` : ''}`}
              style={{ paddingVertical: space.sm, borderTopWidth: i === 0 ? 0 : 1, borderTopColor: c.line, flexDirection: 'row', gap: space.sm }}
            >
              <Text variant="bodyStrong" style={{ flex: 1 }}>
                {METRIC_LABEL[t]}
              </Text>
              <View style={{ flex: 1.2, alignItems: 'flex-end' }}>
                <Text tone={pkgs.length ? 'ink' : 'muted'} style={{ textAlign: 'right' }}>
                  {value}
                </Text>
                {pkgs.map((p) =>
                  appName(p) !== p ? (
                    <Text key={p} variant="caption" tone="muted" style={{ textAlign: 'right' }}>
                      {p}
                    </Text>
                  ) : null
                )}
              </View>
            </View>
          );
        })
      )}
    </Card>
  );
}

/* -------------------------------- Your data ------------------------------ */

function DataCard() {
  const { c } = useTheme();
  const { bump } = useAppState();
  const [busy, setBusy] = useState<'export' | 'delete' | null>(null);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);

  const onExport = async () => {
    setBusy('export');
    setNote(null);
    try {
      const r = await exportAndShare();
      if (r === 'unavailable') setNote({ ok: false, text: 'Sharing isn’t available on this device.' });
    } catch {
      setNote({ ok: false, text: 'Couldn’t export. Please try again.' });
    } finally {
      setBusy(null);
    }
  };

  const onDelete = () => {
    Alert.alert(
      'Delete all your data?',
      'This permanently deletes every period, day log, sleep log, reading, step count, weight, food, activity and your plan saved in Bloom on this phone. Data in Health Connect, Flo or other apps is not touched. This can’t be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete everything',
          style: 'destructive',
          onPress: async () => {
            setBusy('delete');
            try {
              await deleteAllData();
              clearSummaryCache();
              bump();
              setNote({ ok: true, text: 'All data saved in Bloom was deleted.' });
            } catch {
              setNote({ ok: false, text: 'Couldn’t delete. Please try again.' });
            } finally {
              setBusy(null);
            }
          },
        },
      ]
    );
  };

  return (
    <Card>
      <CardHeader icon={Database} label="Your data" accent={c.sleep} soft={c.sleepSoft} />
      <Text tone="muted" style={{ marginBottom: space.sm }}>
        Everything you log is saved only on this phone.
      </Text>
      <Button label="Export as JSON" variant="secondary" icon={Download} onPress={onExport} loading={busy === 'export'} accessibilityHint="Opens the share sheet with a JSON file of everything you logged" />
      <Button label="Delete all my data" variant="ghost" icon={Trash2} onPress={onDelete} loading={busy === 'delete'} style={{ marginTop: space.xs }} accessibilityHint="Asks for confirmation first" />
      {note ? (
        <Text tone={note.ok ? 'ink' : 'danger'} variant="caption" accessibilityLiveRegion="polite" style={{ marginTop: space.xs }}>
          {note.text}
        </Text>
      ) : null}
    </Card>
  );
}
