/**
 * Step-by-step setup for one app (/connect/noise, /connect/flo, /connect/google-fit, …), driven
 * by src/health/connectWizard.ts. Ticks are saved on the phone. "Allow Health Connect" and
 * "Check it's working" tick themselves. Noise also offers a second path: direct Bluetooth (beta).
 */
import { router, useLocalSearchParams } from 'expo-router';
import { Bluetooth, CircleCheck, ExternalLink, HeartPulse, Search, Square, SquareCheckBig } from 'lucide-react-native';
import React, { useCallback, useEffect, useState } from 'react';
import { Linking, Pressable, View } from 'react-native';
import { Screen } from '../../components/Screen';
import { InlineMessage, NumberedStep, PageHeader, StatusPill } from '../../components/settings';
import { Button, Card, Segmented, Text } from '../../components/ui';
import { playStoreSearchUrl } from '../../health/apps';
import {
  currentStepIndex,
  isStepDone,
  loadTicks,
  runCheck,
  saveTicks,
  toggleTick,
  wizardFor,
  type AppWizard,
  type CheckResult,
  type Ticks,
  type WizardAction,
  type WizardStep,
} from '../../health/connectWizard';
import { useHealthConnectAccess } from '../../health/useHealthConnectAccess';
import { useAppState } from '../../state/AppState';
import { radius, space, touch } from '../../theme/tokens';
import { useTheme } from '../../theme/useTheme';

export default function ConnectWizardScreen() {
  const params = useLocalSearchParams<{ appId?: string }>();
  const appId = typeof params?.appId === 'string' ? params.appId : '';
  const wizard = wizardFor(appId);
  const [path, setPath] = useState<'main' | 'alt'>('main');

  if (!wizard) {
    return (
      <Screen>
        <PageHeader title="App not found" fallback="/connect" />
        <Text>We couldn’t find setup steps for this app.</Text>
        <Button label="See all apps" onPress={() => router.replace('/connect')} />
      </Screen>
    );
  }

  return (
    <Screen>
      <PageHeader title={`Set up ${wizard.name}`} subtitle={wizard.intro} fallback="/connect" />
      {wizard.altPath && wizard.path ? (
        <>
          <Segmented
            accessibilityLabel="Choose how to connect"
            value={path}
            onChange={setPath}
            options={[
              { value: 'main', label: `${wizard.path.title} · ${wizard.path.tag}` },
              { value: 'alt', label: `${wizard.altPath.title} · ${wizard.altPath.tag}` },
            ]}
          />
          <Text tone="muted">You get: {path === 'main' ? wizard.path.gets : wizard.altPath.gets}.</Text>
        </>
      ) : null}
      {path === 'alt' && wizard.altPath ? <AltPath wizard={wizard} /> : <MainPath wizard={wizard} />}
    </Screen>
  );
}

/* -------------------------------- Actions -------------------------------- */

async function runAction(a: WizardAction): Promise<void> {
  if (a.kind === 'route') {
    router.push(a.route);
    return;
  }
  if (a.kind === 'store-search') {
    await Linking.openURL(playStoreSearchUrl(a.query));
    return;
  }
  try {
    await Linking.openURL(`market://details?id=${a.packageId}`);
  } catch {
    await Linking.openURL(`https://play.google.com/store/apps/details?id=${a.packageId}`);
  }
}

/* ------------------------------- Main path ------------------------------- */

function MainPath({ wizard }: { wizard: AppWizard }) {
  const app = useAppState();
  const access = useHealthConnectAccess();
  const [ticks, setTicks] = useState<Ticks>({});
  const [check, setCheck] = useState<CheckResult | null>(null);
  const [checking, setChecking] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    loadTicks().then((t) => alive && setTicks(t));
    return () => {
      alive = false;
    };
  }, []);

  const mine = ticks[wizard.appId];
  const auto = { hcGranted: app.availability === 'available' && app.granted.size > 0, checkFound: !!check?.found };
  const current = currentStepIndex(wizard, mine, auto);
  const doneCount = wizard.steps.filter((s) => isStepDone(s, mine, auto)).length;

  const tick = useCallback(
    (stepId: string) => {
      setTicks((prev) => {
        const next = toggleTick(prev, wizard.appId, stepId);
        void saveTicks(next);
        return next;
      });
    },
    [wizard.appId]
  );

  const doCheck = async () => {
    if (!wizard.check) return;
    setChecking(true);
    try {
      const r = await runCheck({ ...app.ctx, now: new Date() }, wizard.check);
      setCheck(r);
      if (r.found && !mine?.check) tick('check');
    } finally {
      setChecking(false);
    }
  };

  const doAction = (a: WizardAction) => {
    setActionError(null);
    runAction(a).catch(() => setActionError('Couldn’t open that. Open the Play Store and search for the app instead.'));
  };

  if (!wizard.steps.length) {
    return <InlineMessage tone="info" title="Nothing to set up on this phone" body={wizard.intro} />;
  }

  const allDone = current >= wizard.steps.length;

  return (
    <View style={{ gap: space.md }}>
      <StatusPill tone={allDone ? 'done' : 'todo'} label={`${doneCount} of ${wizard.steps.length} done`} />
      {wizard.steps.map((s, i) => (
        <StepCard
          key={s.id}
          n={i + 1}
          step={s}
          done={isStepDone(s, mine, auto)}
          isCurrent={i === current}
          onTick={() => tick(s.id)}
          onAction={doAction}
          hc={access}
          check={check}
          checking={checking}
          onCheck={doCheck}
          hasCheck={!!wizard.check}
        />
      ))}
      {actionError ? <InlineMessage tone="error" title={actionError} /> : null}
      {allDone ? (
        <InlineMessage tone="success" title="All set!" body={`New ${wizard.name} data shows up in Bloom after each sync. Pull down on Today to refresh.`}>
          <Button label="Back to apps" variant="secondary" onPress={() => router.replace('/connect')} style={{ marginTop: space.xs }} />
        </InlineMessage>
      ) : null}
    </View>
  );
}

