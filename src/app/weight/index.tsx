/**
 * Weight: quick add (kg stepper + keyboard, Morning/Night, date) and history with edit/delete.
 * Only morning weights drive the trend; Health Connect weights are shown read-only by source.
 */
import { Check, Moon, Sun } from 'lucide-react-native';
import React, { useEffect, useState } from 'react';
import { Alert, View } from 'react-native';
import { DemoBanner } from '../../components/DemoBanner';
import { Screen } from '../../components/Screen';
import { DateTimeField } from '../../components/sheets/DateTimeField';
import { Field } from '../../components/sheets/Sheet';
import { Button, Card, CardSkeleton, Segmented, Text } from '../../components/ui';
import { ValidationError, WEIGHT_RANGE, type WeightSlot } from '../../db/repos';
import { dayStart, toDayKey } from '../../health/dates';
import { appName } from '../../health/sources';
import { logWeight, removeWeight, updateWeight } from '../../plan/actions';
import { defaultWeightSlot } from '../../plan/trend';
import { usePlan } from '../../plan/usePlan';
import { BackHeader, EntryRow, InfoNote, Stepper, formatShortDay } from '../../plan/ui/parts';
import { space } from '../../theme/tokens';
import { useTheme } from '../../theme/useTheme';

export default function WeightScreen() {
  const { c } = useTheme();
  const { state, loading } = usePlan();
  const [kg, setKg] = useState<number | null>(null);
  const [slot, setSlot] = useState<WeightSlot>(defaultWeightSlot(new Date()));
  const [date, setDate] = useState(new Date());
  const [editId, setEditId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Start the stepper at the latest weight (or profile weight).
  useEffect(() => {
    if (kg !== null || !state) return;
    const last = state.weights[state.weights.length - 1]?.kg ?? state.profile?.weightKg ?? 60;
    setKg(last);
  }, [state, kg]);

  const value = kg ?? 60;
  const save = async () => {
    setBusy(true);
    setError(null);
    setSaved(null);
    try {
      const day = toDayKey(date);
      if (editId !== null) await updateWeight(editId, { day, slot, kg: value });
      else await logWeight({ day, slot, kg: value, time: date });
      setSaved(`Saved ${value.toFixed(1)} kg (${slot}).`);
      setEditId(null);
    } catch (e) {
      setError(e instanceof ValidationError ? e.message : 'Couldn’t save. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const history = state ? [...state.weights].reverse().slice(0, 40) : [];

  return (
    <Screen>
      <BackHeader title="Weight" subtitle="Mornings make the steadiest trend" />
      <DemoBanner />
      <Card>
        <View style={{ gap: space.md }}>
          <Field label="Weight (kg)" error={error} nativeID="weightLabel">
            <Stepper
              label="Weight in kilograms"
              nativeID="weightLabel"
              unit="kg"
              value={value}
              onChange={(v) => {
                setKg(v);
                setError(null);
                setSaved(null);
              }}
              step={0.1}
              min={WEIGHT_RANGE.min}
              max={WEIGHT_RANGE.max}
              error={!!error}
            />
          </Field>
          <Field label="When">
            <Segmented
              accessibilityLabel="Morning or night weight"
              value={slot}
              onChange={setSlot}
              options={[
                { value: 'morning', label: 'Morning' },
                { value: 'night', label: 'Night' },
              ]}
            />
          </Field>
          <Field label="Date">
            <DateTimeField label="Date" mode="date" value={date} onChange={setDate} maximumDate={new Date()} />
          </Field>
          <Button label={editId !== null ? 'Update weight' : 'Save weight'} icon={Check} onPress={save} loading={busy} />
          {editId !== null ? (
            <Button
              label="Cancel editing"
              variant="ghost"
              onPress={() => {
                setEditId(null);
                setDate(new Date());
              }}
            />
          ) : null}
          {saved ? (
            <Text accessibilityLiveRegion="polite" variant="caption">
              {saved}
            </Text>
          ) : null}
        </View>
      </Card>

      <InfoNote icon={slot === 'night' ? Moon : Sun} accent={c.spo2} tint={c.spo2Soft}>
        Night weight is usually 0.5–1.5 kg higher than morning (the day’s food and water). Only morning weights drive your
        trend, so log nights just for curiosity.
      </InfoNote>
      {state?.cycleNote ? <InfoNote tint={c.cycleSoft} accent={c.cycle}>{state.cycleNote}</InfoNote> : null}

      <Text variant="title" accessibilityRole="header">
        History
      </Text>
      {loading && !state ? (
        <CardSkeleton label="weight history" height={200} />
      ) : history.length ? (
        <Card>
          {history.map((w, i) => {
            const fromBloom = w.id !== null && (w.source === 'bloom' || !w.source);
            const src = fromBloom ? 'Logged in Bloom' : state?.demo ? 'Sample data' : appName(w.source ?? '');
            return (
              <EntryRow
                key={`${w.day}-${w.time}-${i}`}
                first={i === 0}
                title={`${w.kg.toFixed(1)} kg`}
                detail={`${formatShortDay(w.day)} · ${w.slot === 'morning' ? 'Morning' : 'Night'}`}
                badge={src}
                onEdit={
                  fromBloom
                    ? () => {
                        setEditId(w.id);
                        setKg(w.kg);
                        setSlot(w.slot);
                        setDate(dayStart(w.day));
                      }
                    : undefined
                }
                onDelete={
                  fromBloom
                    ? () =>
                        Alert.alert('Delete this weight?', `${w.kg.toFixed(1)} kg on ${formatShortDay(w.day)}`, [
                          { text: 'Cancel', style: 'cancel' },
                          { text: 'Delete', style: 'destructive', onPress: () => void removeWeight(w.id as number) },
                        ])
                    : undefined
                }
              />
            );
          })}
        </Card>
      ) : (
        <Text tone="muted">No weights yet. Your first morning weigh-in starts the trend.</Text>
      )}
    </Screen>
  );
}
