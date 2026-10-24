/**
 * Recipe: time, servings stepper (scales ingredients), have/need checklist, steps, nutrition per
 * serving and "Log this meal" (adds the recipe to today's food log via the plan's logFood).
 */
import { router, useLocalSearchParams } from 'expo-router';
import { BookmarkPlus, Carrot, Check, ChefHat, Flame, Leaf, Plus, ShoppingCart, Sparkles, Timer, Trash2 } from 'lucide-react-native';
import React, { useEffect, useMemo, useState } from 'react';
import { View } from 'react-native';
import { DemoBanner } from '../../../components/DemoBanner';
import { Screen } from '../../../components/Screen';
import { ChipRow, Field, ToggleChip } from '../../../components/sheets/Sheet';
import { Button, Card, CardHeader, CardSkeleton, Text } from '../../../components/ui';
import { DIET_LABEL_SHORT } from '../../../kitchen/ui/labels';
import { getRecipe, ingredientLine, TAG_LABEL, type Recipe } from '../../../content/recipes';
import { MEAL_LABEL, MEALS, type Meal } from '../../../db/repos';
import { todayKey } from '../../../health/dates';
import { AI_RECIPE_LABEL } from '../../../kitchen/aiRecipe';
import { getPendingRecipe } from '../../../kitchen/handoff';
import { getIngredient } from '../../../kitchen/ingredients';
import { coverageFor, isAvailable, mealForHour } from '../../../kitchen/match';
import { BigStat, MetaChip, useFoodColors } from '../../../kitchen/ui/parts';
import { useKitchen } from '../../../kitchen/useKitchen';
import { logFood } from '../../../plan/actions';
import { scale } from '../../../plan/foodPick';
import { BackHeader, InfoNote, Stepper } from '../../../plan/ui/parts';
import { space } from '../../../theme/tokens';
import { useTheme } from '../../../theme/useTheme';

export default function RecipeScreen() {
  const { id: rawId } = useLocalSearchParams<{ id: string }>();
  const id = decodeURIComponent(String(rawId ?? ''));
  const k = useKitchen();
  const [recipe, setRecipe] = useState<Recipe | null | undefined>(() => getRecipe(id) ?? getPendingRecipe(id) ?? undefined);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (getRecipe(id)) return;
    let live = true;
    k.repos.myRecipes
      .get(id)
      .then((r) => {
        if (!live) return;
        if (r) {
          setRecipe(r);
          setSaved(true);
        } else setRecipe((cur) => cur ?? getPendingRecipe(id) ?? null);
      })
      .catch(() => live && setRecipe((cur) => cur ?? null));
    return () => {
      live = false;
    };
  }, [id, k.repos]);

  if (recipe === undefined)
    return (
      <Screen>
        <BackHeader title="Recipe" />
        <CardSkeleton label="recipe" height={260} />
      </Screen>
    );
  if (recipe === null)
    return (
      <Screen>
        <BackHeader title="Recipe" />
        <Text>This recipe isn’t available any more.</Text>
        <Button label="Browse recipes" onPress={() => router.replace('/kitchen/recipes')} />
      </Screen>
    );
  return <RecipeBody recipe={recipe} k={k} saved={saved} setSaved={setSaved} />;
}

