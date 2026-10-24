/**
 * Add food: search (diet-aware), Recent, Favourites, My foods; quantity in servings (0.5 steps)
 * or grams; live kcal/protein preview; AI quick add (with a Gemini key) that the user confirms.
 * Edit mode: /food/add?id=<entry id>. Preselect a meal: /food/add?meal=lunch.
 */
import { router, useLocalSearchParams } from 'expo-router';
import { Check, Plus, Search, Sparkles, Star, Trash2 } from 'lucide-react-native';
import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import { useCoach } from '../../ai/CoachState';
import { needsAiSetup } from '../../ai/key';
import { searchFoods, FOODS } from '../../content/foods';
import { DemoBanner } from '../../components/DemoBanner';
import { Screen } from '../../components/Screen';
import { ChipRow, Field, Input, ToggleChip } from '../../components/sheets/Sheet';
import { Button, Card, IconButton, Segmented, Text } from '../../components/ui';
import { customFoods, favourites, foodEntries, MEAL_LABEL, MEALS, ValidationError, type CustomFood, type FoodEntry, type Meal } from '../../db/repos';
import { todayKey } from '../../health/dates';
import { fitsDiet, mealSlotFor, searchDietFor } from '../../plan/adapt';
import { logFood, logFoods, toggleFavourite, updateFood } from '../../plan/actions';
import { aiParseFood, type AiFoodItem } from '../../plan/aiFood';
import { fromCustom, fromEntry, fromFood, scale, servingsFromGrams, type Pickable } from '../../plan/foodPick';
import type { DietPref } from '../../plan/profile';
import { loadProfile } from '../../plan/store';
import { BackHeader, InfoNote, Stepper } from '../../plan/ui/parts';
import { radius, space, touch } from '../../theme/tokens';
import { useTheme } from '../../theme/useTheme';

type Tab = 'search' | 'recent' | 'favs' | 'mine';

