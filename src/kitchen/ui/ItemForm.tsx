/**
 * Pantry item form (new product or edit): name, brand, category, quantity, use-by date and the
 * per-100 g nutrition from the label. Every input has a visible label; errors show under the field.
 * A live health check appears once the label numbers are filled in.
 */
import { Check } from 'lucide-react-native';
import React, { useMemo, useState } from 'react';
import { View } from 'react-native';
import { ChipRow, Field, Input, ToggleChip } from '../../components/sheets/Sheet';
import { Button, Text } from '../../components/ui';
import { ValidationError } from '../../db/repos';
import { addDays, diffDays, formatDay, todayKey } from '../../health/dates';
import { space } from '../../theme/tokens';
import { healthCheck } from '../healthCheck';
import { CATEGORY_LABEL, PANTRY_CATEGORIES, type PantryCategory } from '../ingredients';
import type { Nutrition100, PantryDraft } from '../pantry';
import { validateDraft } from '../pantry';
import { guessIngredientKey } from '../parse';
import { HealthCheckCard, useFoodColors } from './parts';

type NKey = 'kcal' | 'protein' | 'carbs' | 'fat' | 'satFat' | 'sugar' | 'salt' | 'fiber';
const N_FIELDS: { key: NKey; label: string; optional?: boolean }[] = [
  { key: 'kcal', label: 'Energy (kcal)' },
  { key: 'protein', label: 'Protein (g)' },
  { key: 'carbs', label: 'Carbohydrate (g)' },
  { key: 'sugar', label: 'of which sugars (g)' },
  { key: 'fat', label: 'Fat (g)' },
  { key: 'satFat', label: 'Saturated fat (g, optional)', optional: true },
  { key: 'salt', label: 'Salt (g)' },
  { key: 'fiber', label: 'Fibre (g, optional)', optional: true },
];

const toStr = (n: number | null | undefined) => (n == null ? '' : String(n));
const parseNum = (s: string) => (s.trim() === '' ? null : Number(s.replace(',', '.')));

const EXPIRY_CHOICES: { label: string; days: number | null }[] = [
  { label: 'No date', days: null },
  { label: 'Today', days: 0 },
  { label: '2 days', days: 2 },
  { label: '1 week', days: 7 },
  { label: '2 weeks', days: 14 },
  { label: '1 month', days: 30 },
];

