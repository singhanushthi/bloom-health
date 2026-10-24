/**
 * Smoke tests for the cycle screens and exported components (demo + live).
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
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
jest.mock('expo-secure-store', () => ({
  getItemAsync: async () => null,
  setItemAsync: async () => undefined,
  deleteItemAsync: async () => undefined,
}));
const mockNotif = {
  AndroidImportance: { DEFAULT: 3 },
  AndroidNotificationVisibility: { PRIVATE: 0, PUBLIC: 1 },
  SchedulableTriggerInputTypes: { DAILY: 'daily', DATE: 'date' },
  setNotificationHandler: jest.fn(),
  setNotificationChannelAsync: jest.fn(async () => null),
  getPermissionsAsync: jest.fn(async () => ({ granted: false, status: 'undetermined', canAskAgain: true })),
  requestPermissionsAsync: jest.fn(async () => ({ granted: true, status: 'granted', canAskAgain: true })),
  getAllScheduledNotificationsAsync: jest.fn(async () => []),
  cancelScheduledNotificationAsync: jest.fn(async () => undefined),
  scheduleNotificationAsync: jest.fn(async () => 'id'),
};
jest.mock('expo-notifications', () => mockNotif);

import { setDriver } from '../src/db/driver';
import { periods } from '../src/db/repos';
import { memoryDriver } from '../test-utils/memoryDriver';
import { LogSheetsProvider } from '../src/components/sheets/LogSheets';
import { AppStateProvider } from '../src/state/AppState';
import Cycle from '../src/app/(tabs)/cycle';
import Insights from '../src/app/cycle/insights';
import CycleSettingsScreen from '../src/app/cycle/settings';
import { TodayCycleCard } from '../src/cycle/TodayCycleCard';
import { CycleSettingsSection } from '../src/cycle/CycleSettingsSection';
import { CycleDayLogSheet } from '../src/cycle/DayLogSheet';
import { dayExtras, loadCycleSettings, saveCycleSettings } from '../src/cycle/store';
import { todayKey, addDays } from '../src/health/dates';

jest.setTimeout(30000);
const find = { timeout: 8000 };

const wrap = (el: React.ReactElement) => (
  <AppStateProvider>
    <LogSheetsProvider>{el}</LogSheetsProvider>
  </AppStateProvider>
);
const setSettings = (demo: boolean) =>
  AsyncStorage.setItem('bloom.settings.v1', JSON.stringify({ demoMode: demo, onboarded: true, stepGoal: 8000 }));

beforeEach(async () => {
  setDriver(memoryDriver());
  jest.clearAllMocks();
});

describe('demo mode', () => {
  beforeEach(() => setSettings(true));

  it('Cycle tab: hero, next periods, calendar legend, phase ideas, history', async () => {
    await render(wrap(<Cycle />));
    expect(await screen.findByText(/Cycle history/i, {}, find)).toBeTruthy();
    expect(screen.getByText('Next periods')).toBeTruthy();
    expect(screen.getAllByText(/Not a method of contraception/).length).toBeGreaterThan(0);
    expect(screen.getByText('PMS days')).toBeTruthy();
    expect(screen.getByText('Food')).toBeTruthy();
    expect(screen.getByText('Movement')).toBeTruthy();
    expect(screen.getByText('Self-care')).toBeTruthy();
    // Peek at another phase
    await fireEvent.press(screen.getByLabelText('PMS'));
    expect(await screen.findByText('The days before your period', {}, find)).toBeTruthy();
  });

  it('Insights: averages, chart summary, patterns from demo logs, mood by phase', async () => {
    await render(wrap(<Insights />));
    expect(await screen.findByText(/Cramps (usually|often) on/, {}, find)).toBeTruthy();
    expect(screen.getAllByText(/days? before your period/).length).toBeGreaterThan(0);
    expect(screen.getByLabelText(/Cycle lengths for your last/)).toBeTruthy();
    expect(screen.getAllByText(/Mostly/).length).toBeGreaterThan(0);
  });

  it('TodayCycleCard shows the phase and 3 tips; hidden with the privacy toggle', async () => {
    const r = await render(wrap(<TodayCycleCard />));
    expect(await screen.findByText('Today in your cycle', {}, find)).toBeTruthy();
    expect(screen.getByText('Ideas for this phase')).toBeTruthy();
    r.unmount();
    await saveCycleSettings({ hideOnToday: true });
    await render(wrap(<TodayCycleCard />));
    await waitFor(async () => expect((await loadCycleSettings()).hideOnToday).toBe(true));
    await new Promise((res) => setTimeout(res, 50));
    expect(screen.queryByText('Today in your cycle')).toBeNull();
  });
});

describe('live mode', () => {
  beforeEach(() => setSettings(false));

  it('first time: setup → saves the last period and shows predictions', async () => {
    await render(wrap(<Cycle />));
    expect(await screen.findByText('Let’s get to know your cycle', {}, find)).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('More days for How long is your cycle, usually?'));
    await fireEvent.press(screen.getByText('Save and see my cycle'));
    expect(await screen.findByText(/Cycle history/i, {}, find)).toBeTruthy();
    const list = await periods.list();
    expect(list).toHaveLength(1);
    expect(list[0].startDay).toBe(addDays(todayKey(), -14));
    expect((await loadCycleSettings()).typicalCycleLength).toBe(29);
  });

  it('one tap "Period started today" then "Period ended today"', async () => {
    await saveCycleSettings({ setupDone: true });
    await periods.add({ startDay: addDays(todayKey(), -30), endDay: addDays(todayKey(), -26) });
    await render(wrap(<Cycle />));
    await fireEvent.press(await screen.findByText('Period started today', {}, find));
    expect(await screen.findByText('Period ended today', {}, find)).toBeTruthy();
    expect((await periods.list()).some((p) => p.startDay === todayKey() && p.endDay === null)).toBe(true);
    await fireEvent.press(screen.getByText('Period ended today'));
    await waitFor(async () => expect((await periods.list()).find((p) => p.startDay === todayKey())?.endDay).toBe(todayKey()), find);
  });

  it('day log sheet saves extras', async () => {
    const onClose = jest.fn();
    await render(wrap(<CycleDayLogSheet day={todayKey()} onClose={onClose} />));
    await fireEvent.press(await screen.findByLabelText('2 · Moderate', {}, find));
    await fireEvent.press(screen.getByLabelText('Egg-white'));
    await fireEvent.changeText(screen.getByLabelText('Pill or medication name'), 'Meftal');
    await fireEvent.press(screen.getByLabelText('Add pill or medication'));
    await fireEvent.press(screen.getByText('Save day'));
    await waitFor(() => expect(onClose).toHaveBeenCalled(), find);
    expect(await dayExtras.get(todayKey())).toMatchObject({ pain: 2, discharge: 'egg_white', meds: ['Meftal'] });
  });

  it('settings: turning on a reminder asks for permission; discreet is on by default', async () => {
    await render(wrap(<CycleSettingsSection />));
    const sw = await screen.findByLabelText('Fertile window starts', {}, find);
    expect(screen.getByLabelText('Discreet wording').props.value).toBe(true);
    await fireEvent(sw, 'valueChange', true);
    await waitFor(() => expect(mockNotif.requestPermissionsAsync).toHaveBeenCalled(), find);
    await waitFor(async () => expect((await loadCycleSettings()).reminders.fertile).toBe(true), find);
    expect(screen.getByLabelText('Hide cycle data on Today')).toBeTruthy();
  });

  it('settings screen renders', async () => {
    await render(wrap(<CycleSettingsScreen />));
    expect(await screen.findByText('Cycle settings', {}, find)).toBeTruthy();
    expect(await screen.findByText('Usual cycle length', {}, find)).toBeTruthy();
  });
});
