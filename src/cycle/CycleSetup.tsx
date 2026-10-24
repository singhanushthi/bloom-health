/**
 * First-time cycle setup (shown on the Cycle tab when nothing is logged yet).
 */
import { Flower2 } from 'lucide-react-native';
import React, { useState } from 'react';
import { View } from 'react-native';
import { DateTimeField } from '../components/sheets/DateTimeField';
import { ChipRow, Field, ToggleChip } from '../components/sheets/Sheet';
import { Button, Card, CardHeader, Text } from '../components/ui';
import { ValidationError } from '../db/repos';
import { addDays, dayStart, toDayKey, todayKey } from '../health/dates';
import { useAppState } from '../state/AppState';
import { space } from '../theme/tokens';
import { ContraceptionNote, Stepper, SwitchRow } from './parts';
import {
  completeSetup,
  CYCLE_GOAL_HINT,
  CYCLE_GOAL_LABEL,
  CYCLE_GOALS,
  CYCLE_LENGTH_RANGE,
  DEFAULT_CYCLE_SETTINGS,
  PERIOD_LENGTH_RANGE,
  saveCycleSettings,
  validateSetup,
  type CycleGoal,
  type SetupInput,
} from './store';
import { useCycleColors } from './theme';

export function CycleSetup({ onDone }: { onDone?: () => void }) {
  const { c, cycleText } = useCycleColors();
  const { bump } = useAppState();
  const now = new Date();
  const [start, setStart] = useState(dayStart(addDays(todayKey(), -14)));
  const [periodLength, setPeriodLength] = useState(DEFAULT_CYCLE_SETTINGS.typicalPeriodLength);
  const [cycleLength, setCycleLength] = useState(DEFAULT_CYCLE_SETTINGS.typicalCycleLength);
  const [irregular, setIrregular] = useState(false);
  const [goal, setGoal] = useState<CycleGoal>('track');
  const [errors, setErrors] = useState<Partial<Record<keyof SetupInput | 'form', string>>>({});
  const [busy, setBusy] = useState(false);

  const input = (): SetupInput => ({ lastPeriodStart: toDayKey(start), periodLength, cycleLength, irregular, goal });

  const save = async () => {
    const v = validateSetup(input());
    setErrors(v);
    if (Object.keys(v).length) return;
    setBusy(true);
    try {
      await completeSetup(input());
      bump();
      onDone?.();
    } catch (e) {
      setErrors(e instanceof ValidationError ? { [e.field]: e.message } : { form: 'Couldn’t save. Please try again.' });
    } finally {
      setBusy(false);
    }
  };

  const skip = async () => {
    await saveCycleSettings({ setupDone: true, typicalPeriodLength: periodLength, typicalCycleLength: cycleLength, irregular, goal });
    bump();
    onDone?.();
  };

  return (
    <Card>
      <CardHeader icon={Flower2} label="Set up your cycle" accent={c.cycle} soft={c.cycleSoft} />
      <Text variant="title" style={{ color: cycleText }} accessibilityRole="header">
        Let’s get to know your cycle
      </Text>
      <Text tone="muted" style={{ marginTop: space.xxs, marginBottom: space.md }}>
        Four quick questions. You can change any of this later in cycle settings.
      </Text>
      <View style={{ gap: space.md }}>
        <Field label="When did your last period start?" error={errors.lastPeriodStart}>
          <DateTimeField label="Last period start date" mode="date" value={start} onChange={setStart} maximumDate={now} error={!!errors.lastPeriodStart} />
        </Field>
        <Stepper
          label="How many days does your period usually last?"
          value={periodLength}
          unit="days"
          min={PERIOD_LENGTH_RANGE.min}
          max={PERIOD_LENGTH_RANGE.max}
          onChange={setPeriodLength}
          error={errors.periodLength}
        />
        <Stepper
          label="How long is your cycle, usually?"
          value={cycleLength}
          unit="days"
          min={CYCLE_LENGTH_RANGE.min}
          max={CYCLE_LENGTH_RANGE.max}
          onChange={setCycleLength}
          error={errors.cycleLength}
        />
        <Text variant="caption" tone="muted">
          From the first day of one period to the day before the next. Not sure? 28 is a fine start — Bloom learns from your logs.
        </Text>
        <SwitchRow
          label="My cycles are irregular"
          body="Bloom will show a range of dates instead of one day."
          value={irregular}
          onChange={setIrregular}
        />
        <Field label="What would you like Bloom to help with?">
          <ChipRow label="Goal">
            {CYCLE_GOALS.map((g) => (
              <ToggleChip key={g} label={CYCLE_GOAL_LABEL[g]} role="radio" selected={goal === g} onPress={() => setGoal(g)} accent={c.cycle} soft={c.cycleSoft} />
            ))}
          </ChipRow>
          <Text variant="caption" tone="muted">
            {CYCLE_GOAL_HINT[goal]}
          </Text>
        </Field>
        <ContraceptionNote />
        {errors.form ? <Text tone="danger">{errors.form}</Text> : null}
        <Button label="Save and see my cycle" onPress={save} loading={busy} />
        <Button label="Skip for now" variant="ghost" onPress={skip} accessibilityHint="You can log a period any time" />
      </View>
    </Card>
  );
}
