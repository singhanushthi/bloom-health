/**
 * Cycle settings & reminders (also embeddable in Settings via CycleSettingsSection).
 */
import { router } from 'expo-router';
import { ChevronLeft } from 'lucide-react-native';
import React from 'react';
import { View } from 'react-native';
import { Screen } from '../../components/Screen';
import { IconButton, Text } from '../../components/ui';
import { CycleSettingsSection } from '../../cycle/CycleSettingsSection';
import { space } from '../../theme/tokens';

export default function CycleSettingsScreen() {
  return (
    <Screen>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
        <IconButton icon={ChevronLeft} onPress={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)/cycle'))} accessibilityLabel="Back" />
        <Text variant="title" accessibilityRole="header" style={{ flex: 1 }}>
          Cycle settings
        </Text>
      </View>
      <CycleSettingsSection />
    </Screen>
  );
}
