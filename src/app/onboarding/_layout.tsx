import { Stack } from 'expo-router';
import React from 'react';
import { useTheme } from '../../theme/useTheme';

export default function OnboardingLayout() {
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
