/**
 * Connect-your-apps screen still renders, with the new direct-watch entry points.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { fireEvent, render, screen } from '@testing-library/react-native';
import React from 'react';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  router: { push: (...a: unknown[]) => mockPush(...a), replace: jest.fn(), back: jest.fn(), canGoBack: () => true },
  useFocusEffect: jest.fn(),
  Redirect: () => null,
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
  SafeAreaProvider: ({ children }: { children: React.ReactNode }) => children,
}));

import { setDriver } from '../src/db/driver';
import { AppStateProvider } from '../src/state/AppState';
import ConnectApps from '../src/app/connect';
import { memoryDriver } from '../test-utils/memoryDriver';

jest.setTimeout(30000);
const find = { timeout: 8000 };

beforeEach(async () => {
  mockPush.mockClear();
  setDriver(memoryDriver());
  await AsyncStorage.setItem(
    'bloom.settings.v1',
    JSON.stringify({ demoMode: false, onboarded: true, stepGoal: 8000, historyRequested: false })
  );
});

it('renders the apps list plus the direct-watch card', async () => {
  await render(
    <AppStateProvider>
      <ConnectApps />
    </AppStateProvider>
  );
  expect(await screen.findByText('Connect your apps', {}, find)).toBeTruthy();
  expect(await screen.findByText('Noise watch', {}, find)).toBeTruthy();
  expect(screen.getByText('Flo')).toBeTruthy();
  await fireEvent.press(screen.getByLabelText(/Connect a watch directly \(beta\)/));
  expect(mockPush).toHaveBeenCalledWith('/watch');
});

it('shows the direct option first and NoiseFit as option 2 in the Noise how-to', async () => {
  await render(
    <AppStateProvider>
      <ConnectApps />
    </AppStateProvider>
  );
  await fireEvent.press(await screen.findByLabelText('How to connect Noise watch', {}, find));
  expect(screen.getByText('Option 1')).toBeTruthy();
  expect(screen.getByText('Connect the watch directly (if supported)')).toBeTruthy();
  expect(screen.getByText('Option 2')).toBeTruthy();
  expect(screen.getByText(/NoiseFit → Google Fit or Google Health → Health Connect \(full data\)/)).toBeTruthy();
  expect(screen.getByText(/connect Google Fit \(or Google Health if offered\)/)).toBeTruthy();
  await fireEvent.press(screen.getByText('Connect watch directly (beta)'));
  expect(mockPush).toHaveBeenCalledWith('/watch');
});
