/**
 * Profile & goal form (onboarding step and "Edit goal" from Plan).
 * Visible labels, inline errors near fields, kind safety explanations, live plan preview.
 */
import { Check } from 'lucide-react-native';
import React, { useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import { ChipRow, Field, Input, ToggleChip } from '../../components/sheets/Sheet';
import { Button, Card, Segmented, Text } from '../../components/ui';
import { todayKey } from '../../health/dates';
import { radius, space, touch } from '../../theme/tokens';
import { useTheme } from '../../theme/useTheme';
import { checkGoal, computePlan, GAIN_PACE, goalMode, LOSS_PACE, minHealthyWeight, ADULT_AGE } from '../engine';
import {
  ACTIVITY_COPY,
  ACTIVITY_LEVELS,
  ageFrom,
  birthYearRange,
  cmToFtIn,
  DIET_HINT,
  DIET_LABEL,
  DIETS,
  ftInToCm,
  HEIGHT_RANGE,
  PACE_LABEL,
  PACES,
  type Profile,
} from '../profile';
import { InfoNote, Stepper } from './parts';
import { WEIGHT_RANGE } from '../../db/repos';

export const DEFAULT_DRAFT = (now = new Date()): Profile => ({
  formula: 'female',
  birthYear: now.getFullYear() - 28,
  heightCm: 160,
  weightKg: 65,
  targetKg: 60,
  activity: 'light',
  diet: 'veg',
  pace: 'steady',
  startDay: todayKey(now),
  yogaPerWeek: 4,
});

export function ProfileForm({
  initial,
  saveLabel,
  onSave,
  busy,
}: {
  initial: Profile;
  saveLabel: string;
  onSave: (p: Profile) => void;
  busy?: boolean;
}) {
  const { c } = useTheme();
  const [p, setP] = useState<Profile>(initial);
  const [yearRaw, setYearRaw] = useState(String(initial.birthYear));
  const [unit, setUnit] = useState<'cm' | 'ftin'>('cm');
  const [cmRaw, setCmRaw] = useState(String(initial.heightCm));
  const fi = cmToFtIn(initial.heightCm);
  const [ftRaw, setFtRaw] = useState(String(fi.ft));
  const [inRaw, setInRaw] = useState(String(fi.inch));
  const [errors, setErrors] = useState<Record<string, string | null>>({});

  const set = <K extends keyof Profile>(k: K, v: Profile[K]) => {
    setP((x) => ({ ...x, [k]: v }));
    setErrors((e) => ({ ...e, [k]: null, goal: null }));
  };

  const yr = birthYearRange();
  const year = Number(yearRaw);
  const yearOk = Number.isInteger(year) && year >= yr.min && year <= yr.max;
  const heightCm = unit === 'cm' ? Number(cmRaw.replace(',', '.')) : ftInToCm(Number(ftRaw) || 0, Number(inRaw) || 0);
  const heightOk = Number.isFinite(heightCm) && heightCm >= HEIGHT_RANGE.min && heightCm <= HEIGHT_RANGE.max;
  const weightOk = p.weightKg >= WEIGHT_RANGE.min && p.weightKg <= WEIGHT_RANGE.max;
  const targetOk = p.targetKg >= WEIGHT_RANGE.min && p.targetKg <= WEIGHT_RANGE.max;
  const draft: Profile = { ...p, birthYear: yearOk ? year : p.birthYear, heightCm: heightOk ? Math.round(heightCm * 10) / 10 : p.heightCm };
  const minor = yearOk && ageFrom(year) < ADULT_AGE;
  const check = heightOk && weightOk && targetOk ? checkGoal(draft) : ({ ok: true } as const);
  const mode = goalMode(draft.weightKg, draft.targetKg);
  const preview = useMemo(
    () => (yearOk && heightOk && weightOk && targetOk && check.ok ? computePlan(draft, { today: todayKey() }) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [JSON.stringify(draft), yearOk, heightOk, weightOk, targetOk, check.ok]
  );

  const submit = () => {
    const e: Record<string, string | null> = {};
    if (!yearOk) e.birthYear = `Enter a year between ${yr.min} and ${yr.max}.`;
    if (!heightOk) e.height = `Enter a height between ${HEIGHT_RANGE.min} and ${HEIGHT_RANGE.max} cm (about 4 ft to 7 ft 6 in).`;
    if (!weightOk) e.weightKg = `Enter a weight between ${WEIGHT_RANGE.min} and ${WEIGHT_RANGE.max} kg.`;
    if (!targetOk) e.targetKg = `Enter a target between ${WEIGHT_RANGE.min} and ${WEIGHT_RANGE.max} kg.`;
    if (!e.targetKg && !check.ok) e.goal = check.message;
    setErrors(e);
    if (Object.values(e).some(Boolean)) return;
    onSave(draft);
  };

  const paceText = (pc: Profile['pace']) =>
    mode === 'gain' ? `${GAIN_PACE[pc]} kg a week` : mode === 'lose' ? `${LOSS_PACE[pc]} kg a week` : 'Maintaining — pace not needed';

  return (
    <View style={{ gap: space.lg }}>
      <Field label="Which formula should we use?" hint="Calorie formulas differ for female and male bodies. Pick the one closest to yours.">
        <Segmented
          accessibilityLabel="Calorie formula"
          value={p.formula}
          onChange={(v) => set('formula', v)}
          options={[
            { value: 'female', label: 'Female' },
            { value: 'male', label: 'Male' },
          ]}
        />
      </Field>

      <Field label="Birth year" error={errors.birthYear} hint={minor ? undefined : 'Used only for the calorie formula.'}>
        <Input
          value={yearRaw}
          onChangeText={(t) => {
            setYearRaw(t.replace(/[^0-9]/g, ''));
            setErrors((e) => ({ ...e, birthYear: null }));
          }}
          keyboardType="number-pad"
          maxLength={4}
          error={!!errors.birthYear}
          accessibilityLabel="Birth year"
        />
      </Field>
      {minor ? (
        <InfoNote tint={c.cycleSoft} accent={c.cycle}>
          Bloom’s plans are for adults — please plan with a doctor or parent. You can still track food, weight and activity, without calorie targets.
        </InfoNote>
      ) : null}

      <Field label="Height" error={errors.height}>
        <View style={{ gap: space.xs }}>
          <Segmented
            accessibilityLabel="Height unit"
            value={unit}
            onChange={(u) => {
              if (u === 'ftin' && heightOk) {
                const f = cmToFtIn(heightCm);
                setFtRaw(String(f.ft));
                setInRaw(String(f.inch));
              }
              if (u === 'cm' && heightOk) setCmRaw(String(Math.round(heightCm)));
              setUnit(u);
            }}
            options={[
              { value: 'cm', label: 'cm' },
              { value: 'ftin', label: 'ft + in' },
            ]}
          />
          {unit === 'cm' ? (
            <Input
              value={cmRaw}
              onChangeText={(t) => {
                setCmRaw(t.replace(/[^0-9.,]/g, ''));
                setErrors((e) => ({ ...e, height: null }));
              }}
              keyboardType="decimal-pad"
              maxLength={5}
              error={!!errors.height}
              accessibilityLabel="Height in centimetres"
            />
          ) : (
            <View style={{ flexDirection: 'row', gap: space.sm }}>
              <View style={{ flex: 1, gap: 4 }}>
                <Text variant="caption" tone="muted">
                  Feet
                </Text>
                <Input value={ftRaw} onChangeText={(t) => setFtRaw(t.replace(/[^0-9]/g, ''))} keyboardType="number-pad" maxLength={1} error={!!errors.height} accessibilityLabel="Height, feet" />
              </View>
              <View style={{ flex: 1, gap: 4 }}>
                <Text variant="caption" tone="muted">
                  Inches
                </Text>
                <Input value={inRaw} onChangeText={(t) => setInRaw(t.replace(/[^0-9]/g, ''))} keyboardType="number-pad" maxLength={2} error={!!errors.height} accessibilityLabel="Height, inches" />
              </View>
            </View>
          )}
        </View>
      </Field>

      <Field label="Current weight (kg)" error={errors.weightKg}>
        <Stepper label="Current weight" unit="kg" value={p.weightKg} onChange={(v) => set('weightKg', v)} step={0.1} min={WEIGHT_RANGE.min} max={WEIGHT_RANGE.max} error={!!errors.weightKg} />
      </Field>

      <Field label="Target weight (kg)" error={errors.targetKg ?? errors.goal} hint="Set the same as your current weight to maintain.">
        <Stepper label="Target weight" unit="kg" value={p.targetKg} onChange={(v) => set('targetKg', v)} step={0.5} min={WEIGHT_RANGE.min} max={WEIGHT_RANGE.max} error={!!(errors.targetKg ?? errors.goal)} />
      </Field>
      {!check.ok ? (
        <View style={{ gap: space.xs }}>
          <InfoNote tint={c.cycleSoft} accent={c.cycle}>
            {check.message}
          </InfoNote>
          {check.reason === 'target-underweight' && check.suggestedTargetKg ? (
            <Button
              label={`Use ${check.suggestedTargetKg.toFixed(1)} kg as my target`}
              variant="secondary"
              onPress={() => set('targetKg', Math.min(draft.weightKg, check.suggestedTargetKg ?? draft.weightKg))}
            />
          ) : (
            <View style={{ flexDirection: 'row', gap: space.xs, flexWrap: 'wrap' }}>
              <Button label="Maintain my weight" variant="secondary" onPress={() => set('targetKg', p.weightKg)} />
              <Button
                label="Gently gain"
                variant="secondary"
                onPress={() => set('targetKg', Math.max(Math.round((p.weightKg + 2) * 10) / 10, minHealthyWeight(draft.heightCm)))}
              />
            </View>
          )}
        </View>
      ) : null}

      <Field label="How active are you on a usual day?">
        <View accessibilityRole="radiogroup" style={{ gap: space.xs }}>
          {ACTIVITY_LEVELS.map((a) => (
            <OptionRow key={a} selected={p.activity === a} title={ACTIVITY_COPY[a].label} body={ACTIVITY_COPY[a].body} onPress={() => set('activity', a)} />
          ))}
        </View>
      </Field>

      <Field label="Food preference" hint={DIET_HINT[p.diet]}>
        <ChipRow label="Food preference">
          {DIETS.map((d) => (
            <ToggleChip key={d} role="radio" label={DIET_LABEL[d]} selected={p.diet === d} onPress={() => set('diet', d)} accent={c.steps} soft={c.stepsSoft} />
          ))}
        </ChipRow>
      </Field>

      {mode !== 'maintain' && !minor ? (
        <Field label="Pace" hint={`${PACE_LABEL[p.pace]}: ${paceText(p.pace)}. Steady is a good default.`}>
          <Segmented accessibilityLabel="Pace" value={p.pace} onChange={(v) => set('pace', v)} options={PACES.map((x) => ({ value: x, label: PACE_LABEL[x] }))} />
        </Field>
      ) : null}

      <Field label="Yoga sessions a week" hint="A gentle weekly goal. Sessions from the Yoga tab count automatically.">
        <Stepper label="Yoga sessions a week" value={p.yogaPerWeek} decimals={0} onChange={(v) => set('yogaPerWeek', Math.round(v))} step={1} min={0} max={7} />
      </Field>

      {preview?.targets ? (
        <Card tint={c.surfaceAlt}>
          <View accessible accessibilityLabel={`Your plan preview: aim around ${preview.targets.kcalMin} to ${preview.targets.kcalMax} kilocalories a day, protein ${preview.targets.proteinG} grams.`}>
            <Text variant="label" tone="muted">
              YOUR PLAN PREVIEW
            </Text>
            <Text variant="displaySm" style={{ marginTop: 4 }}>
              {preview.targets.kcalMin.toLocaleString()}–{preview.targets.kcalMax.toLocaleString()} kcal
            </Text>
            <Text tone="muted">
              Aim around this each day · protein ~{preview.targets.proteinG} g · water ~{(preview.targets.waterMl / 1000).toFixed(1)} L
            </Text>
            {preview.paceKgWeek > 0 ? (
              <Text tone="muted">
                About {preview.paceKgWeek} kg a week{preview.weeksToGoal ? ` · roughly ${Math.ceil(preview.weeksToGoal)} weeks` : ''}
              </Text>
            ) : null}
            {preview.notes.map((n) => (
              <Text key={n} variant="caption" style={{ marginTop: space.xs }}>
                {n}
              </Text>
            ))}
          </View>
        </Card>
      ) : null}

      <Button label={saveLabel} icon={Check} onPress={submit} loading={busy} />
    </View>
  );
}

function OptionRow({ selected, title, body, onPress }: { selected: boolean; title: string; body: string; onPress: () => void }) {
  const { c } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ checked: selected }}
      accessibilityLabel={`${title}. ${body}`}
      android_ripple={{ color: c.line }}
      style={({ pressed }) => ({
        minHeight: touch.min + 12,
        flexDirection: 'row',
        alignItems: 'center',
        gap: space.sm,
        padding: space.sm,
        borderRadius: radius.chip,
        borderWidth: selected ? 2 : 1,
        borderColor: selected ? c.ink : c.line,
        backgroundColor: selected ? c.surfaceAlt : c.surface,
        opacity: pressed ? 0.85 : 1,
      })}
    >
      <View
        style={{
          width: 22,
          height: 22,
          borderRadius: 11,
          borderWidth: 2,
          borderColor: selected ? c.ink : c.muted,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {selected ? <Check size={14} color={c.ink} strokeWidth={3} /> : null}
      </View>
      <View style={{ flex: 1 }}>
        <Text variant="bodyStrong">{title}</Text>
        <Text variant="caption" tone="muted">
          {body}
        </Text>
      </View>
    </Pressable>
  );
}
