/**
 * Watch screen: graceful without Bluetooth (the default mock), and the scan → connect flow
 * with a scripted fake watch.
 */
import { fireEvent, render, screen } from '@testing-library/react-native';
import React from 'react';
import { PermissionsAndroid } from 'react-native';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);
const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  router: { push: (...a: unknown[]) => mockPush(...a), replace: jest.fn(), back: jest.fn(), canGoBack: () => true },
  useFocusEffect: jest.fn(),
}));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

import WatchScreen from '../src/app/watch';
import { setDriver } from '../src/db/driver';
import { __resetBleManagerForTests } from '../src/watch/ble';
import { __resetWatchForTests } from '../src/watch/controller';
import { GATT, bytesToBase64, sigUuid } from '../src/watch/parse';
import { memoryDriver } from '../test-utils/memoryDriver';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { __mock } = require('react-native-ble-plx') as typeof import('../__mocks__/react-native-ble-plx');

jest.setTimeout(30000);
const find = { timeout: 5000 };

beforeEach(async () => {
  mockPush.mockClear();
  setDriver(memoryDriver());
  await __resetWatchForTests();
  __resetBleManagerForTests();
  __mock.reset();
  jest.spyOn(PermissionsAndroid, 'check').mockResolvedValue(true);
});
afterEach(async () => {
  await __resetWatchForTests();
  jest.restoreAllMocks();
});

it('explains the limits and says when Bluetooth is not available', async () => {
  await render(<WatchScreen />);
  expect(screen.getByText('Connect watch directly')).toBeTruthy();
  expect(screen.getByText(/Many budget watches, including some Noise models, don’t/)).toBeTruthy();
  expect(screen.getByText(/may not sync time, notifications or firmware updates/)).toBeTruthy();
  expect(await screen.findByText('Bluetooth isn’t available on this device', {}, find)).toBeTruthy();
  await fireEvent.press(screen.getByText('Connect through Health Connect'));
  expect(mockPush).toHaveBeenCalledWith('/connect');
});

it('scans, lists heart-rate watches first and connects', async () => {
  __mock.available = true;
  __mock.devices = [
    { id: 'SP', name: 'Speaker', rssi: -45 },
    {
      id: 'W1',
      name: 'Noise Pulse',
      rssi: -62,
      serviceUUIDs: [sigUuid('180d')],
      services: [sigUuid('180d'), sigUuid('180f')],
      values: { [GATT.batteryLevel]: bytesToBase64([81]) },
    },
  ];
  await render(<WatchScreen />);
  expect(screen.getByText('Before you scan')).toBeTruthy();
  await fireEvent.press(await screen.findByText('Scan for my watch', {}, find));
  const rows = await screen.findAllByLabelText(/\. Connect$/, {}, find);
  expect(rows.map((r) => r.props.accessibilityLabel)).toEqual([
    'Noise Pulse. Shares heart rate. Signal good. Connect',
    'Speaker. Signal strong. Connect',
  ]);
  await fireEvent.press(rows[0]);
  expect(await screen.findByText('Battery 81%', {}, find)).toBeTruthy();
  expect(screen.getByText('Disconnect')).toBeTruthy();
  expect(screen.getByText(/Waiting for heart rate/)).toBeTruthy();
  await fireEvent.press(screen.getByText('Disconnect'));
  expect(await screen.findByText('Not connected', { exact: false }, find)).toBeTruthy();
});
