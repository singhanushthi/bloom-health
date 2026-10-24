/**
 * Settings stack: the hub (/settings) and one page per section. Lives outside the tab navigator
 * on purpose — see src/app/(tabs)/_layout.tsx.
 */
import { Stack } from 'expo-router';
import React from 'react';
import { useTheme } from '../../theme/useTheme';

export default function SettingsLayout() {
  const { c } = useTheme();
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: c.bg },
        animation: 'slide_from_right',
      }}
    />
  );
}
