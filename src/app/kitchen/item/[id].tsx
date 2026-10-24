/**
 * One pantry item: health check (packaged), edit quantity / use-by / label, mark used up, delete.
 */
import { router, useLocalSearchParams } from 'expo-router';
import { RotateCcw, Trash2 } from 'lucide-react-native';
import React, { useEffect, useState } from 'react';
import { Alert, View } from 'react-native';
import { DemoBanner } from '../../../components/DemoBanner';
import { Screen } from '../../../components/Screen';
import { Button, CardSkeleton, Text } from '../../../components/ui';
import { todayKey } from '../../../health/dates';
import { healthCheck } from '../../../kitchen/healthCheck';
import { CATEGORY_LABEL } from '../../../kitchen/ingredients';
import type { PantryItem } from '../../../kitchen/pantry';
import { ItemForm } from '../../../kitchen/ui/ItemForm';
import { ExpiryChip, HealthCheckCard, MetaChip } from '../../../kitchen/ui/parts';
import { useKitchenRepos } from '../../../kitchen/useKitchen';
import { BackHeader } from '../../../plan/ui/parts';
import { space } from '../../../theme/tokens';

export default function PantryItemScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const repos = useKitchenRepos();
  const [item, setItem] = useState<PantryItem | null | undefined>(undefined);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    const n = Number(id);
    if (!Number.isFinite(n)) {
      setItem(null);
      return;
    }
    repos.pantry
      .get(n)
      .then(setItem)
      .catch(() => setItem(null));
  }, [id, repos]);

  const back = () => (router.canGoBack() ? router.back() : router.replace('/kitchen'));

  if (item === undefined)
    return (
      <Screen>
        <BackHeader title="Item" />
        <CardSkeleton label="item" height={200} />
      </Screen>
    );
  if (item === null)
    return (
      <Screen>
        <BackHeader title="Item" />
        <Text>This item isn’t in your kitchen any more.</Text>
        <Button label="Back to kitchen" onPress={() => router.replace('/kitchen')} />
      </Screen>
    );

  const check = item.nutritionPer100g ? healthCheck(item.nutritionPer100g, item.nutriscore) : null;
  return (
    <Screen>
      <BackHeader title={item.name} subtitle={[item.brand, CATEGORY_LABEL[item.category]].filter(Boolean).join(' · ')} />
      <DemoBanner />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
        <ExpiryChip item={item} today={todayKey()} />
        {item.usedUp ? <MetaChip label="Used up" /> : null}
        {item.source === 'barcode' ? <MetaChip label={`Scanned · ${item.barcode ?? ''}`} /> : null}
      </View>
      {check ? <HealthCheckCard check={check} /> : null}
      {msg ? (
        <Text accessibilityLiveRegion="polite" variant="bodyStrong">
          {msg}
        </Text>
      ) : null}
      <ItemForm
        initial={item}
        submitLabel="Save changes"
        onSubmit={async (d) => {
          await repos.pantry.update(item.id, { ...d, ingredientKey: d.ingredientKey ?? null });
          setMsg('Saved.');
          back();
        }}
      />
      <View style={{ flexDirection: 'row', gap: space.xs, flexWrap: 'wrap' }}>
        <Button
          label={item.usedUp ? 'Back in stock' : 'Mark used up'}
          variant="secondary"
          icon={RotateCcw}
          onPress={async () => {
            await repos.pantry.setUsedUp(item.id, !item.usedUp);
            back();
          }}
          style={{ flexGrow: 1 }}
        />
        <Button
          label="Delete"
          variant="ghost"
          icon={Trash2}
          accessibilityLabel={`Delete ${item.name}`}
          onPress={() =>
            Alert.alert('Delete this item?', `${item.name} will be removed from your kitchen.`, [
              { text: 'Cancel', style: 'cancel' },
              {
                text: 'Delete',
                style: 'destructive',
                onPress: async () => {
                  await repos.pantry.remove(item.id);
                  back();
                },
              },
            ])
          }
        />
      </View>
    </Screen>
  );
}
