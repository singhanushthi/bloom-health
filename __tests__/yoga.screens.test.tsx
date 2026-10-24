/**
 * Smoke tests for the Yoga tab, session detail, session player and Connect screens.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import React from 'react';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

const mockParams: Record<string, string> = {};
jest.mock('expo-router', () => ({
  router: { push: jest.fn(), replace: jest.fn(), back: jest.fn(), canGoBack: () => true },
  useFocusEffect: jest.fn(),
  useLocalSearchParams: () => mockParams,
  Redirect: () => null,
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
  SafeAreaProvider: ({ children }: { children: React.ReactNode }) => children,
}));

jest.mock('../src/plan/activity', () => ({ addActivity: jest.fn(async () => {}) }));

import { SESSIONS } from '../src/content/yoga';
import { setDriver } from '../src/db/driver';
import { AppStateProvider } from '../src/state/AppState';
import { memoryDriver } from '../test-utils/memoryDriver';
import YogaTab from '../src/app/(tabs)/yoga';
import Detail from '../src/app/yoga/[id]';
import Player from '../src/app/yoga/session/[id]';
import Connect from '../src/app/connect';

jest.setTimeout(30000);
const find = { timeout: 8000 };
const wrap = (el: React.ReactElement) => <AppStateProvider>{el}</AppStateProvider>;

beforeEach(async () => {
  setDriver(memoryDriver());
  await AsyncStorage.clear();
  await AsyncStorage.setItem(
    'bloom.settings.v1',
    JSON.stringify({ demoMode: true, onboarded: true, stepGoal: 8000, historyRequested: false })
  );
  for (const k of Object.keys(mockParams)) delete mockParams[k];
});

it('renders the Yoga tab with level, today, sessions and programs', async () => {
  await render(wrap(<YogaTab />));
  expect(await screen.findByText('Not sure? Start with Beginner.', {}, find)).toBeTruthy();
  expect(await screen.findByText('7-day Beginner Start', {}, find)).toBeTruthy();
  expect(screen.getByText('21-day Strength & Core')).toBeTruthy();
  expect(screen.getByText('Weekly goal')).toBeTruthy();
  expect(await screen.findAllByLabelText(/^Start .*minutes$/, {}, find)).toBeTruthy();
});

it('renders a session detail', async () => {
  const s = SESSIONS[0];
  mockParams.id = s.id;
  await render(wrap(<Detail />));
  expect(await screen.findByText(s.title, {}, find)).toBeTruthy();
  expect(screen.getByText('Poses')).toBeTruthy();
});

it('plays a session: safety note, get ready, pose', async () => {
  jest.useFakeTimers();
  try {
    const s = SESSIONS[0];
    mockParams.id = s.id;
    await render(wrap(<Player />));
    expect(await screen.findByText('Before you start', {}, find)).toBeTruthy();
    await act(async () => {
      fireEvent.press(screen.getByText('I understand'));
    });
    await act(async () => {
      fireEvent.press(screen.getByText('Begin'));
    });
    expect(screen.getByText('Get ready')).toBeTruthy();
    await act(async () => {
      jest.advanceTimersByTime(5500);
    });
    expect(screen.getByText('Hold')).toBeTruthy();
    expect(screen.getByLabelText('Pause')).toBeTruthy();
  } finally {
    jest.useRealTimers();
  }
});

it('renders Connect your apps with demo origins', async () => {
  await render(wrap(<Connect />));
  expect(await screen.findByText('Connect apps & watch', {}, find)).toBeTruthy();
  expect(await screen.findAllByText('Connected ✓', {}, find)).toBeTruthy();
  await fireEvent.press(screen.getByText(/^Show \d+ more apps$/));
  expect(screen.getByText('Huawei Health')).toBeTruthy();
  expect(screen.getByText(/Your data stays on this phone\./)).toBeTruthy();
});
