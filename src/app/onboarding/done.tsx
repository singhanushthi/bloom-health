/**
 * Onboarding 4/4: done.
 */
import { router } from 'expo-router';
import { CalendarHeart, CircleCheck, Sparkles } from 'lucide-react-native';
import React from 'react';
import { View } from 'react-native';
import { Screen } from '../../components/Screen';
import { Button, Card, Text } from '../../components/ui';
import { useAppState } from '../../state/AppState';
import { space } from '../../theme/tokens';
import { useTheme } from '../../theme/useTheme';

export default function Done() {
  const { c } = useTheme();
  const { completeOnboarding } = useAppState();
  const go = async () => {
    await completeOnboarding();
    router.replace('/(tabs)');
  };
  return (
    <Screen contentStyle={{ flexGrow: 1, justifyContent: 'space-between' }}>
      <View style={{ gap: space.lg, marginTop: space.xl }}>
        <CircleCheck size={48} color={c.spo2} />
        <View style={{ gap: space.xs }}>
          <Text variant="label" tone="muted">
            STEP 3 OF 3
          </Text>
          <Text variant="title" accessibilityRole="header">
            You’re all set
          </Text>
          <Text tone="muted">Here’s how to get the most out of Bloom:</Text>
        </View>
        <Card>
          <View style={{ gap: space.sm }}>
            <View style={{ flexDirection: 'row', gap: space.sm }}>
              <CalendarHeart size={20} color={c.cycle} />
              <Text style={{ flex: 1 }}>Tap the “Log” button on Today to add a period, a day log, sleep or a reading.</Text>
            </View>
            <View style={{ flexDirection: 'row', gap: space.sm }}>
              <Sparkles size={20} color={c.sleep} />
              <Text style={{ flex: 1 }}>Optional: add your free Gemini key in Settings → AI Coach to ask questions about your data.</Text>
            </View>
          </View>
        </Card>
      </View>
      <Button label="Go to Today" onPress={go} />
    </Screen>
  );
}
