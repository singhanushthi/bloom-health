/**
 * Create a custom food (saved on this phone): name, serving, kcal; protein/carbs/fat/fibre optional.
 */
import { router } from 'expo-router';
import { Check } from 'lucide-react-native';
import React, { useState } from 'react';
import { View } from 'react-native';
import { Screen } from '../../components/Screen';
import { Field, Input } from '../../components/sheets/Sheet';
import { Button, Text } from '../../components/ui';
import { ValidationError } from '../../db/repos';
import { addCustomFood } from '../../plan/actions';
import { BackHeader } from '../../plan/ui/parts';
import { space } from '../../theme/tokens';

const num = (s: string) => (s.trim() === '' ? 0 : Number(s.replace(',', '.')));

export default function CustomFood() {
  const [name, setName] = useState('');
  const [serving, setServing] = useState('1 bowl');
  const [grams, setGrams] = useState('');
  const [kcal, setKcal] = useState('');
  const [protein, setProtein] = useState('');
  const [carbs, setCarbs] = useState('');
  const [fat, setFat] = useState('');
  const [fiber, setFiber] = useState('');
  const [errors, setErrors] = useState<Record<string, string | null>>({});
  const [busy, setBusy] = useState(false);

  const save = async () => {
    const e: Record<string, string | null> = {};
    if (!name.trim()) e.name = 'Give the food a name.';
    if (!serving.trim()) e.servingLabel = 'Describe one serving, e.g. “1 bowl”.';
    if (kcal.trim() === '' || !Number.isFinite(num(kcal))) e.kcal = 'Enter calories for one serving.';
    for (const [k, v] of Object.entries({ protein, carbs, fat, fiber, grams }))
      if (v.trim() && (!Number.isFinite(num(v)) || num(v) < 0)) e[k] = 'Enter a number, or leave it empty.';
    setErrors(e);
    if (Object.values(e).some(Boolean)) return;
    setBusy(true);
    try {
      await addCustomFood({
        name,
        servingLabel: serving,
        servingGrams: grams.trim() ? num(grams) : null,
        kcal: num(kcal),
        protein: num(protein),
        carbs: num(carbs),
        fat: num(fat),
        fiber: num(fiber),
      });
      if (router.canGoBack()) router.back();
      else router.replace('/food/add');
    } catch (err) {
      if (err instanceof ValidationError) setErrors({ [err.field]: err.message });
      else setErrors({ form: 'Couldn’t save. Please try again.' });
    } finally {
      setBusy(false);
    }
  };

  const field = (key: string, label: string, value: string, set: (s: string) => void, opts: { numeric?: boolean; hint?: string } = {}) => (
    <Field label={label} error={errors[key]} hint={opts.hint}>
      <Input
        value={value}
        onChangeText={(t) => {
          set(t);
          setErrors((x) => ({ ...x, [key]: null }));
        }}
        keyboardType={opts.numeric ? 'decimal-pad' : 'default'}
        error={!!errors[key]}
        accessibilityLabel={label}
        maxLength={opts.numeric ? 6 : 60}
      />
    </Field>
  );

  return (
    <Screen>
      <BackHeader title="My own food" subtitle="Saved only on this phone" />
      {field('name', 'Name', name, setName, { hint: 'For example “Mom’s rajma”.' })}
      {field('servingLabel', 'One serving is', serving, setServing)}
      {field('grams', 'Serving weight in grams (optional)', grams, setGrams, { numeric: true, hint: 'Lets you log by grams later.' })}
      {field('kcal', 'Calories per serving (kcal)', kcal, setKcal, { numeric: true })}
      <View style={{ flexDirection: 'row', gap: space.sm }}>
        <View style={{ flex: 1 }}>{field('protein', 'Protein g (optional)', protein, setProtein, { numeric: true })}</View>
        <View style={{ flex: 1 }}>{field('carbs', 'Carbs g (optional)', carbs, setCarbs, { numeric: true })}</View>
      </View>
      <View style={{ flexDirection: 'row', gap: space.sm }}>
        <View style={{ flex: 1 }}>{field('fat', 'Fat g (optional)', fat, setFat, { numeric: true })}</View>
        <View style={{ flex: 1 }}>{field('fiber', 'Fibre g (optional)', fiber, setFiber, { numeric: true })}</View>
      </View>
      {errors.form ? <Text tone="danger">{errors.form}</Text> : null}
      <Button label="Save food" icon={Check} onPress={save} loading={busy} />
    </Screen>
  );
}
