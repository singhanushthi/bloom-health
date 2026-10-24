/**
 * Today's food: eaten vs comfortable range, macros, water, and entries by meal (edit/delete).
 */
import { router } from 'expo-router';
import { GlassWater, Plus } from 'lucide-react-native';
import React from 'react';
import { Alert, View } from 'react-native';
import { DemoBanner } from '../../components/DemoBanner';
import { Screen } from '../../components/Screen';
import { Button, Card, CardHeader, CardSkeleton, Text } from '../../components/ui';
import { MEAL_LABEL, MEALS } from '../../db/repos';
import { setWater, removeFood } from '../../plan/actions';
import { usePlan } from '../../plan/usePlan';
import type { PlanState } from '../../plan/data';
import { FoodSummaryCard } from '../../plan/ui/FoodSummary';
import { BackHeader, EntryRow, SmallButton, WaterGlasses } from '../../plan/ui/parts';
import { space } from '../../theme/tokens';
import { useTheme } from '../../theme/useTheme';

export default function FoodToday() {
  const { state, loading } = usePlan();
  return (
    <Screen>
      <BackHeader title="Food" subtitle="Aim around your range — no need to be exact" />
      <DemoBanner />
      {loading && !state ? <CardSkeleton label="food" height={260} /> : state ? <FoodBody state={state} /> : null}
    </Screen>
  );
}

function FoodBody({ state }: { state: PlanState }) {
  const { c } = useTheme();
  const t = state.plan?.targets;
  return (
    <>
      <FoodSummaryCard state={state} />
      <Button label="Add food" icon={Plus} onPress={() => router.push('/food/add')} />

      {MEALS.map((m) => {
        const list = state.food.filter((f) => f.meal === m);
        const kcal = list.reduce((s, f) => s + f.kcal, 0);
        return (
          <Card key={m}>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: list.length ? space.xs : 0 }}>
              <Text variant="heading" accessibilityRole="header" style={{ flex: 1 }}>
                {MEAL_LABEL[m]}
                {list.length ? ` · ${Math.round(kcal)} kcal` : ''}
              </Text>
              <SmallButton label="Add" icon={Plus} accessibilityLabel={`Add food to ${MEAL_LABEL[m]}`} onPress={() => router.push(`/food/add?meal=${m}`)} />
            </View>
            {list.map((f, i) => (
              <EntryRow
                key={f.id}
                first={i === 0}
                title={f.name}
                detail={`${f.grams ? `${Math.round(f.grams)} g` : `${f.servings} serving${f.servings === 1 ? '' : 's'}`} · ${Math.round(f.protein)} g protein`}
                badge={f.source === 'ai' ? 'AI estimate' : f.source === 'custom' ? 'My food' : undefined}
                right={`${Math.round(f.kcal)} kcal`}
                onEdit={f.id > 0 ? () => router.push(`/food/add?id=${f.id}`) : undefined}
                onDelete={
                  f.id > 0
                    ? () =>
                        Alert.alert('Remove this food?', f.name, [
                          { text: 'Cancel', style: 'cancel' },
                          { text: 'Remove', style: 'destructive', onPress: () => void removeFood(f.id) },
                        ])
                    : undefined
                }
              />
            ))}
          </Card>
        );
      })}

      <Card>
        <CardHeader icon={GlassWater} label="Water" accent={c.sleep} soft={c.sleepSoft} />
        <WaterGlasses ml={state.waterMl} goalMl={t?.waterMl ?? 2000} onChange={(ml) => void setWater(state.today, ml)} />
      </Card>
    </>
  );
}
