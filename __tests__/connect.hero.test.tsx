/**
 * The Health Connect hero's "Allow access" action: errors and empty results are surfaced inline
 * with an "Open Health Connect settings" fallback (instead of failing silently).
 */
import { fireEvent, render, screen } from '@testing-library/react-native';
import React from 'react';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

jest.mock('expo-router', () => ({
  router: { push: jest.fn(), replace: jest.fn(), back: jest.fn(), canGoBack: () => true },
  useFocusEffect: jest.fn(),
  useLocalSearchParams: () => ({}),
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

const mockState = {
  availability: 'available' as string,
  granted: new Set<string>(),
  requestPermissions: jest.fn<Promise<string[]>, []>(),
};
jest.mock('../src/state/AppState', () => ({
  useAppState: () => ({
    ...mockState,
    demoMode: false,
    dataVersion: 0,
    ctx: { mode: 'live', granted: mockState.granted, availability: mockState.availability, strideM: 0.72 },
    refreshConnection: jest.fn(async () => {}),
  }),
}));

const mockOpenSettings = jest.fn();
jest.mock('../src/health/client', () => {
  const actual = jest.requireActual('../src/health/client');
  return { ...actual, openHealthConnectSettings: () => mockOpenSettings() };
});

import ConnectApps from '../src/app/connect';
import { setDriver } from '../src/db/driver';
import { memoryDriver } from '../test-utils/memoryDriver';

const find = { timeout: 8000 };
jest.setTimeout(30000);

beforeEach(() => {
  setDriver(memoryDriver());
  mockState.availability = 'available';
  mockState.granted = new Set();
  mockState.requestPermissions.mockReset();
  mockOpenSettings.mockReset();
});

it('Allow access → permission sheet; a thrown error is shown with a settings fallback', async () => {
  mockState.requestPermissions.mockRejectedValue(new Error('Health Connect didn’t start. Open the Health Connect app once, then try again.'));
  await render(<ConnectApps />);
  expect(await screen.findByText('Allow Bloom to read your data', {}, find)).toBeTruthy();
  await fireEvent.press(screen.getByLabelText('Allow access'));
  expect(mockState.requestPermissions).toHaveBeenCalledTimes(1);
  expect(await screen.findByText('Health Connect didn’t open', {}, find)).toBeTruthy();
  expect(screen.getByText(/Open the Health Connect app once/)).toBeTruthy();
  await fireEvent.press(screen.getByText('Open Health Connect settings'));
  expect(mockOpenSettings).toHaveBeenCalled();
});

it('Allow access with nothing granted says so (no silent failure)', async () => {
  mockState.requestPermissions.mockResolvedValue([]);
  await render(<ConnectApps />);
  await fireEvent.press(await screen.findByLabelText('Allow access', {}, find));
  expect(await screen.findByText('Nothing was allowed yet', {}, find)).toBeTruthy();
});

it('once connected, the one action is Manage access', async () => {
  mockState.granted = new Set(['Steps', 'SleepSession']);
  await render(<ConnectApps />);
  expect(await screen.findByText('Health Connect is connected ✓', {}, find)).toBeTruthy();
  expect(screen.getByText('Bloom can read 2 of 11 kinds of data.')).toBeTruthy();
  await fireEvent.press(screen.getByLabelText('Manage access'));
  expect(mockOpenSettings).toHaveBeenCalled();
});
