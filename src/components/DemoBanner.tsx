import { Sparkles } from 'lucide-react-native';
import React from 'react';
import { View } from 'react-native';
import { useAppState } from '../state/AppState';
import { radius, space } from '../theme/tokens';
import { useTheme } from '../theme/useTheme';
import { Text } from './ui';

/** Shown at the top of data screens while demo mode is on, so mock data is never mistaken for real. */
export function DemoBanner() {
  const { demoMode } = useAppState();
  const { c } = useTheme();
  if (!demoMode) return null;
  return (
    <View
      accessible
      accessibilityRole="text"
      accessibilityLabel="Demo mode is on. Showing sample data, not your health data. Turn it off in Settings."
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: space.xs,
        backgroundColor: c.sleepSoft,
        borderRadius: radius.chip,
        paddingHorizontal: space.sm,
        paddingVertical: space.xs,
      }}
    >
      <Sparkles size={16} color={c.sleep} />
      <Text variant="caption" style={{ flex: 1 }}>
        Demo mode — sample data. Turn off in Settings.
      </Text>
    </View>
  );
}
