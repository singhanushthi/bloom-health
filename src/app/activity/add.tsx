/**
 * Log an activity: type grid → duration (chips + custom) → intensity → save.
 * kcal = MET × weight × hours (src/plan/met.ts). Edit mode: /activity/add?id=<id>.
 */
import { router, useLocalSearchParams } from 'expo-router';
import { Check } from 'lucide-react-native';
import React, { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import { DemoBanner } from '../../components/DemoBanner';
import { Screen } from '../../components/Screen';
import { ChipRow, Field, Input, ToggleChip } from '../../components/sheets/Sheet';
import { Button, Card, Text } from '../../components/ui';
import { activityLogs, ACTIVITY_MAX_MINUTES } from '../../db/repos';
import { todayKey } from '../../health/dates';
import { addActivity, updateActivity, weightForBurn } from '../../plan/activity';
import { ACTIVITY_LABEL, ACTIVITY_TYPES, activityKcal, INTENSITIES, INTENSITY_HINT, INTENSITY_LABEL, type ActivityType, type Intensity } from '../../plan/met';
import { ACTIVITY_ICON } from '../../plan/ui/activityIcons';
import { BackHeader, InfoNote } from '../../plan/ui/parts';
import { radius, space, touch } from '../../theme/tokens';
import { useTheme } from '../../theme/useTheme';

const MINUTE_CHIPS = [10, 20, 30, 45, 60];

export default function AddActivity() {
  const { c } = useTheme();
  const params = useLocalSearchParams<{ id?: string; type?: string }>();
  const editId = params?.id ? Number(params.id) : null;
  const [type, setType] = useState<ActivityType>((ACTIVITY_TYPES as string[]).includes(params?.type ?? '') ? (params?.type as ActivityType) : 'walk');
  const [minutes, setMinutes] = useState<number | null>(30);
  const [custom, setCustom] = useState('');
  const [intensity, setIntensity] = useState<Intensity>('moderate');
  const [title, setTitle] = useState('');
  const [day, setDay] = useState(todayKey());
  const [kg, setKg] = useState(60);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    weightForBurn().then(setKg).catch(() => {});
    if (editId === null) return;
    activityLogs
      .get(editId)
      .then((a) => {
        if (!a) return;
        setType((ACTIVITY_TYPES as string[]).includes(a.type) ? (a.type as ActivityType) : 'other');
        setIntensity(a.intensity);
        setTitle(a.title ?? '');
        setDay(a.day);
        if (MINUTE_CHIPS.includes(a.minutes)) setMinutes(a.minutes);
        else {
          setMinutes(null);
          setCustom(String(a.minutes));
        }
      })
      .catch(() => {});
  }, [editId]);

  const mins = minutes ?? Number(custom);
  const valid = Number.isFinite(mins) && mins >= 1 && mins <= ACTIVITY_MAX_MINUTES;
  const kcal = valid ? activityKcal(type, intensity, mins, kg) : 0;

  const save = async () => {
    if (!valid) {
      setError(`Enter between 1 and ${ACTIVITY_MAX_MINUTES} minutes.`);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      if (editId !== null) await updateActivity(editId, { type, title: title.trim() || null, minutes: mins, intensity, day });
      else await addActivity({ type, title: title.trim() || undefined, minutes: mins, intensity, dateKey: day, source: 'manual' });
      if (router.canGoBack()) router.back();
      else router.replace('/activity');
    } catch {
      setError('Couldn’t save. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <BackHeader title={editId !== null ? 'Edit activity' : 'Log activity'} subtitle="What did you do today?" />
      <DemoBanner />

      <Field label="Activity">
        <View accessibilityRole="radiogroup" accessibilityLabel="Activity type" style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.xs }}>
          {ACTIVITY_TYPES.map((t) => {
            const Icon = ACTIVITY_ICON[t];
            const sel = t === type;
            return (
              <Pressable
                key={t}
                onPress={() => setType(t)}
                accessibilityRole="radio"
                accessibilityState={{ checked: sel }}
                accessibilityLabel={ACTIVITY_LABEL[t]}
                android_ripple={{ color: c.line }}
                style={({ pressed }) => ({
                  width: '31.5%',
                  minHeight: 76,
                  borderRadius: radius.chip,
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 4,
                  padding: space.xs,
                  borderWidth: sel ? 2 : 1,
                  borderColor: sel ? c.heart : c.line,
                  backgroundColor: sel ? c.heartSoft : c.surface,
                  opacity: pressed ? 0.85 : 1,
                })}
              >
                <Icon size={22} color={sel ? c.heart : c.ink} />
                <Text variant={sel ? 'bodyStrong' : 'body'} style={{ fontSize: 14, textAlign: 'center' }}>
                  {sel ? '✓ ' : ''}
                  {ACTIVITY_LABEL[t]}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </Field>

      <Field label="How long?" error={error}>
        <ChipRow label="Duration">
          {MINUTE_CHIPS.map((m) => (
            <ToggleChip
              key={m}
              role="radio"
              label={`${m} min`}
              selected={minutes === m}
              onPress={() => {
                setMinutes(m);
                setCustom('');
                setError(null);
              }}
              accent={c.heart}
              soft={c.heartSoft}
            />
          ))}
          <ToggleChip role="radio" label="Custom" selected={minutes === null} onPress={() => setMinutes(null)} accent={c.heart} soft={c.heartSoft} />
        </ChipRow>
        {minutes === null ? (
          <View style={{ marginTop: space.xs, gap: 4 }}>
            <Text variant="caption" tone="muted" nativeID="customMinutes">
              Minutes
            </Text>
            <Input
              value={custom}
              onChangeText={(t) => {
                setCustom(t.replace(/[^0-9]/g, ''));
                setError(null);
              }}
              keyboardType="number-pad"
              maxLength={3}
              error={!!error}
              accessibilityLabel="Custom minutes"
              accessibilityLabelledBy="customMinutes"
            />
          </View>
        ) : null}
      </Field>

      <Field label="How hard?" hint={INTENSITY_HINT[intensity]}>
        <ChipRow label="Intensity">
          {INTENSITIES.map((i) => (
            <ToggleChip key={i} role="radio" label={INTENSITY_LABEL[i]} selected={intensity === i} onPress={() => setIntensity(i)} accent={c.heart} soft={c.heartSoft} />
          ))}
        </ChipRow>
      </Field>

      <Field label="Name (optional)" hint="For example “Evening walk with Maa”.">
        <Input value={title} onChangeText={setTitle} maxLength={60} accessibilityLabel="Activity name, optional" />
      </Field>

      <Card tint={c.heartSoft}>
        <View accessible accessibilityLabel={`Estimated burn about ${kcal} kilocalories. Half counts toward today's food allowance.`}>
          <Text variant="label" tone="muted">
            ESTIMATED BURN
          </Text>
          <Text variant="displaySm">~{kcal} kcal</Text>
          <Text variant="caption">
            Based on {kg.toFixed(1)} kg. We count half of exercise calories toward your food allowance to stay on the safe side.
          </Text>
        </View>
      </Card>

      <Button label={editId !== null ? 'Update activity' : 'Save activity'} icon={Check} onPress={save} loading={busy} style={{ minHeight: Math.max(52, touch.min) }} />
      <InfoNote>Steps you walk all day are already part of your activity level, so they aren’t added again.</InfoNote>
    </Screen>
  );
}