export default function AddFood() {
  const { c } = useTheme();
  const params = useLocalSearchParams<{ meal?: string; id?: string }>();
  const editId = params?.id ? Number(params.id) : null;
  const [meal, setMeal] = useState<Meal>(
    (MEALS as string[]).includes(params?.meal ?? '') ? (params?.meal as Meal) : (mealSlotFor(new Date().getHours()) as Meal)
  );
  const [diet, setDiet] = useState<DietPref>('nonveg');
  const [tab, setTab] = useState<Tab>('search');
  const [query, setQuery] = useState('');
  const [recent, setRecent] = useState<FoodEntry[]>([]);
  const [favKeys, setFavKeys] = useState<string[]>([]);
  const [mine, setMine] = useState<CustomFood[]>([]);
  const [picked, setPicked] = useState<Pickable | null>(null);
  const [editing, setEditing] = useState<FoodEntry | null>(null);

  const reloadLists = () => {
    foodEntries.recent().then(setRecent).catch(() => {});
    favourites.list().then(setFavKeys).catch(() => {});
    customFoods.list().then(setMine).catch(() => {});
  };
  useEffect(() => {
    loadProfile()
      .then((p) => p && setDiet(p.diet))
      .catch(() => {});
    reloadLists();
    if (editId !== null)
      foodEntries
        .get(editId)
        .then((e) => {
          if (!e) return;
          setEditing(e);
          setMeal(e.meal);
          setPicked(fromEntry(e));
        })
        .catch(() => {});
  }, [editId]);

  const results = useMemo(() => {
    const q = query.trim();
    if (q.length < 2) return [];
    return searchFoods(q, { diet: searchDietFor(diet), limit: 30 }).filter((f) => fitsDiet(f, diet));
  }, [query, diet]);

  const resolveKey = (key: string): Pickable | null => {
    if (key.startsWith('db:')) {
      const f = FOODS.find((x) => `db:${x.id}` === key);
      return f ? fromFood(f) : null;
    }
    if (key.startsWith('custom:')) {
      const f = mine.find((x) => `custom:${x.id}` === key);
      return f ? fromCustom(f) : null;
    }
    return null;
  };

  const favItems = favKeys.map(resolveKey).filter((x): x is Pickable => !!x);

  return (
    <Screen>
      <BackHeader title={editId !== null ? 'Edit food' : 'Add food'} subtitle={MEAL_LABEL[meal]} />
      <DemoBanner />

      <Field label="Meal">
        <ChipRow label="Meal">
          {MEALS.map((m) => (
            <ToggleChip key={m} role="radio" label={MEAL_LABEL[m]} selected={meal === m} onPress={() => setMeal(m)} accent={c.steps} soft={c.stepsSoft} />
          ))}
        </ChipRow>
      </Field>

      {picked ? (
        <QuantityCard
          item={picked}
          meal={meal}
          editing={editing}
          isFav={!!picked.key && favKeys.includes(picked.key)}
          onFav={async () => {
            if (!picked.key) return;
            await toggleFavourite(picked.key);
            reloadLists();
          }}
          onCancel={() => (editing ? (router.canGoBack() ? router.back() : router.replace('/food')) : setPicked(null))}
        />
      ) : (
        <>
          <AiQuickAdd meal={meal} />
          <Segmented
            accessibilityLabel="Find food"
            value={tab}
            onChange={setTab}
            options={[
              { value: 'search', label: 'Search' },
              { value: 'recent', label: 'Recent' },
              { value: 'favs', label: 'Saved' },
              { value: 'mine', label: 'Mine' },
            ]}
          />
          {tab === 'search' ? (
            <>
              <Field label="Search foods" hint={diet === 'jain' ? 'Showing Jain-friendly foods (no onion, garlic or root vegetables in the name).' : 'Try “roti”, “dal”, “paneer”, “idli”…'}>
                <Input value={query} onChangeText={setQuery} autoCorrect={false} accessibilityLabel="Search foods" returnKeyType="search" />
              </Field>
              {query.trim().length >= 2 && !results.length ? (
                <Text tone="muted">No match. Try another name, or create your own food below.</Text>
              ) : null}
              <FoodList items={results.map(fromFood)} onPick={setPicked} />
            </>
          ) : tab === 'recent' ? (
            recent.length ? (
              <FoodList items={recent.map((e) => (e.foodKey ? resolveKey(e.foodKey) : null) ?? fromEntry(e))} onPick={setPicked} />
            ) : (
              <Text tone="muted">Foods you log will show up here for one-tap adding.</Text>
            )
          ) : tab === 'favs' ? (
            favItems.length ? (
              <FoodList items={favItems} onPick={setPicked} />
            ) : (
              <Text tone="muted">Tap the star on any food to save it here.</Text>
            )
          ) : mine.length ? (
            <FoodList items={mine.map(fromCustom)} onPick={setPicked} />
          ) : (
            <Text tone="muted">Foods you create appear here.</Text>
          )}
          <Button label="Create my own food" variant="secondary" icon={Plus} onPress={() => router.push('/food/custom')} />
        </>
      )}
    </Screen>
  );
}

function FoodList({ items, onPick }: { items: Pickable[]; onPick: (p: Pickable) => void }) {
  const { c } = useTheme();
  if (!items.length) return null;
  return (
    <Card style={{ paddingVertical: space.xs }}>
      {items.map((f, i) => (
        <Pressable
          key={`${f.key ?? f.name}-${i}`}
          onPress={() => onPick(f)}
          accessibilityRole="button"
          accessibilityLabel={`${f.name}, ${f.servingLabel}, ${Math.round(f.per.kcal)} kilocalories, ${Math.round(f.per.protein)} grams protein`}
          accessibilityHint="Choose quantity"
          android_ripple={{ color: c.line }}
          style={({ pressed }) => ({
            minHeight: touch.min + 8,
            flexDirection: 'row',
            alignItems: 'center',
            gap: space.sm,
            paddingVertical: space.xs,
            borderTopWidth: i === 0 ? 0 : 1,
            borderTopColor: c.line,
            opacity: pressed ? 0.8 : 1,
          })}
        >
          <View style={{ flex: 1 }}>
            <Text variant="bodyStrong">{f.name}</Text>
            <Text variant="caption" tone="muted">
              {f.servingLabel}
              {f.approx ? ' · approx.' : ''}
              {f.source === 'custom' ? ' · My food' : f.source === 'ai' ? ' · AI estimate' : ''}
            </Text>
          </View>
          <Text variant="bodyStrong">{Math.round(f.per.kcal)} kcal</Text>
          <Plus size={18} color={c.muted} />
        </Pressable>
      ))}
    </Card>
  );
}

