/**
 * "Set up my plan" card, used on Plan (full) and Today (compact). Today's weight, food and
 * activity numbers now live in the glance tiles (src/components/today.tsx).
 */
import { router } from 'expo-router';
import { ArrowRight, Target } from 'lucide-react-native';
import React from 'react';
import { View } from 'react-native';
import { Button, Card, CardHeader, Text, TextButton } from '../../components/ui';
import { space } from '../../theme/tokens';
import { useTheme } from '../../theme/useTheme';

export function PlanSetupCard({ compact = false }: { compact?: boolean } = {}) {
  const { c } = useTheme();
  if (compact) {
    return (
      <Card tint={c.cycleSoft}>
        <Text tone="muted">Set a gentle goal for a comfortable daily range, protein and water.</Text>
        <TextButton label="Set up my plan" icon={ArrowRight} onPress={() => router.push('/onboarding/profile')} style={{ marginTop: space.xxs }} />
      </Card>
    );
  }
  return (
    <Card tint={c.cycleSoft}>
      <View accessible accessibilityLabel="Your plan. Set a goal to get a gentle daily calorie range, protein and water targets.">
        <CardHeader icon={Target} label="Your plan" accent={c.cycle} soft={c.surface} />
        <Text variant="bodyStrong">Set a gentle goal</Text>
        <Text tone="muted" style={{ marginTop: 2 }}>
          A comfortable daily range, protein and water — with room for treats.
        </Text>
      </View>
      <Button label="Set up my plan" icon={ArrowRight} onPress={() => router.push('/onboarding/profile')} style={{ marginTop: space.md }} />
    </Card>
  );
}
