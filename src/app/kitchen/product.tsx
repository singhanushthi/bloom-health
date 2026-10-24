/**
 * New pantry item / packaged product. Prefilled from a barcode scan (Open Food Facts), or empty
 * for a product that wasn't found or one typed by hand.
 */
import { router, useLocalSearchParams } from 'expo-router';
import { Info } from 'lucide-react-native';
import React, { useState } from 'react';
import { DemoBanner } from '../../components/DemoBanner';
import { Screen } from '../../components/Screen';
import { takePendingProduct } from '../../kitchen/handoff';
import type { PantryDraft } from '../../kitchen/pantry';
import { ItemForm } from '../../kitchen/ui/ItemForm';
import { useFoodColors } from '../../kitchen/ui/parts';
import { useKitchenRepos } from '../../kitchen/useKitchen';
import { BackHeader, InfoNote } from '../../plan/ui/parts';

export default function NewProduct() {
  const params = useLocalSearchParams<{ name?: string; from?: string }>();
  const f = useFoodColors();
  const repos = useKitchenRepos();
  // Read the hand-off once, on first render.
  const [pending] = useState(() => (params.from === 'scan' ? takePendingProduct() : null));
  const initial: PantryDraft = pending?.draft ?? { name: params.name ? String(params.name).slice(0, 80) : '', category: 'packaged', source: 'manual' };
  const found = pending?.from === 'off';

  return (
    <Screen>
      <BackHeader title={found ? 'Found it' : 'Add a product'} subtitle={found ? 'From Open Food Facts — check and save' : 'Saved only on this phone'} />
      <DemoBanner />
      {pending?.from === 'not-found' ? (
        <InfoNote icon={Info} tint={f.foodSoft} accent={f.foodStrong}>
          This barcode ({initial.barcode}) isn’t on Open Food Facts yet. Add the details from the packet — the health check works the same.
        </InfoNote>
      ) : null}
      {found ? (
        <InfoNote icon={Info} tint={f.foodSoft} accent={f.foodStrong}>
          Product data © Open Food Facts contributors (open data). Labels can change — have a quick look at the packet.
        </InfoNote>
      ) : null}
      <ItemForm
        initial={initial}
        submitLabel="Save to my kitchen"
        showNutritionInitially={initial.source === 'barcode' || initial.category === 'packaged'}
        onSubmit={async (d) => {
          await repos.pantry.add(d);
          if (router.canGoBack()) router.back();
          else router.replace('/kitchen');
        }}
      />
    </Screen>
  );
}