function QuantityCard({
  item,
  meal,
  editing,
  isFav,
  onFav,
  onCancel,
}: {
  item: Pickable;
  meal: Meal;
  editing: FoodEntry | null;
  isFav: boolean;
  onFav: () => void;
  onCancel: () => void;
}) {
  const { c } = useTheme();
  const [mode, setMode] = useState<'servings' | 'grams'>(editing?.grams ? 'grams' : 'servings');
  const [servings, setServings] = useState(editing ? editing.servings : 1);
  const [grams, setGrams] = useState(editing?.grams ?? item.servingGrams ?? 100);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const canGrams = !!item.servingGrams;
  const qty = mode === 'grams' && canGrams ? servingsFromGrams(grams, item.servingGrams) : servings;
  const n = scale(item.per, qty);

  const save = async () => {
    if (!(qty > 0)) {
      setError('Enter a quantity above 0.');
      return;
    }
    setBusy(true);
    setError(null);
    const entry = {
      day: editing?.day ?? todayKey(),
      meal,
      foodKey: item.key,
      name: item.name,
      servings: qty,
      grams: mode === 'grams' && canGrams ? grams : null,
      ...n,
      source: item.source,
    };
    try {
      if (editing) await updateFood(editing.id, entry);
      else await logFood(entry);
      if (router.canGoBack()) router.back();
      else router.replace('/food');
    } catch (e) {
      setError(e instanceof ValidationError ? e.message : 'Couldn’t save. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: space.sm }}>
        <View style={{ flex: 1 }}>
          <Text variant="title">{item.name}</Text>
          <Text tone="muted">
            1 serving = {item.servingLabel}
            {item.approx ? ' (approx.)' : ''}
          </Text>
        </View>
        {item.key ? (
          <IconButton icon={Star} onPress={onFav} accessibilityLabel={isFav ? `Remove ${item.name} from saved foods` : `Save ${item.name} to favourites`} />
        ) : null}
      </View>
      {isFav ? (
        <Text variant="caption" tone="muted">
          ★ Saved
        </Text>
      ) : null}
      <View style={{ gap: space.md, marginTop: space.md }}>
        {canGrams ? (
          <Segmented
            accessibilityLabel="Quantity unit"
            value={mode}
            onChange={setMode}
            options={[
              { value: 'servings', label: 'Servings' },
              { value: 'grams', label: 'Grams' },
            ]}
          />
        ) : null}
        <Field label={mode === 'grams' && canGrams ? 'Grams' : 'Servings'} error={error}>
          {mode === 'grams' && canGrams ? (
            <Stepper label="Grams" unit="g" value={grams} decimals={0} onChange={(v) => setGrams(v)} step={10} min={5} max={2000} error={!!error} />
          ) : (
            <Stepper label="Servings" value={servings} onChange={(v) => setServings(v)} step={0.5} min={0.5} max={20} error={!!error} />
          )}
        </Field>
        <View
          accessible
          accessibilityLiveRegion="polite"
          accessibilityLabel={`This adds ${n.kcal} kilocalories and ${n.protein} grams protein`}
          style={{ flexDirection: 'row', gap: space.lg, backgroundColor: c.stepsSoft, borderRadius: radius.chip, padding: space.sm }}
        >
          <View>
            <Text variant="displaySm">{n.kcal}</Text>
            <Text variant="caption">kcal</Text>
          </View>
          <View>
            <Text variant="displaySm">{n.protein}</Text>
            <Text variant="caption">g protein</Text>
          </View>
          <View style={{ flex: 1, justifyContent: 'flex-end' }}>
            <Text variant="caption">
              Carbs {n.carbs} g · Fat {n.fat} g · Fibre {n.fiber} g
            </Text>
          </View>
        </View>
        <Button label={editing ? 'Update' : 'Add'} icon={Check} onPress={save} loading={busy} />
        <Button label={editing ? 'Cancel' : 'Choose a different food'} variant="ghost" onPress={onCancel} />
      </View>
    </Card>
  );
}

/* ------------------------------ AI quick add ----------------------------- */

function AiQuickAdd({ meal }: { meal: Meal }) {
  const { c } = useTheme();
  const coach = useCoach();
  const [text, setText] = useState('');
  const [items, setItems] = useState<AiFoodItem[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [needsSetup, setNeedsSetup] = useState(false);

  if (!coach.hasKey) {
    return (
      <View style={{ gap: space.xs }}>
        <InfoNote icon={Sparkles} accent={c.sleep} tint={c.sleepSoft}>
          Tip: add your free Gemini key in Settings → AI Coach to describe a meal in words (“2 roti, dal, salad”) and get an estimate.
        </InfoNote>
        <Button label="Set up AI Coach" variant="ghost" icon={Sparkles} onPress={() => router.push('/settings/ai')} accessibilityHint="Opens AI Coach setup" />
      </View>
    );
  }

  const run = async () => {
    if (!text.trim()) {
      setError('Describe what you ate first.');
      return;
    }
    setBusy(true);
    setError(null);
    setNeedsSetup(false);
    try {
      setItems(await aiParseFood(text));
    } catch (e) {
      setNeedsSetup(needsAiSetup(e));
      setError(e instanceof Error ? e.message : 'Couldn’t estimate that. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const saveAll = async () => {
    if (!items?.length) return;
    setBusy(true);
    try {
      await logFoods(
        items.map((it) => ({
          day: todayKey(),
          meal,
          foodKey: null,
          name: `${it.name} (${it.quantity} ${it.unit})`,
          servings: 1,
          grams: null,
          kcal: it.kcal,
          protein: it.protein,
          carbs: it.carbs,
          fat: it.fat,
          fiber: 0,
          source: 'ai' as const,
        }))
      );
      if (router.canGoBack()) router.back();
      else router.replace('/food');
    } catch (e) {
      setError(e instanceof ValidationError ? e.message : 'Couldn’t save. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const edit = (i: number, patch: Partial<AiFoodItem>) => setItems((xs) => (xs ? xs.map((x, j) => (j === i ? { ...x, ...patch } : x)) : xs));

  return (
    <Card tint={c.sleepSoft}>
      <Field label="AI quick add" error={error} hint="Describe your meal. You’ll check the estimate before saving.">
        <Input value={text} onChangeText={setText} placeholder="2 roti, dal, salad" accessibilityLabel="Describe what you ate" maxLength={300} />
      </Field>
      {needsSetup ? (
        <Button label="Set up AI Coach" variant="ghost" icon={Sparkles} onPress={() => router.push('/settings/ai')} accessibilityHint="Opens AI Coach setup" />
      ) : null}
      <Button label="Estimate with AI" variant="secondary" icon={Search} onPress={run} loading={busy && !items} style={{ marginTop: space.sm }} />
      {items ? (
        <View style={{ gap: space.sm, marginTop: space.md }}>
          <Text variant="label" tone="muted">
            AI ESTIMATE · CHECK AND EDIT
          </Text>
          {items.map((it, i) => (
            <View key={i} style={{ gap: 6, padding: space.sm, backgroundColor: c.surface, borderRadius: radius.chip }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.xs }}>
                <Text variant="bodyStrong" style={{ flex: 1 }}>
                  {it.name} · {it.quantity} {it.unit}
                </Text>
                <IconButton icon={Trash2} accessibilityLabel={`Remove ${it.name}`} onPress={() => setItems((xs) => (xs ? xs.filter((_, j) => j !== i) : xs))} />
              </View>
              <View style={{ flexDirection: 'row', gap: space.xs }}>
                <NumField label={`kcal for ${it.name}`} short="kcal" value={it.kcal} onChange={(v) => edit(i, { kcal: v })} />
                <NumField label={`Protein grams for ${it.name}`} short="Protein g" value={it.protein} onChange={(v) => edit(i, { protein: v })} />
              </View>
            </View>
          ))}
          <Text variant="caption">
            Total ≈ {Math.round(items.reduce((s, x) => s + x.kcal, 0))} kcal · {Math.round(items.reduce((s, x) => s + x.protein, 0))} g protein. AI
            estimates can be off — adjust if you know better.
          </Text>
          <Button label={`Save ${items.length} item${items.length === 1 ? '' : 's'}`} icon={Check} onPress={saveAll} loading={busy} disabled={!items.length} />
        </View>
      ) : null}
    </Card>
  );
}

function NumField({ label, short, value, onChange }: { label: string; short: string; value: number; onChange: (v: number) => void }) {
  const [raw, setRaw] = useState(String(value));
  return (
    <View style={{ flex: 1, gap: 4 }}>
      <Text variant="caption" tone="muted">
        {short}
      </Text>
      <Input
        value={raw}
        onChangeText={(t) => {
          const v = t.replace(/[^0-9.]/g, '');
          setRaw(v);
          const n = Number(v);
          if (Number.isFinite(n)) onChange(n);
        }}
        keyboardType="decimal-pad"
        maxLength={6}
        accessibilityLabel={label}
      />
    </View>
  );
}