function RecipeBody({ recipe, k, saved, setSaved }: { recipe: Recipe; k: ReturnType<typeof useKitchen>; saved: boolean; setSaved: (v: boolean) => void }) {
  const { c } = useTheme();
  const f = useFoodColors();
  const [servings, setServings] = useState(recipe.servings);
  const [eaten, setEaten] = useState(1);
  const [meal, setMeal] = useState<Meal>(() => {
    const m = mealForHour(new Date().getHours());
    return recipe.meal.includes(m) ? m : recipe.meal[0];
  });
  const [msg, setMsg] = useState<string | null>(null);
  const [logged, setLogged] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const have = useMemo(() => new Set(k.keys), [k.keys]);
  const cov = coverageFor(recipe, have);
  const factor = servings / recipe.servings;
  const p = recipe.perServing;
  const isAi = recipe.source === 'ai';
  const n = scale(p, eaten);

  const addMissing = async () => {
    let added = 0;
    for (const m of cov.missing) if ((await k.repos.shopping.add(m.name, m.key.startsWith('x-') ? null : m.key).catch(() => null)) !== null) added++;
    setMsg(added ? `Added ${added} item${added === 1 ? '' : 's'} to your shopping list.` : 'Already on your shopping list.');
  };

  const log = async () => {
    if (k.demo) {
      setLogged('Demo mode is on, so meals aren’t saved. Turn off demo mode in Settings to log for real.');
      return;
    }
    setBusy(true);
    try {
      await logFood({
        day: todayKey(),
        meal,
        foodKey: `recipe:${recipe.id}`,
        name: recipe.title,
        servings: eaten,
        grams: null,
        ...n,
        source: isAi ? 'ai' : 'custom',
      });
      setLogged(`Logged ${eaten === 1 ? '1 serving' : `${eaten} servings`} of ${recipe.title} to ${MEAL_LABEL[meal]} — about ${n.kcal} kcal.`);
    } catch {
      setLogged('Couldn’t log that. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <BackHeader title={recipe.title} subtitle={recipe.meal.map((m) => MEAL_LABEL[m]).join(' · ')} />
      <DemoBanner />
      {isAi ? (
        <InfoNote icon={Sparkles} tint={c.sleepSoft} accent={c.sleep}>
          {AI_RECIPE_LABEL}. Check the steps make sense for your kitchen.
        </InfoNote>
      ) : null}

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
        <MetaChip icon={Timer} label={`${recipe.timeMin} min`} />
        <MetaChip icon={Leaf} label={DIET_LABEL_SHORT[recipe.diet]} bg={f.foodSoft} iconColor={f.foodStrong} />
        {recipe.jainOk ? <MetaChip icon={Check} label="Jain-friendly" bg={f.foodSoft} iconColor={f.foodStrong} /> : null}
        {recipe.tags.map((t) => (
          <MetaChip key={t} label={TAG_LABEL[t]} />
        ))}
      </View>

      <Card tint={f.foodSoft}>
        <View
          accessible
          accessibilityLabel={`Per serving: about ${p.kcal} kilocalories, ${p.protein} grams protein, ${p.carbs} grams carbs, ${p.fat} grams fat, ${p.fiber} grams fibre.${isAi ? ' Estimate.' : ''}`}
        >
          <Text variant="label" tone="muted" style={{ textTransform: 'uppercase' }}>
            Per serving{isAi ? ' · estimate' : ''}
          </Text>
          <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: space.xs, marginTop: space.xs }}>
            <Flame size={22} color={f.foodStrong} style={{ marginBottom: 10 }} />
            <Text variant="display">{p.kcal}</Text>
            <Text tone="muted" style={{ marginBottom: 8 }}>
              kcal
            </Text>
          </View>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: space.sm }}>
            <BigStat value={`${Math.round(p.protein)}`} label="protein g" />
            <BigStat value={`${Math.round(p.carbs)}`} label="carbs g" />
            <BigStat value={`${Math.round(p.fat)}`} label="fat g" />
            <BigStat value={`${Math.round(p.fiber * 10) / 10}`} label="fibre g" />
          </View>
        </View>
      </Card>

      <Card>
        <CardHeader
          icon={Carrot}
          label="Ingredients"
          accent={f.food}
          soft={f.foodSoft}
          right={
            <Text variant="caption" tone="muted">
              {cov.missing.length ? `${cov.have.length} of ${cov.required} at home` : 'All at home'}
            </Text>
          }
        />
        <Field label="Servings to cook">
          <Stepper label="Servings to cook" value={servings} onChange={(v) => setServings(Math.max(1, Math.min(12, Math.round(v))))} step={1} min={1} max={12} decimals={0} />
        </Field>
        <View style={{ marginTop: space.sm }}>
          {recipe.ingredients.map((i, idx) => {
            const ing = getIngredient(i.key);
            const basic = !!ing?.basic;
            const ok = basic || isAvailable(i.key, have);
            const status = basic ? 'Pantry basic' : ok ? 'Have' : i.optional ? 'Optional' : 'Need';
            return (
              <View
                key={`${i.key}-${idx}`}
                accessible
                accessibilityLabel={`${ingredientLine(i, factor)}${i.optional ? ', optional' : ''}. ${status}.`}
                style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, minHeight: 40, borderTopWidth: idx ? 1 : 0, borderTopColor: c.line }}
              >
                <View
                  style={{
                    width: 24,
                    height: 24,
                    borderRadius: 12,
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: ok ? f.foodSoft : 'transparent',
                    borderWidth: ok ? 0 : 1.5,
                    borderStyle: ok ? 'solid' : 'dashed',
                    borderColor: c.muted,
                  }}
                >
                  {ok ? <Check size={14} color={f.foodStrong} strokeWidth={3} /> : <Plus size={14} color={c.muted} />}
                </View>
                <Text style={{ flex: 1 }}>
                  {ingredientLine(i, factor)}
                  {i.optional ? <Text tone="muted"> (optional)</Text> : null}
                </Text>
                <Text variant="caption" tone="muted">
                  {status}
                </Text>
              </View>
            );
          })}
        </View>
        {cov.missing.length ? (
          <Button label={`Add ${cov.missing.length} missing to shopping list`} variant="secondary" icon={ShoppingCart} onPress={addMissing} style={{ marginTop: space.md }} />
        ) : null}
        {msg ? (
          <Text variant="caption" accessibilityLiveRegion="polite" style={{ marginTop: space.xs }}>
            {msg}
          </Text>
        ) : null}
      </Card>

      <Card>
        <CardHeader icon={ChefHat} label="Steps" accent={f.food} soft={f.foodSoft} />
        {recipe.steps.map((s, i) => (
          <View key={i} style={{ flexDirection: 'row', gap: space.sm, paddingVertical: 6 }}>
            <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: f.foodSoft, alignItems: 'center', justifyContent: 'center' }}>
              <Text variant="bodyStrong" accessibilityLabel={`Step ${i + 1}`}>
                {i + 1}
              </Text>
            </View>
            <Text style={{ flex: 1 }}>{s}</Text>
          </View>
        ))}
        {recipe.tip ? (
          <View style={{ marginTop: space.sm }}>
            <InfoNote tint={f.foodSoft} accent={f.foodStrong}>
              {recipe.tip}
            </InfoNote>
          </View>
        ) : null}
      </Card>

      <Card>
        <CardHeader icon={Flame} label="Log this meal" accent={c.steps} soft={c.stepsSoft} />
        <Field label="Meal">
          <ChipRow label="Meal">
            {MEALS.map((m) => (
              <ToggleChip key={m} role="radio" label={MEAL_LABEL[m]} selected={meal === m} onPress={() => setMeal(m)} accent={c.steps} soft={c.stepsSoft} />
            ))}
          </ChipRow>
        </Field>
        <View style={{ marginTop: space.sm }}>
          <Field label="Servings you ate" hint={`About ${n.kcal} kcal · ${n.protein} g protein`}>
            <Stepper label="Servings you ate" value={eaten} onChange={(v) => setEaten(Math.max(0.5, Math.min(6, Math.round(v * 2) / 2)))} step={0.5} min={0.5} max={6} decimals={1} />
          </Field>
        </View>
        <Button label="Log this meal" icon={Plus} onPress={log} loading={busy} style={{ marginTop: space.md }} />
        {logged ? (
          <View style={{ marginTop: space.sm, gap: space.xs }}>
            <Text accessibilityLiveRegion="polite">{logged}</Text>
            {!k.demo ? <Button label="See today’s food" variant="ghost" onPress={() => router.push('/food')} /> : null}
          </View>
        ) : null}
      </Card>

      {isAi ? (
        saved ? (
          <Button
            label="Remove from My recipes"
            variant="ghost"
            icon={Trash2}
            onPress={async () => {
              await k.repos.myRecipes.remove(recipe.id);
              setSaved(false);
            }}
          />
        ) : (
          <Button
            label="Save to My recipes"
            variant="secondary"
            icon={BookmarkPlus}
            onPress={async () => {
              await k.repos.myRecipes.save(recipe);
              setSaved(true);
            }}
          />
        )
      ) : null}
      <Text variant="caption" tone="muted">
        {isAi ? 'Nutrition estimated by AI.' : 'Nutrition estimated from IFCT 2017 / USDA food tables for the raw ingredients.'} Not medical or dietetic advice.
      </Text>
    </Screen>
  );
}
