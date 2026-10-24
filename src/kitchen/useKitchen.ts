/**
 * Kitchen data for screens: pantry, shopping list, my recipes, plan context and ranked matches.
 * Re-reads on any kitchen write, plan change or demo toggle.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { RECIPES, type Recipe } from '../content/recipes';
import { getCycleStatus } from '../health/cycle';
import type { DietPref } from '../plan/profile';
import { usePlan } from '../plan/usePlan';
import { useAppState } from '../state/AppState';
import { demoKitchen } from './demo';
import { useKitchenVersion } from './events';
import { almostThere, cookNow, mealForHour, rankRecipes, type RecipeMatch } from './match';
import { pantryKeys, sqlKitchen, type KitchenRepos, type PantryItem, type ShoppingItem } from './pantry';
import type { RecipeMeal } from '../content/recipes';

export function useKitchenRepos(): KitchenRepos {
  const { demoMode } = useAppState();
  return demoMode ? demoKitchen() : sqlKitchen;
}

export interface PlanContext {
  diet: DietPref | null;
  remainingKcal: number | null;
  remainingProtein: number | null;
  proteinTarget: number | null;
}

export interface KitchenState {
  loading: boolean;
  error: string | null;
  demo: boolean;
  repos: KitchenRepos;
  pantry: PantryItem[];
  keys: string[];
  shopping: ShoppingItem[];
  myRecipes: Recipe[];
  plan: PlanContext;
  onPeriod: boolean;
  meal: RecipeMeal;
  matches: RecipeMatch[];
  cookNow: RecipeMatch[];
  almostThere: RecipeMatch[];
  reload: () => Promise<void>;
}

export function useKitchen(): KitchenState {
  const { demoMode, ctx, tracks, ready } = useAppState();
  const repos = useKitchenRepos();
  const version = useKitchenVersion();
  const { state: planState } = usePlan();
  const [pantry, setPantry] = useState<PantryItem[]>([]);
  const [shopping, setShopping] = useState<ShoppingItem[]>([]);
  const [myRecipes, setMyRecipes] = useState<Recipe[]>([]);
  const [onPeriod, setOnPeriod] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const seq = useRef(0);
  const cycleTracked = tracks.includes('cycle');

  const reload = useCallback(async () => {
    const id = ++seq.current;
    try {
      const [p, s, m] = await Promise.all([repos.pantry.list(), repos.shopping.list(), repos.myRecipes.list()]);
      if (id !== seq.current) return;
      setPantry(p);
      setShopping(s);
      setMyRecipes(m);
      setError(null);
    } catch {
      if (id === seq.current) setError('Couldn’t open your kitchen. Please try again.');
    } finally {
      if (id === seq.current) setLoading(false);
    }
  }, [repos]);

  useEffect(() => {
    reload();
  }, [reload, version]);

  useEffect(() => {
    if (!ready || !cycleTracked) {
      setOnPeriod(false);
      return;
    }
    let live = true;
    getCycleStatus({ ...ctx, now: new Date() })
      .then((r) => live && setOnPeriod(!!r.data?.hasData && r.data.phase === 'menstrual'))
      .catch(() => live && setOnPeriod(false));
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, cycleTracked, ctx.mode, ctx.availability, ctx.granted]);

  const plan = useMemo<PlanContext>(() => {
    const t = planState?.plan?.targets ?? null;
    const a = planState?.allowance ?? null;
    return {
      diet: planState?.profile?.diet ?? null,
      remainingKcal: a && planState ? Math.round(a.kcal - planState.totals.kcal) : null,
      remainingProtein: t && planState ? Math.round(t.proteinG - planState.totals.protein) : null,
      proteinTarget: t?.proteinG ?? null,
    };
  }, [planState]);

  const hour = new Date().getHours();
  const keys = useMemo(() => pantryKeys(pantry), [pantry]);
  const matches = useMemo(
    () =>
      rankRecipes({
        recipes: RECIPES,
        pantryKeys: keys,
        diet: plan.diet,
        hour,
        remainingKcal: plan.remainingKcal,
        remainingProtein: plan.remainingProtein,
        proteinTarget: plan.proteinTarget,
        onPeriod,
      }),
    [keys, plan, hour, onPeriod]
  );

  return {
    loading,
    error,
    demo: demoMode,
    repos,
    pantry,
    keys,
    shopping,
    myRecipes,
    plan,
    onPeriod,
    meal: mealForHour(hour),
    matches,
    cookNow: keys.length ? cookNow(matches, 5) : [],
    almostThere: keys.length ? almostThere(matches, 5) : [],
    reload,
  };
}
