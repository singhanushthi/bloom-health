/** Settings → Steps & phone sensors: daily goal, stride, physical-activity permission, how counting works. */
import { CircleAlert, CircleCheck, Footprints, Minus, Plus, Ruler, Smartphone } from 'lucide-react-native';
import React, { useEffect, useState } from 'react';
import { Linking, TextInput, View } from 'react-native';
import { Screen } from '../../components/Screen';
import { Field, Input } from '../../components/sheets/Sheet';
import { PageHeader } from '../../components/settings';
import { Button, Card, CardHeader, IconButton, Text } from '../../components/ui';
import { androidApiLevel, PHONE_STEPS_MIN_API } from '../../health/capabilities';
import { useStepSensor } from '../../sensors/StepSensor';
import { STEP_GOAL_MAX, STEP_GOAL_MIN, STRIDE_MAX_M, STRIDE_MIN_M, useAppState } from '../../state/AppState';
import { fonts, radius, space } from '../../theme/tokens';
import { useTheme } from '../../theme/useTheme';

export default function StepsSettings() {
  return (
    <Screen avoidKeyboard>
      <PageHeader title="Steps & phone sensors" subtitle="Your daily goal and how Bloom counts steps." fallback="/settings" />
      <GoalCard />
      <SensorCard />
      <StrideCard />
    </Screen>
  );
}

function GoalCard() {
  const { c } = useTheme();
  const { stepGoal, setStepGoal } = useAppState();
  const [draft, setDraft] = useState(String(stepGoal));
  const [error, setError] = useState<string | null>(null);
  useEffect(() => setDraft(String(stepGoal)), [stepGoal]);

  const commit = (raw: string) => {
    const n = Number(raw.replace(/[^0-9]/g, ''));
    if (!raw.trim() || !Number.isFinite(n) || n < STEP_GOAL_MIN || n > STEP_GOAL_MAX) {
      setError(`Enter a goal between ${STEP_GOAL_MIN.toLocaleString()} and ${STEP_GOAL_MAX.toLocaleString()} steps.`);
      return;
    }
    setError(null);
    setStepGoal(n);
  };
  const bump = (delta: number) => {
    setError(null);
    setStepGoal(Math.min(STEP_GOAL_MAX, Math.max(STEP_GOAL_MIN, stepGoal + delta)));
  };

  return (
    <Card>
      <CardHeader icon={Footprints} label="Daily step goal" accent={c.steps} soft={c.stepsSoft} />
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
            minHeight: 56,
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
          Default is 8,000. Use − and + to change by 500.
        </Text>
      )}
    </Card>
  );
}

function SensorCard() {
  const { c } = useTheme();
  const { demoMode } = useAppState();
  const sensor = useStepSensor();
  const [asking, setAsking] = useState(false);
  const api = androidApiLevel();
  const allDay = api !== null && api >= PHONE_STEPS_MIN_API;
  const granted = sensor.permission === 'granted';

  const text =
    sensor.permission === 'granted'
      ? 'Allowed. Bloom counts steps while it’s open.'
      : sensor.permission === 'denied'
        ? 'Not allowed. Turn on “Physical activity” in Android Settings → Apps → Bloom → Permissions.'
        : sensor.permission === 'unavailable'
          ? 'This phone has no step sensor Bloom can use. You can still type today’s steps on Today.'
          : 'Not asked yet.';

  return (
    <Card>
      <CardHeader icon={Smartphone} label="Count steps with this phone" accent={c.steps} soft={c.stepsSoft} />
      <View accessible style={{ flexDirection: 'row', gap: space.xs, alignItems: 'flex-start' }}>
        {granted ? <CircleCheck size={20} color={c.spo2} /> : <CircleAlert size={20} color={c.steps} />}
        <Text style={{ flex: 1 }}>{text}</Text>
      </View>
      {sensor.permission === 'undetermined' && !demoMode ? (
        <Button
          label="Allow physical activity"
          icon={Footprints}
          loading={asking}
          onPress={async () => {
            setAsking(true);
            try {
              await sensor.request();
            } finally {
              setAsking(false);
            }
          }}
          style={{ marginTop: space.md }}
        />
      ) : null}
      {sensor.permission === 'denied' ? (
        <Button
          label="Open Android settings"
          variant="secondary"
          onPress={() => Linking.openSettings().catch(() => {})}
          accessibilityHint="Opens Bloom's Android settings, where you can allow Physical activity"
          style={{ marginTop: space.md }}
        />
      ) : null}
      <View style={{ marginTop: space.md, gap: space.xs }}>
        <Text variant="bodyStrong">How counting works</Text>
        <Text tone="muted">
          {allDay
            ? 'Your phone runs Android 14 or newer. Connect Health Connect and it counts steps all day, even when Bloom is closed.'
            : 'Bloom counts only while it’s open. All-day counting needs Android 14+ with Health Connect, or a fitness app that writes to Health Connect.'}
        </Text>
        <Text tone="muted">Missed some? Tap “Edit today’s steps” on the Steps card on Today to type the right number.</Text>
      </View>
    </Card>
  );
}

function StrideCard() {
  const { c } = useTheme();
  const { strideM, setStride } = useAppState();
  const [draft, setDraft] = useState(String(Math.round(strideM * 100)));
  const [error, setError] = useState<string | null>(null);
  useEffect(() => setDraft(String(Math.round(strideM * 100))), [strideM]);

  const commit = (raw: string) => {
    const cm = Number(raw.replace(',', '.'));
    if (!raw.trim() || !Number.isFinite(cm) || cm < STRIDE_MIN_M * 100 || cm > STRIDE_MAX_M * 100) {
      setError(`Enter a stride between ${STRIDE_MIN_M * 100} and ${STRIDE_MAX_M * 100} cm.`);
      return;
    }
    setError(null);
    setStride(cm / 100);
  };

  return (
    <Card>
      <CardHeader icon={Ruler} label="Stride length" accent={c.steps} soft={c.stepsSoft} />
      <Field label="Stride length (cm)" error={error} hint="Used for distance when no app gives one: steps × stride. Default 72 cm.">
        <Input
          value={draft}
          onChangeText={setDraft}
          onEndEditing={(e) => commit(e.nativeEvent.text)}
          onSubmitEditing={(e) => commit(e.nativeEvent.text)}
          keyboardType="number-pad"
          returnKeyType="done"
          maxLength={3}
          error={!!error}
          accessibilityLabel="Stride length in centimetres"
        />
      </Field>
    </Card>
  );
}
