/**
 * "Make me something healthy with my kitchen" (optional, needs the user's Gemini key).
 * Shows exactly what is sent, then opens the generated recipe (labelled as an AI estimate),
 * where it can be saved to My recipes or logged.
 */
import { router } from 'expo-router';
import { Sparkles } from 'lucide-react-native';
import React, { useState } from 'react';
import { View } from 'react-native';
import { useCoach } from '../../ai/CoachState';
import { DemoBanner } from '../../components/DemoBanner';
import { Screen } from '../../components/Screen';
import { ChipRow, Field, ToggleChip } from '../../components/sheets/Sheet';
import { Button, Card, CardHeader, Text } from '../../components/ui';
import { RECIPE_MEAL_LABEL, RECIPE_MEALS, type RecipeMeal } from '../../content/recipes';
import { aiMakeRecipe, AiRecipeError } from '../../kitchen/aiRecipe';
import { putPendingRecipe } from '../../kitchen/handoff';
import { getIngredient } from '../../kitchen/ingredients';
import { mealBudget } from '../../kitchen/match';
import { useKitchen } from '../../kitchen/useKitchen';
import { DIET_LABEL } from '../../plan/profile';
import { BackHeader } from '../../plan/ui/parts';
import { space } from '../../theme/tokens';
import { useTheme } from '../../theme/useTheme';

export default function AiRecipe() {
  const { c } = useTheme();
  const coach = useCoach();
  const k = useKitchen();
  const [meal, setMeal] = useState<RecipeMeal>(k.meal);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Ingredient names only — no brands, barcodes or quantities.
  const names = Array.from(
    new Set(k.pantry.filter((i) => !i.usedUp).map((i) => (i.ingredientKey ? (getIngredient(i.ingredientKey)?.name ?? i.name) : i.name)))
  );
  const budget = k.plan.remainingKcal != null ? mealBudget(k.plan.remainingKcal, meal) : null;

  const make = async () => {
    setBusy(true);
    setError(null);
    try {
      const r = await aiMakeRecipe({ pantryNames: names, diet: k.plan.diet, remainingKcal: budget, remainingProtein: k.plan.remainingProtein, meal });
      putPendingRecipe(r);
      router.push(`/kitchen/recipe/${encodeURIComponent(r.id)}`);
    } catch (e) {
      setError(e instanceof AiRecipeError || e instanceof Error ? e.message : 'Couldn’t make a recipe right now.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <BackHeader title="Make me something" subtitle="AI recipe from your kitchen" />
      <DemoBanner />
      {!coach.hasKey ? (
        <Card>
          <Text>Add your free Gemini key in Settings → AI Coach to use AI recipes. Everything else in the Kitchen works without it.</Text>
          <Button label="Open Settings" variant="secondary" onPress={() => router.push('/settings')} style={{ marginTop: space.sm }} />
        </Card>
      ) : (
        <>
          <Field label="Which meal?">
            <ChipRow label="Which meal?">
              {RECIPE_MEALS.map((m) => (
                <ToggleChip key={m} role="radio" label={RECIPE_MEAL_LABEL[m]} selected={meal === m} onPress={() => setMeal(m)} accent={c.sleep} soft={c.sleepSoft} />
              ))}
            </ChipRow>
          </Field>
          <Card tint={c.sleepSoft}>
            <CardHeader icon={Sparkles} label="What Bloom will send to Google" accent={c.sleep} soft={c.surface} />
            <View style={{ gap: 4 }}>
              <Text>
                <Text variant="bodyStrong">Ingredients: </Text>
                {names.length ? names.join(', ') : 'none yet'}
              </Text>
              <Text>
                <Text variant="bodyStrong">Food preference: </Text>
                {k.plan.diet ? DIET_LABEL[k.plan.diet] : 'not set'}
              </Text>
              {budget != null ? (
                <Text>
                  <Text variant="bodyStrong">Room for this meal: </Text>~{budget} kcal
                  {k.plan.remainingProtein != null && k.plan.remainingProtein > 0 ? ` · ${k.plan.remainingProtein} g protein to go today` : ''}
                </Text>
              ) : null}
            </View>
            <Text variant="caption" tone="muted" style={{ marginTop: space.sm }}>
              Only what’s listed above is sent — no brands, barcodes or other health data. The recipe’s nutrition is an AI estimate.
            </Text>
          </Card>
          <Button label="Make a healthy recipe" icon={Sparkles} onPress={make} loading={busy} disabled={!names.length} />
          {!names.length ? <Text tone="muted">Add a few items to your kitchen first.</Text> : null}
          {error ? (
            <Text tone="danger" accessibilityLiveRegion="polite">
              {error}
            </Text>
          ) : null}
        </>
      )}
    </Screen>
  );
}
