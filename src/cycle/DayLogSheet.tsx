/**
 * Cycle day log: flow, symptoms, mood and note (stored in day_logs, same as the shared Day log
 * sheet) plus extras stored by the cycle module: pain 0–3, discharge, sex drive, energy, sleep,
 * cravings and pills/medication tags.
 */
import { Plus, X } from 'lucide-react-native';
import React, { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import { ChipRow, Field, Input, Sheet, ToggleChip } from '../components/sheets/Sheet';
import { Button, Text } from '../components/ui';
import { DAY_FLOWS, dayLogs, MOODS, SYMPTOMS, type DayFlow } from '../db/repos';
import { formatDay, todayKey, type DayKey } from '../health/dates';
import { useAppState } from '../state/AppState';
import { radius, space, touch } from '../theme/tokens';
import { useTheme } from '../theme/useTheme';
import {
  cleanMedTags,
  CRAVINGS,
  dayExtras,
  DISCHARGES,
  emptyExtras,
  LEVELS,
  MED_TAG_MAX,
  MED_TAGS_MAX,
  PAIN_LEVELS,
  SLEEP_QS,
  type DayExtras,
} from './store';

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export function CycleDayLogSheet({ day, onClose }: { day: DayKey; onClose: () => void }) {
  const { c } = useTheme();
  const { bump } = useAppState();
  const [flow, setFlow] = useState<DayFlow>('none');
  const [symptoms, setSymptoms] = useState<string[]>([]);
  const [moods, setMoods] = useState<string[]>([]);
  const [note, setNote] = useState('');
  const [ex, setEx] = useState<DayExtras>(emptyExtras(day));
  const [medDraft, setMedDraft] = useState('');
  const [medError, setMedError] = useState<string | null>(null);
  const [recentMeds, setRecentMeds] = useState<string[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isFuture = day > todayKey();

  useEffect(() => {
    let alive = true;
    Promise.all([dayLogs.get(day), dayExtras.get(day), dayExtras.recentMeds()])
      .then(([l, e, meds]) => {
        if (!alive) return;
        if (l) {
          setFlow(l.flow === 'spotting' ? 'light' : (l.flow ?? 'none'));
          setSymptoms(l.symptoms);
          setMoods(l.moods);
          setNote(l.note ?? '');
        }
        if (e) setEx(e);
        setRecentMeds(meds);
      })
      .catch(() => {})
      .finally(() => alive && setLoaded(true));
    return () => {
      alive = false;
    };
  }, [day]);

  const toggle = (list: string[], id: string) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);
  const patch = (p: Partial<DayExtras>) => setEx((e) => ({ ...e, ...p }));

  const addMed = (raw: string) => {
    const v = raw.trim();
    if (!v) {
      setMedError('Type a name first.');
      return;
    }
    if (ex.meds.length >= MED_TAGS_MAX) {
      setMedError(`Up to ${MED_TAGS_MAX} per day.`);
      return;
    }
    patch({ meds: cleanMedTags([...ex.meds, v]) });
    setMedDraft('');
    setMedError(null);
  };

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      await dayLogs.upsert({ day, flow, symptoms, moods, note });
      await dayExtras.upsert({ ...ex, day });
      bump();
      onClose();
    } catch {
      setError('Couldn’t save. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const title = day === todayKey() ? 'Today’s log' : formatDay(day, { weekday: 'short', day: 'numeric', month: 'short' });
  const radio = <T extends string>(opts: readonly { id: T; label: string }[], value: T | null, set: (v: T | null) => void, label: string, accent = c.cycle, soft = c.cycleSoft) => (
    <ChipRow label={label}>
      {opts.map((o) => (
        <ToggleChip key={o.id} label={o.label} role="radio" selected={value === o.id} onPress={() => set(value === o.id ? null : o.id)} accent={accent} soft={soft} />
      ))}
    </ChipRow>
  );

  return (
    <Sheet
      visible
      title={title}
      onClose={onClose}
      footer={
        isFuture ? (
          <Button label="Close" variant="secondary" onPress={onClose} />
        ) : (
          <Button label="Save day" onPress={save} loading={busy || !loaded} />
        )
      }
    >
      {isFuture ? (
        <Text tone="muted">You can’t log a day in the future. Pick today or an earlier day.</Text>
      ) : (
        <>
          <Field label="Flow">
            <ChipRow label="Flow">
              {DAY_FLOWS.map((f) => (
                <ToggleChip key={f} label={cap(f)} role="radio" selected={flow === f} onPress={() => setFlow(f)} accent={c.cycle} soft={c.cycleSoft} />
              ))}
            </ChipRow>
          </Field>
          <Field label="Pain level" hint="0 = none, 3 = strong">
            <ChipRow label="Pain level">
              {PAIN_LEVELS.map((p) => (
                <ToggleChip
                  key={p.value}
                  label={`${p.value} · ${p.label}`}
                  role="radio"
                  selected={ex.pain === p.value}
                  onPress={() => patch({ pain: ex.pain === p.value ? null : p.value })}
                  accent={c.cycle}
                  soft={c.cycleSoft}
                />
              ))}
            </ChipRow>
          </Field>
          <Field label="Symptoms">
            <ChipRow label="Symptoms">
              {SYMPTOMS.map((s) => (
                <ToggleChip key={s.id} label={s.label} selected={symptoms.includes(s.id)} onPress={() => setSymptoms(toggle(symptoms, s.id))} accent={c.cycle} soft={c.cycleSoft} />
              ))}
            </ChipRow>
          </Field>
          <Field label="Mood">
            <ChipRow label="Mood">
              {MOODS.map((m) => (
                <ToggleChip key={m.id} label={m.label} selected={moods.includes(m.id)} onPress={() => setMoods(toggle(moods, m.id))} accent={c.sleep} soft={c.sleepSoft} />
              ))}
            </ChipRow>
          </Field>
          <Field label="Energy">{radio(LEVELS, ex.energy, (v) => patch({ energy: v }), 'Energy', c.steps, c.stepsSoft)}</Field>
          <Field label="Sleep quality">{radio(SLEEP_QS, ex.sleepQuality, (v) => patch({ sleepQuality: v }), 'Sleep quality', c.sleep, c.sleepSoft)}</Field>
          <Field label="Cravings">
            <ChipRow label="Cravings">
              {CRAVINGS.map((cr) => (
                <ToggleChip key={cr.id} label={cr.label} selected={ex.cravings.includes(cr.id)} onPress={() => patch({ cravings: toggle(ex.cravings, cr.id) })} accent={c.steps} soft={c.stepsSoft} />
              ))}
            </ChipRow>
          </Field>
          <Field label="Discharge">{radio(DISCHARGES, ex.discharge, (v) => patch({ discharge: v }), 'Discharge', c.spo2, c.spo2Soft)}</Field>
          <Field label="Sex drive">{radio(LEVELS, ex.sexDrive, (v) => patch({ sexDrive: v }), 'Sex drive')}</Field>

          <Field label="Pills or medication" error={medError} hint="For example: Meftal, iron tablet, birth-control pill.">
            {ex.meds.length ? (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.xs }}>
                {ex.meds.map((m) => (
                  <Pressable
                    key={m}
                    onPress={() => patch({ meds: ex.meds.filter((x) => x !== m) })}
                    accessibilityRole="button"
                    accessibilityLabel={`Remove ${m}`}
                    style={{
                      minHeight: touch.min,
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 6,
                      paddingHorizontal: space.sm,
                      borderRadius: radius.chip,
                      borderWidth: 2,
                      borderColor: c.cycle,
                      backgroundColor: c.cycleSoft,
                    }}
                  >
                    <Text variant="bodyStrong">{m}</Text>
                    <X size={16} color={c.ink} />
                  </Pressable>
                ))}
              </View>
            ) : null}
            <View style={{ flexDirection: 'row', gap: space.xs, alignItems: 'center' }}>
              <View style={{ flex: 1 }}>
                <Input
                  value={medDraft}
                  onChangeText={(t) => {
                    setMedDraft(t);
                    setMedError(null);
                  }}
                  onSubmitEditing={() => addMed(medDraft)}
                  maxLength={MED_TAG_MAX}
                  returnKeyType="done"
                  error={!!medError}
                  accessibilityLabel="Pill or medication name"
                />
              </View>
              <Button label="Add" icon={Plus} variant="secondary" onPress={() => addMed(medDraft)} accessibilityLabel="Add pill or medication" />
            </View>
            {recentMeds.filter((m) => !ex.meds.includes(m)).length ? (
              <ChipRow label="Recent">
                {recentMeds
                  .filter((m) => !ex.meds.includes(m))
                  .slice(0, 5)
                  .map((m) => (
                    <ToggleChip key={m} label={`+ ${m}`} selected={false} onPress={() => addMed(m)} />
                  ))}
              </ChipRow>
            ) : null}
          </Field>

          <Field label="Note (optional)" error={error}>
            <Input
              value={note}
              onChangeText={setNote}
              multiline
              maxLength={500}
              accessibilityLabel="Note"
              style={{ minHeight: 96, paddingTop: space.sm, textAlignVertical: 'top' }}
            />
          </Field>
          <Text variant="caption" tone="muted">
            Flow logged here also counts as a period day. Everything stays on this phone; notes are never sent to the AI coach.
          </Text>
        </>
      )}
    </Sheet>
  );
}
