/**
 * Entry card for the Kitchen ("Kitchen — cook healthy with what you have").
 * Used on the Plan tab; can be dropped onto Today as well.
 */
import { router } from 'expo-router';
import { ChefHat, ChevronRight } from 'lucide-react-native';
import React, { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import { Text } from '../../components/ui';
import { RECIPES } from '../../content/recipes';
import type { DietPref } from '../../plan/profile';
import { radius, space } from '../../theme/tokens';
import { useTheme } from '../../theme/useTheme';
import { useKitchenVersion } from '../events';
import { cookNow, rankRecipes } from '../match';
import { pantryKeys } from '../pantry';
import { useKitchenRepos } from '../useKitchen';
import { useFoodColors } from './parts';

export function KitchenEntryCard({ diet }: { diet?: DietPref | null }) {
  const { c } = useTheme();
  const f = useFoodColors();
  const repos = useKitchenRepos();
  const version = useKitchenVersion();
  const [counts, setCounts] = useState<{ items: number; ready: number } | null>(null);

  useEffect(() => {
    let live = true;
    repos.pantry
      .list()
      .then((items) => {
        const keys = pantryKeys(items);
        const ready = keys.length ? cookNow(rankRecipes({ recipes: RECIPES, pantryKeys: keys, diet: diet ?? null }), 99).length : 0;
        if (live) setCounts({ items: items.length, ready });
      })
      .catch(() => live && setCounts(null));
    return () => {
      live = false;
    };
  }, [repos, version, diet]);

  const sub = !counts
    ? 'Add what you have at home and get healthy recipe ideas that fit your plan.'
    : counts.items === 0
      ? 'Add what you have at home and get healthy recipe ideas that fit your plan.'
      : `${counts.items} item${counts.items === 1 ? '' : 's'} in your kitchen · ${counts.ready} recipe${counts.ready === 1 ? '' : 's'} you can cook now`;

  return (
    <Pressable
      onPress={() => router.push('/kitchen')}
      accessibilityRole="button"
      accessibilityLabel={`Kitchen — cook healthy with what you have. ${sub}`}
      android_ripple={{ color: c.line }}
      style={({ pressed }) => ({
        backgroundColor: f.foodSoft,
        borderRadius: radius.card,
        padding: space.md + 4,
        flexDirection: 'row',
        alignItems: 'center',
        gap: space.sm,
        minHeight: 88,
        opacity: pressed ? 0.9 : 1,
      })}
    >
      <View style={{ width: 48, height: 48, borderRadius: 16, backgroundColor: c.surface, alignItems: 'center', justifyContent: 'center' }}>
        <ChefHat size={24} color={f.foodStrong} />
      </View>
      <View style={{ flex: 1 }}>
        <Text variant="label" tone="muted" style={{ textTransform: 'uppercase' }}>
          Kitchen
        </Text>
        <Text variant="bodyStrong">Cook healthy with what you have</Text>
        <Text variant="caption" tone="muted">
          {sub}
        </Text>
      </View>
      <ChevronRight size={22} color={c.ink} />
    </Pressable>
  );
}
