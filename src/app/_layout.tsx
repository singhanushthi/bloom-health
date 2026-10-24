import { InstrumentSerif_400Regular, InstrumentSerif_400Regular_Italic } from '@expo-google-fonts/instrument-serif';
import {
  Manrope_400Regular,
  Manrope_500Medium,
  Manrope_600SemiBold,
  Manrope_700Bold,
} from '@expo-google-fonts/manrope';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import * as SystemUI from 'expo-system-ui';
import React, { useEffect } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { CoachProvider } from '../ai/CoachState';
import { LogSheetsProvider } from '../components/sheets/LogSheets';
import { CycleReminderSync } from '../notify/ReminderSync';
import { StepSensorProvider } from '../sensors/StepSensor';
import { AppStateProvider, useAppState } from '../state/AppState';
import { useTheme } from '../theme/useTheme';
import { initWatchIfPaired } from '../watch/controller';

SplashScreen.preventAutoHideAsync().catch(() => {});

function Root() {
  const { c, scheme } = useTheme();
  const { ready } = useAppState();
  const [fontsLoaded, fontError] = useFonts({
    InstrumentSerif_400Regular,
    InstrumentSerif_400Regular_Italic,
    Manrope_400Regular,
    Manrope_500Medium,
    Manrope_600SemiBold,
    Manrope_700Bold,
  });

  useEffect(() => {
    SystemUI.setBackgroundColorAsync(c.bg).catch(() => {});
  }, [c.bg]);

  // Reconnect a directly paired watch. No-op (no Bluetooth touched) when none was paired.
  useEffect(() => {
    if (ready) void initWatchIfPaired();
  }, [ready]);

  const done = (fontsLoaded || !!fontError) && ready;
  useEffect(() => {
    if (done) SplashScreen.hideAsync().catch(() => {});
  }, [done]);

  if (!done) return null;

  return (
    <>
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
      <CycleReminderSync />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: c.bg },
          animation: 'fade',
        }}
      >
        <Stack.Screen name="index" />
        <Stack.Screen name="onboarding" />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="coach" options={{ animation: 'slide_from_right' }} />
        {/* Settings hub + sub-pages (own stack). Back from the hub returns to Today. */}
        <Stack.Screen name="settings" options={{ headerShown: false, animation: 'slide_from_right' }} />
      </Stack>
    </>
  );
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <AppStateProvider>
        <StepSensorProvider>
          <CoachProvider>
            <LogSheetsProvider>
              <Root />
            </LogSheetsProvider>
          </CoachProvider>
        </StepSensorProvider>
      </AppStateProvider>
    </SafeAreaProvider>
  );
}
