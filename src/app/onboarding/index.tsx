/**
 * Onboarding 1/4: welcome. Bloom works on its own — no other app is needed.
 */
import { router } from 'expo-router';
import { Flower2, ShieldCheck, Sparkles } from 'lucide-react-native';
import React from 'react';
import { View } from 'react-native';
import { Screen } from '../../components/Screen';
import { Button, Text } from '../../components/ui';
import { useAppState } from '../../state/AppState';
import { space } from '../../theme/tokens';
import { useTheme } from '../../theme/useTheme';

export default function Welcome() {
  const { c } = useTheme();
  const { setDemoMode, completeOnboarding } = useAppState();

  const startDemo = async () => {
    await setDemoMode(true);
    await completeOnboarding();
    router.replace('/(tabs)');
  };

  return (
    <Screen contentStyle={{ flexGrow: 1, justifyContent: 'space-between' }}>
      <View style={{ gap: space.lg }}>
        <View
          importantForAccessibility="no-hide-descendants"
          style={{
            width: 72,
            height: 72,
            borderRadius: 24,
            backgroundColor: c.cycleSoft,
            alignItems: 'center',
            justifyContent: 'center',
            marginTop: space.xl,
          }}
        >
          <Flower2 size={38} color={c.cycle} />
        </View>
        <View style={{ gap: space.xs }}>
          <Text variant="hero" accessibilityRole="header">
            Bloom
          </Text>
          <Text tone="muted">
            Your cycle, steps, sleep and heart in one calm place. Log things yourself, let your phone count steps, and
            connect a watch or other apps only if you want to.
          </Text>
        </View>
        <View style={{ flexDirection: 'row', gap: space.sm, alignItems: 'center' }}>
          <ShieldCheck size={20} color={c.spo2} />
          <Text variant="caption" tone="muted" style={{ flex: 1 }}>
            Everything stays on this phone. No account, no cloud, no analytics.
          </Text>
        </View>
      </View>

      <View style={{ gap: space.sm }}>
        <Button label="Get started" onPress={() => router.push('/onboarding/track')} />
        <Button
          label="Explore with demo data"
          variant="ghost"
          icon={Sparkles}
          onPress={startDemo}
          accessibilityHint="Fills Bloom with sample data. You can turn this off in Settings."
        />
      </View>
    </Screen>
  );
}
