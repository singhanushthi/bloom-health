/**
 * Smoke tests: render each screen and check key content appears.
 * Catches runtime errors (bad imports, undefined access) that `tsc` can't.
 * - Demo mode: every data screen with mock data.
 * - Standalone (live, no Health Connect, empty local DB): Today shows logging actions.
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
import Today from '../src/app/(tabs)/index';
import Trends from '../src/app/(tabs)/trends';
import Cycle from '../src/app/(tabs)/cycle';
import Settings from '../src/app/(tabs)/settings';
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
  it('renders Today with demo data, sources, Ask Bloom and the Log button', async () => {
    await render(wrap(<Today />));
    expect(await screen.findByText(/Demo mode/, {}, find)).toBeTruthy();
    expect(await screen.findByText("Today in your cycle", {}, find)).toBeTruthy();
    expect(await screen.findByText(/^Day \d+$/, {}, find)).toBeTruthy();
    expect(await screen.findByText(/steps · goal 8,000/, {}, find)).toBeTruthy();
    expect(await screen.findByText(/bpm resting/, {}, find)).toBeTruthy();
    expect((await screen.findAllByText(/Source: /, {}, find)).length).toBeGreaterThan(3);
    expect(screen.getByText('Ask Bloom')).toBeTruthy();
    expect(screen.getByLabelText('Log')).toBeTruthy();
  });

  it('opens the Log action sheet', async () => {
    await render(wrap(<Today />));
    fireEvent.press(await screen.findByLabelText('Log', {}, find));
    expect(await screen.findByLabelText('Period', {}, find)).toBeTruthy();
    expect(screen.getByLabelText('Day log')).toBeTruthy();
    expect(screen.getByLabelText('Sleep')).toBeTruthy();
    expect(screen.getByLabelText('Reading')).toBeTruthy();
    fireEvent.press(screen.getByLabelText('Reading'));
    expect(await screen.findByText('Save reading', {}, find)).toBeTruthy();
    fireEvent.press(screen.getByText('Save reading'));
    expect(await screen.findByText('Enter a number.', {}, find)).toBeTruthy();
  });

  it('FAB "Day log" opens the cycle day log with the extra fields', async () => {
    await render(wrap(<Today />));
    fireEvent.press(await screen.findByLabelText('Log', {}, find));
    fireEvent.press(await screen.findByLabelText('Day log', {}, find));
    expect(await screen.findByText('Pain level', {}, find)).toBeTruthy();
    expect(screen.getByText('Pills or medication')).toBeTruthy();
    expect(screen.getByText('Save day')).toBeTruthy();
  });

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

  it('renders Settings with AI Coach, connected apps and data controls', async () => {
    await render(wrap(<Settings />));
    expect(await screen.findByText(/Your data stays on this phone/, {}, find)).toBeTruthy();
    expect(await screen.findByText('AI Coach', {}, find)).toBeTruthy();
    expect(screen.getByLabelText('Gemini API key')).toBeTruthy();
    expect(screen.getByText(/Connected apps \(optional\)/i)).toBeTruthy();
    expect(screen.getByText(/Sync Fit with Health Connect/)).toBeTruthy();
    expect(screen.getByText('Export as JSON')).toBeTruthy();
    expect(screen.getByText('Delete all my data')).toBeTruthy();
  });

  it('shows the key-setup state on the Coach screen without a key', async () => {
    await render(wrap(<Coach />));
    expect(await screen.findByText(/Turn on the AI coach/, {}, find)).toBeTruthy();
    expect(screen.getByText(/sent to Google to answer/)).toBeTruthy();
  });
});

describe('standalone (no Health Connect, nothing logged)', () => {
  beforeEach(() => setSettings(false));

  it('Today offers logging actions instead of asking for other apps', async () => {
    await render(wrap(<Today />));
    expect(await screen.findByText(/No period logged yet/, {}, find)).toBeTruthy();
    expect(await screen.findByText("Edit today's steps", {}, find)).toBeTruthy();
    expect(await screen.findByText('Log sleep', {}, find)).toBeTruthy();
    expect((await screen.findAllByText('Add reading', {}, find)).length).toBe(2);
    expect(screen.getAllByText(/Connect a watch in Settings for automatic readings/).length).toBe(2);
    expect(screen.queryByText(/NoiseFit/)).toBeNull();
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