function StepCard({
  n,
  step,
  done,
  isCurrent,
  onTick,
  onAction,
  hc,
  check,
  checking,
  onCheck,
  hasCheck,
}: {
  n: number;
  step: WizardStep;
  done: boolean;
  isCurrent: boolean;
  onTick: () => void;
  onAction: (a: WizardAction) => void;
  hc: ReturnType<typeof useHealthConnectAccess>;
  check: CheckResult | null;
  checking: boolean;
  onCheck: () => void;
  hasCheck: boolean;
}) {
  // Only the current step gets the filled (primary) button, so there's one primary per screen.
  const variant = isCurrent ? 'primary' : 'secondary';
  return (
    <NumberedStep n={n} title={step.title} body={step.body} done={done}>
      {step.note ? (
        <Text variant="caption" tone="muted">
          {step.note}
        </Text>
      ) : null}

      {step.auto === 'hc-access' ? (
        <>
          {done ? (
            <StatusPill tone="done" label="Allowed ✓" />
          ) : hc.state.action ? (
            <Button label={hc.state.action} icon={HeartPulse} variant={variant} loading={hc.busy} onPress={() => void hc.run()} />
          ) : null}
          {!done && hc.state.kind !== 'allow' && hc.state.kind !== 'checking' ? (
            <Text variant="caption" tone="muted">
              {hc.state.body}
            </Text>
          ) : null}
          {hc.problem ? (
            <InlineMessage tone="error" title={hc.problem.title} body={hc.problem.body}>
              <Button label="Open Health Connect settings" variant="secondary" onPress={hc.openSettings} style={{ marginTop: space.xs }} />
            </InlineMessage>
          ) : null}
        </>
      ) : step.auto === 'check' ? (
        hasCheck ? (
          <>
            <Button
              label={check ? 'Check again' : 'Check now'}
              icon={Search}
              variant={variant}
              loading={checking}
              onPress={onCheck}
              accessibilityHint="Looks for data from this app in Health Connect"
            />
            {check ? <InlineMessage tone={check.found ? 'success' : 'info'} title={check.message} /> : null}
          </>
        ) : null
      ) : (
        <>
          {step.action ? (
            <Button
              label={step.action.label}
              icon={step.action.kind === 'route' ? Bluetooth : ExternalLink}
              variant={isCurrent && !done ? 'secondary' : 'ghost'}
              onPress={() => onAction(step.action!)}
              accessibilityHint={step.action.kind === 'route' ? undefined : 'Opens the Play Store'}
            />
          ) : null}
          <DoneTick done={done} onPress={onTick} title={step.title} primary={isCurrent && !step.action} />
        </>
      )}
    </NumberedStep>
  );
}

/** "I've done this" checkbox for steps Bloom can't see. */
function DoneTick({ done, onPress, title, primary }: { done: boolean; onPress: () => void; title: string; primary: boolean }) {
  const { c } = useTheme();
  const Icon = done ? SquareCheckBig : Square;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: done }}
      accessibilityLabel={`Done: ${title}`}
      accessibilityHint={done ? 'Marks this step as not done' : 'Marks this step as done'}
      android_ripple={{ color: c.line }}
      style={({ pressed }) => ({
        minHeight: touch.min + 8,
        flexDirection: 'row',
        alignItems: 'center',
        gap: space.sm,
        paddingHorizontal: space.md,
        borderRadius: radius.pill,
        backgroundColor: done ? c.spo2Soft : primary ? c.ink : c.surfaceAlt,
        opacity: pressed ? 0.85 : 1,
      })}
    >
      <Icon size={22} color={done ? c.spo2 : primary ? c.onInk : c.ink} />
      <Text variant="bodyStrong" style={{ color: done ? c.ink : primary ? c.onInk : c.ink }}>
        {done ? 'Done' : 'I’ve done this'}
      </Text>
    </Pressable>
  );
}

/* -------------------------------- Alt path -------------------------------- */

function AltPath({ wizard }: { wizard: AppWizard }) {
  const { c } = useTheme();
  const alt = wizard.altPath!;
  return (
    <Card>
      <Text>{alt.body}</Text>
      <View style={{ gap: space.xs, marginTop: space.md }}>
        {alt.points.map((p) => (
          <View key={p} style={{ flexDirection: 'row', gap: space.xs }}>
            <CircleCheck size={18} color={c.muted} style={{ marginTop: 3 }} />
            <Text style={{ flex: 1 }}>{p}</Text>
          </View>
        ))}
      </View>
      <Button
        label={alt.action.label}
        icon={Bluetooth}
        onPress={() => void runAction(alt.action)}
        accessibilityHint="Opens the direct Bluetooth watch screen"
        style={{ marginTop: space.md }}
      />
    </Card>
  );
}
