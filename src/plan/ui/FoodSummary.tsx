/**
 * Food summary card: eaten vs comfortable range (ring), friendly status, macro bars with numbers.
 */
import { Utensils } from 'lucide-react-native';
import React from 'react';
import { View } from 'react-native';
import { Ring } from '../../components/charts';
import { Card, CardHeader, Text } from '../../components/ui';
import { space } from '../../theme/tokens';
import { useTheme } from '../../theme/useTheme';
import type { PlanState } from '../data';
import { intakeStatus } from '../engine';
import { MacroBar } from './parts';

export function FoodSummaryCard({ state, compact }: { state: PlanState; compact?: boolean }) {
  const { c } = useTheme();
  const a = state.allowance;
  const t = state.plan?.targets;
  const eaten = state.totals.kcal;
  const status = a ? intakeStatus(eaten, a.min, a.max) : null;
  const remaining = a ? Math.max(0, a.kcal - eaten) : null;
  const carbsT = t ? Math.round((t.kcal * 0.5) / 4) : 0;
  const fatT = t ? Math.round((t.kcal * 0.3) / 9) : 0;
  const label = a
    ? `Eaten ${eaten} kilocalories. Comfortable range ${a.min} to ${a.max}. ${remaining} remaining. ${status?.text ?? ''}`
    : `Eaten ${eaten} kilocalories today.`;
  return (
    <Card>
      <View accessible accessibilityLabel={label}>
        <CardHeader icon={Utensils} label="Today’s food" accent={c.steps} soft={c.stepsSoft} />
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.lg }}>
          {a ? (
            <Ring value={eaten} goal={a.kcal} size={compact ? 104 : 124} color={c.steps} track={c.stepsSoft} accessibilityLabel={label}>
              <Text variant="caption" tone="muted">
                {remaining} left
              </Text>
            </Ring>
          ) : null}
          <View style={{ flex: 1 }}>
            <Text variant="display">{eaten.toLocaleString()}</Text>
            <Text variant="caption" tone="muted">
              {a ? `kcal eaten · aim around ${a.min.toLocaleString()}–${a.max.toLocaleString()}` : 'kcal eaten'}
            </Text>
            {state.exerciseKcal > 0 && a ? (
              <Text variant="caption" tone="muted">
                Includes +{Math.round(state.exerciseKcal / 2)} kcal from today’s workouts
              </Text>
            ) : null}
          </View>
        </View>
        {status ? (
          <Text style={{ marginTop: space.sm }} accessibilityLiveRegion="polite">
            {status.text}
          </Text>
        ) : null}
      </View>
      {t && !compact ? (
        <View style={{ gap: space.sm, marginTop: space.md }}>
          <MacroBar label="Protein" value={state.totals.protein} target={t.proteinG} unit="g" color={c.cycle} soft={c.cycleSoft} />
          <MacroBar label="Carbs" value={state.totals.carbs} target={carbsT} unit="g" color={c.steps} soft={c.stepsSoft} />
          <MacroBar label="Fat" value={state.totals.fat} target={fatT} unit="g" color={c.sleep} soft={c.sleepSoft} />
          <MacroBar label="Fibre" value={state.totals.fiber} target={t.fibreG} unit="g" color={c.spo2} soft={c.spo2Soft} />
        </View>
      ) : null}
    </Card>
  );
}

