/**
 * Smoke tests: render each screen and check key content appears.
 * Catches runtime errors (bad imports, undefined access) that `tsc` can't.
 * - Demo mode: every data screen with mock data.
 * Today has its own suite (__tests__/today.test.tsx).
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { fireEvent, render, screen } from '@testing-library/react-native';
import React from 'react';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

jest.mock('expo-router', () => ({
  router: { push: jest.fn(), replace: jest.fn(), back: jest.fn(), canGoBack: () => true },
  useFocusEffect: jest.fn(),
  Redirect: () => null,
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
  SafeAreaProvider: ({ children }: { children: React.ReactNode }) => children,
}));

jest.mock('expo-secure-store', () => {
  const store = new Map<string, string>();
  return {
    getItemAsync: async (k: string) => store.get(k) ?? null,
    setItemAsync: async (k: string, v: string) => void store.set(k, v),
    deleteItemAsync: async (k: string) => void store.delete(k),
  };
});

import { setDriver } from '../src/db/driver';
import { memoryDriver } from '../test-utils/memoryDriver';
import { CoachProvider } from '../src/ai/CoachState';
import { LogSheetsProvider } from '../src/components/sheets/LogSheets';
import { StepSensorProvider } from '../src/sensors/StepSensor';
import { AppStateProvider } from '../src/state/AppState';
import Trends from '../src/app/(tabs)/trends';
import Cycle from '../src/app/(tabs)/cycle';
import Coach from '../src/app/coach';
import Welcome from '../src/app/onboarding/index';
import Track from '../src/app/onboarding/track';
import Connect from '../src/app/onboarding/connect';

jest.setTimeout(30000);
const find = { timeout: 8000 };

const wrap = (el: React.ReactElement) => (
  <AppStateProvider>
    <StepSensorProvider>
      <CoachProvider>
        <LogSheetsProvider>{el}</LogSheetsProvider>
      </CoachProvider>
    </StepSensorProvider>
  </AppStateProvider>
);

const setSettings = (demo: boolean) =>
  AsyncStorage.setItem(
    'bloom.settings.v1',
    JSON.stringify({ demoMode: demo, onboarded: true, stepGoal: 8000, historyRequested: false })
  );

beforeEach(async () => {
  setDriver(memoryDriver());
  await setSettings(true);
});

describe('demo mode', () => {
  it('renders Trends with demo data', async () => {
    await render(wrap(<Trends />));
    expect(await screen.findByText(/daily average/, {}, find)).toBeTruthy();
    expect(await screen.findByText(/average asleep/, {}, find)).toBeTruthy();
  });

  it('renders Cycle with demo data', async () => {
    await render(wrap(<Cycle />));
    expect(await screen.findByText(/Cycle history/i, {}, find)).toBeTruthy();
    expect(await screen.findByText(/Predicted \(estimate\)/, {}, find)).toBeTruthy();
    expect(await screen.findByText(/Tap a day to log/, {}, find)).toBeTruthy();
  });

  // Settings (hub + pages) is covered in __tests__/settings.screens.test.tsx.

  it('shows the key-setup state on the Coach screen without a key', async () => {
    await render(wrap(<Coach />));
    expect(await screen.findByText(/Turn on the AI coach/, {}, find)).toBeTruthy();
    expect(screen.getByText(/sent to Google to answer/)).toBeTruthy();
  });
});


describe('onboarding', () => {
  it('welcome → track → connect render', async () => {
    await render(wrap(<Welcome />));
    expect(await screen.findByText('Get started', {}, find)).toBeTruthy();
    await render(wrap(<Track />));
    expect(await screen.findByText(/What would you like to track/, {}, find)).toBeTruthy();
    await render(wrap(<Connect />));
    expect(await screen.findByText(/Connect Health Connect for all-day steps/, {}, find)).toBeTruthy();
    expect(screen.getByText('Skip for now')).toBeTruthy();
  });
});