export function ItemForm({
  initial,
  submitLabel,
  onSubmit,
  showNutritionInitially,
}: {
  initial: PantryDraft;
  submitLabel: string;
  onSubmit: (d: PantryDraft) => Promise<void>;
  showNutritionInitially?: boolean;
}) {
  const f = useFoodColors();
  const today = todayKey();
  const [name, setName] = useState(initial.name ?? '');
  const [brand, setBrand] = useState(initial.brand ?? '');
  const [category, setCategory] = useState<PantryCategory>(initial.category ?? 'packaged');
  const [qty, setQty] = useState(toStr(initial.quantity));
  const [unit, setUnit] = useState(initial.unit ?? '');
  const [expiresOn, setExpiresOn] = useState<string | null>(initial.expiresOn ?? null);
  const [showN, setShowN] = useState(!!showNutritionInitially || !!initial.nutritionPer100g);
  const n0 = initial.nutritionPer100g;
  const [nv, setNv] = useState<Record<NKey, string>>({
    kcal: toStr(n0?.kcal),
    protein: toStr(n0?.protein),
    carbs: toStr(n0?.carbs),
    fat: toStr(n0?.fat),
    satFat: toStr(n0?.satFat ?? null),
    sugar: toStr(n0?.sugar),
    salt: toStr(n0?.salt),
    fiber: toStr(n0?.fiber),
  });
  const [errors, setErrors] = useState<Record<string, string | null>>({});
  const [busy, setBusy] = useState(false);

  const nutrition: Nutrition100 | null = useMemo(() => {
    if (!showN) return null;
    const required: NKey[] = ['kcal', 'protein', 'carbs', 'fat', 'sugar', 'salt'];
    if (required.some((k) => nv[k].trim() === '')) return null;
    const v = (k: NKey) => parseNum(nv[k]) ?? 0;
    const out: Nutrition100 = { kcal: v('kcal'), protein: v('protein'), carbs: v('carbs'), fat: v('fat'), fiber: v('fiber'), sugar: v('sugar'), salt: v('salt') };
    if (nv.satFat.trim() !== '') out.satFat = v('satFat');
    return Object.values(out).every((x) => typeof x === 'number' && Number.isFinite(x)) ? out : null;
  }, [nv, showN]);

  const preview = useMemo(() => {
    if (!nutrition) return null;
    try {
      validateDraft({ name: 'x', nutritionPer100g: nutrition });
      return healthCheck(nutrition, initial.nutriscore ?? null);
    } catch {
      return null;
    }
  }, [nutrition, initial.nutriscore]);

  const submit = async () => {
    const e: Record<string, string | null> = {};
    if (!name.trim()) e.name = 'Give the item a name.';
    const q = parseNum(qty);
    if (qty.trim() && (q === null || !Number.isFinite(q) || q < 0)) e.quantity = 'Enter a number, or leave it empty.';
    if (showN) {
      const anyFilled = N_FIELDS.some((x) => nv[x.key].trim() !== '');
      if (anyFilled) {
        for (const x of N_FIELDS) {
          const s = nv[x.key];
          if (!x.optional && s.trim() === '') e[x.key] = 'Fill this in from the label (per 100 g).';
          else if (s.trim() && (!Number.isFinite(parseNum(s) ?? NaN) || (parseNum(s) ?? 0) < 0)) e[x.key] = 'Enter a number.';
        }
        const sugar = parseNum(nv.sugar) ?? 0;
        const carbs = parseNum(nv.carbs) ?? 0;
        if (!e.sugar && !e.carbs && sugar > carbs + 0.5) e.sugar = 'Sugars are part of carbohydrate, so they can’t be more than it.';
      }
    }
    setErrors(e);
    if (Object.values(e).some(Boolean)) return;
    const draft: PantryDraft = {
      ...initial,
      name: name.trim(),
      brand: brand.trim() || null,
      category,
      quantity: qty.trim() ? q : null,
      unit: unit.trim() || null,
      expiresOn,
      nutritionPer100g: showN ? nutrition : (initial.nutritionPer100g ?? null),
      ingredientKey: initial.ingredientKey ?? guessIngredientKey(name),
    };
    try {
      validateDraft(draft);
    } catch (err) {
      if (err instanceof ValidationError) {
        setErrors({ [err.field]: err.message });
        return;
      }
    }
    setBusy(true);
    try {
      await onSubmit(draft);
    } catch (err) {
      setErrors({ form: err instanceof ValidationError ? err.message : 'Couldn’t save. Please try again.' });
    } finally {
      setBusy(false);
    }
  };

  const text = (key: string, label: string, value: string, set: (s: string) => void, opts: { numeric?: boolean; hint?: string; max?: number } = {}) => (
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
        maxLength={opts.max ?? (opts.numeric ? 7 : 80)}
      />
    </Field>
  );

  const daysLeft = expiresOn ? diffDays(today, expiresOn) : null;

  return (
    <View style={{ gap: space.md }}>
      {text('name', 'Name', name, setName)}
      {text('brand', 'Brand (optional)', brand, setBrand, { max: 60 })}
      <Field label="Category">
        <ChipRow label="Category">
          {PANTRY_CATEGORIES.map((cat) => (
            <ToggleChip key={cat} role="radio" label={CATEGORY_LABEL[cat]} selected={category === cat} onPress={() => setCategory(cat)} accent={f.foodStrong} soft={f.foodSoft} />
          ))}
        </ChipRow>
      </Field>
      <View style={{ flexDirection: 'row', gap: space.sm }}>
        <View style={{ flex: 1 }}>{text('quantity', 'Quantity (optional)', qty, setQty, { numeric: true })}</View>
        <View style={{ flex: 1 }}>{text('unit', 'Unit (optional)', unit, setUnit, { hint: 'g, kg, pcs, packet…', max: 12 })}</View>
      </View>
      <Field
        label="Use by"
        error={errors.expiresOn}
        hint={expiresOn ? `${formatDay(expiresOn, { day: 'numeric', month: 'short' })}${daysLeft != null ? ` · ${daysLeft < 0 ? 'past its date' : daysLeft === 0 ? 'today' : `in ${daysLeft} day${daysLeft === 1 ? '' : 's'}`}` : ''}` : 'No date set'}
      >
        <ChipRow label="Use by">
          {EXPIRY_CHOICES.map((ch) => {
            const target = ch.days == null ? null : addDays(today, ch.days);
            return (
              <ToggleChip
                key={ch.label}
                role="radio"
                label={ch.label}
                selected={expiresOn === target}
                onPress={() => setExpiresOn(target)}
                accent={f.foodStrong}
                soft={f.foodSoft}
              />
            );
          })}
        </ChipRow>
      </Field>

      {showN ? (
        <View style={{ gap: space.sm }}>
          <Text variant="heading" accessibilityRole="header">
            Nutrition per 100 g (from the label)
          </Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
            {N_FIELDS.map((x) => (
              <View key={x.key} style={{ flexBasis: '46%', flexGrow: 1 }}>
                {text(x.key, x.label, nv[x.key], (s) => setNv((p) => ({ ...p, [x.key]: s })), { numeric: true })}
              </View>
            ))}
          </View>
          {preview ? <HealthCheckCard check={preview} /> : <Text tone="muted">Fill in the label numbers to see a friendly health check.</Text>}
        </View>
      ) : (
        <Button label="Add nutrition from the label" variant="secondary" onPress={() => setShowN(true)} />
      )}

      {errors.form ? (
        <Text tone="danger" accessibilityLiveRegion="polite">
          {errors.form}
        </Text>
      ) : null}
      <Button label={submitLabel} icon={Check} onPress={submit} loading={busy} />
    </View>
  );
}
