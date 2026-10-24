/**
 * Browse all recipes with filters: meal, my diet, tags, quick (≤ 20 min) and a text search.
 * Each card shows what's missing from the kitchen.
 */
import React, { useMemo, useState } from 'react';
import { View } from 'react-native';
import { DemoBanner } from '../../components/DemoBanner';
import { Screen } from '../../components/Screen';
import { ChipRow, Field, Input, ToggleChip } from '../../components/sheets/Sheet';
import { Text } from '../../components/ui';
import { RECIPE_MEAL_LABEL, RECIPE_MEALS, RECIPES, TAG_LABEL, type RecipeMeal, type RecipeTag } from '../../content/recipes';
import { rankRecipes } from '../../kitchen/match';
import { normalizeText } from '../../kitchen/parse';
import { RecipeCard, useFoodColors } from '../../kitchen/ui/parts';
import { useKitchen } from '../../kitchen/useKitchen';
import { DIET_LABEL } from '../../plan/profile';
import { BackHeader } from '../../plan/ui/parts';
import { space } from '../../theme/tokens';

const FILTER_TAGS: RecipeTag[] = ['high-protein', 'high-fibre', 'low-oil', 'iron-rich', 'period-comfort', 'gut-friendly', 'calcium-rich', 'light'];

export default function BrowseRecipes() {
  const f = useFoodColors();
  const k = useKitchen();
  const [meal, setMeal] = useState<RecipeMeal | null>(null);
  const [myDiet, setMyDiet] = useState(true);
  const [quick, setQuick] = useState(false);
  const [tags, setTags] = useState<Set<RecipeTag>>(new Set());
  const [q, setQ] = useState('');

  const list = useMemo(() => {
    const ranked = rankRecipes({
      recipes: RECIPES,
      pantryKeys: k.keys,
      diet: myDiet ? k.plan.diet : null,
      meal,
      remainingKcal: k.plan.remainingKcal,
      remainingProtein: k.plan.remainingProtein,
      proteinTarget: k.plan.proteinTarget,
      onPeriod: k.onPeriod,
      hour: meal ? null : new Date().getHours(),
    });
    const nq = normalizeText(q);
    return ranked.filter(
      (m) =>
        (!quick || m.recipe.timeMin <= 20) &&
        Array.from(tags).every((t) => m.recipe.tags.includes(t)) &&
        (!nq || normalizeText(m.recipe.title).includes(nq) || m.recipe.ingredients.some((i) => i.key.includes(nq)))
    );
  }, [k.keys, k.plan, k.onPeriod, meal, myDiet, quick, tags, q]);

  const toggleTag = (t: RecipeTag) =>
    setTags((p) => {
      const n = new Set(p);
      if (n.has(t)) n.delete(t);
      else n.add(t);
      return n;
    });

  return (
    <Screen>
      <BackHeader title="All recipes" subtitle={`${RECIPES.length} healthy home recipes`} />
      <DemoBanner />
      <Field label="Search recipes">
        <Input value={q} onChangeText={setQ} maxLength={40} accessibilityLabel="Search recipes" returnKeyType="search" />
      </Field>
      <Field label="Meal">
        <ChipRow label="Meal">
          <ToggleChip role="radio" label="Any" selected={meal === null} onPress={() => setMeal(null)} accent={f.foodStrong} soft={f.foodSoft} />
          {RECIPE_MEALS.map((m) => (
            <ToggleChip key={m} role="radio" label={RECIPE_MEAL_LABEL[m]} selected={meal === m} onPress={() => setMeal(m)} accent={f.foodStrong} soft={f.foodSoft} />
          ))}
        </ChipRow>
      </Field>
      <Field label="Filters">
        <ChipRow label="Filters">
          {k.plan.diet ? (
            <ToggleChip label={`Only ${DIET_LABEL[k.plan.diet].toLowerCase()}`} selected={myDiet} onPress={() => setMyDiet((v) => !v)} accent={f.foodStrong} soft={f.foodSoft} />
          ) : null}
          <ToggleChip label="20 min or less" selected={quick} onPress={() => setQuick((v) => !v)} accent={f.foodStrong} soft={f.foodSoft} />
          {FILTER_TAGS.map((t) => (
            <ToggleChip key={t} label={TAG_LABEL[t]} selected={tags.has(t)} onPress={() => toggleTag(t)} accent={f.foodStrong} soft={f.foodSoft} />
          ))}
        </ChipRow>
      </Field>
      <Text accessibilityLiveRegion="polite" tone="muted">
        {list.length} recipe{list.length === 1 ? '' : 's'}
      </Text>
      <View style={{ gap: space.sm }}>
        {list.map((m) => (
          <RecipeCard key={m.recipe.id} recipe={m.recipe} match={m} showPantry={k.keys.length > 0} />
        ))}
      </View>
      {!list.length ? <Text>No recipes match those filters — try removing one.</Text> : null}
    </Screen>
  );
}
