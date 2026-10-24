/**
 * Today screen: sections (shown/hidden by prefs and "What you track"), glance tiles and quick log
 * route correctly, Water +1 logs instantly with undo, no floating Log button.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
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

import { router } from 'expo-router';
import { setDriver } from '../src/db/driver';
import { kv, water } from '../src/db/repos';
import { todayKey } from '../src/health/dates';
import { memoryDriver } from '../test-utils/memoryDriver';
import { CoachProvider } from '../src/ai/CoachState';
import { LogSheetsProvider } from '../src/components/sheets/LogSheets';
import { TODAY_HIDDEN_KEY } from '../src/components/usePref';
import { StepSensorProvider } from '../src/sensors/StepSensor';
import { AppStateProvider } from '../src/state/AppState';
import Today from '../src/app/(tabs)/index';

jest.setTimeout(30000);
const find = { timeout: 8000 };
const push = router.push as jest.Mock;

const wrap = (el: React.ReactElement) => (
  <AppStateProvider>
    <StepSensorProvider>
      <CoachProvider>
        <LogSheetsProvider>{el}</LogSheetsProvider>
      </CoachProvider>
    </StepSensorProvider>
  </AppStateProvider>
);

const setSettings = (demo: boolean, extra: Record<string, unknown> = {}) =>
  AsyncStorage.setItem(
    'bloom.settings.v1',
    JSON.stringify({ demoMode: demo, onboarded: true, stepGoal: 8000, historyRequested: false, ...extra })
  );

// Let in-flight loads (metrics, plan, kv prefs, ring animations) settle before the next test renders.
afterEach(async () => {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 400));
  });
});

beforeEach(async () => {
  setDriver(memoryDriver());
  push.mockClear();
  await setSettings(true);
});

describe('demo mode', () => {
  it('shows a compact header, sections in order and no floating Log button', async () => {
    await render(wrap(<Today />));
    expect(await screen.findByText(/Demo mode/, {}, find)).toBeTruthy();
    expect(await screen.findByText(/^Good (morning|afternoon|evening|night)$/, {}, find)).toBeTruthy();
    for (const h of ['Today at a glance', 'Quick log', 'Your cycle', 'Today’s yoga', 'Move', 'Sleep & heart']) {
      expect(screen.getByText(h)).toBeTruthy();
    }
    expect(screen.getAllByText('Ask Bloom').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('Customise Today')).toBeTruthy();
    // The FAB is gone: nothing is labelled just "Log".
    expect(screen.queryByLabelText('Log')).toBeNull();
    // Cycle card is compact: phase + day, tips behind a toggle.
    expect(await screen.findByLabelText(/^Your cycle: day \d+/, {}, find)).toBeTruthy();
    await fireEvent.press(screen.getByText('Tips for this phase'));
    expect(await screen.findByText('Hide tips', {}, find)).toBeTruthy();
  });

  it('gear opens Settings and Ask Bloom opens the coach', async () => {
    await render(wrap(<Today />));
    await fireEvent.press(await screen.findByLabelText('Settings', {}, find));
    expect(push).toHaveBeenLastCalledWith('/settings');
    await fireEvent.press(screen.getByLabelText('Ask Bloom, your AI coach'));
    expect(push).toHaveBeenLastCalledWith('/coach');
  });

  it('glance tiles open their detail screens', async () => {
    await render(wrap(<Today />));
    await fireEvent.press(await screen.findByLabelText(/^Steps: [\d,]+ of 8,000 goal/, {}, find));
    expect(push).toHaveBeenLastCalledWith('/(tabs)/trends');
    await fireEvent.press(await screen.findByLabelText(/^Food: \d+ kilocalories eaten/, {}, find));
    expect(push).toHaveBeenLastCalledWith('/food');
    await fireEvent.press(screen.getByLabelText(/^Water: \d+ of \d+ glasses/));
    expect(push).toHaveBeenLastCalledWith('/food');
    await fireEvent.press(await screen.findByLabelText(/^Weight: \d+\.\d kilograms/, {}, find));
    expect(push).toHaveBeenLastCalledWith('/weight');
  });

  it('quick log buttons route to the right screen or sheet', async () => {
    await render(wrap(<Today />));
    await fireEvent.press(await screen.findByLabelText('Log weight', {}, find));
    expect(push).toHaveBeenLastCalledWith('/weight');
    await fireEvent.press(screen.getByLabelText('Log food'));
    expect(push).toHaveBeenLastCalledWith('/food/add');
    await fireEvent.press(screen.getByLabelText('Log activity'));
    expect(push).toHaveBeenLastCalledWith('/activity/add');
    await fireEvent.press(screen.getByLabelText('Log period'));
    expect(await screen.findByText('Save period', {}, find)).toBeTruthy();
  });

  it('quick log Sleep opens the sleep sheet; Water +1 explains demo mode', async () => {
    await render(wrap(<Today />));
    await fireEvent.press(await screen.findByLabelText('Add a glass of water, 250 millilitres', {}, find));
    expect(await screen.findByText(/Demo mode — sample data isn’t changed/, {}, find)).toBeTruthy();
    await fireEvent.press(screen.getAllByLabelText('Log sleep')[0]);
    expect(await screen.findByText('Save sleep', {}, find)).toBeTruthy();
  });

  it('Sleep & heart expands to the full detail cards with sources', async () => {
    await render(wrap(<Today />));
    expect(await screen.findByLabelText(/^Heart rate: \d+ beats per minute/, {}, find)).toBeTruthy();
    expect(screen.queryByText(/bpm resting/)).toBeNull();
    await fireEvent.press(screen.getByLabelText('Show sleep and heart details'));
    expect(await screen.findByText(/bpm resting/, {}, find)).toBeTruthy();
    expect((await screen.findAllByText(/Source: /, {}, find)).length).toBeGreaterThanOrEqual(2);
  });

  it('Move shows steps and opens step details', async () => {
    await render(wrap(<Today />));
    expect(await screen.findByText(/steps · \d+% of 8,000/, {}, find)).toBeTruthy();
    await fireEvent.press(screen.getByText('Step details'));
    expect(await screen.findByText(/steps · goal 8,000/, {}, find)).toBeTruthy();
    expect(screen.getByText("Edit today's steps")).toBeTruthy();
  });
});

describe('standalone (no Health Connect, nothing logged)', () => {
  beforeEach(() => setSettings(false));

  it('shows short empty states with small text buttons', async () => {
    await render(wrap(<Today />));
    expect(await screen.findByText(/No period logged yet/, {}, find)).toBeTruthy();
    expect(screen.getByText('Set up cycle')).toBeTruthy();
    expect(await screen.findByText('Not logged last night', {}, find)).toBeTruthy();
    expect(screen.getByText('No readings today')).toBeTruthy();
    expect(screen.getByText('Set up my plan')).toBeTruthy();
    expect(screen.queryByText(/NoiseFit/)).toBeNull();
    // Full cards (with "Connect a watch…") stay one tap away.
    await fireEvent.press(screen.getByLabelText('Show sleep and heart details'));
    expect((await screen.findAllByText(/Connect a watch in Settings for automatic readings/, {}, find)).length).toBe(2);
  });

  it('Water +1 logs right away and can be undone', async () => {
    await render(wrap(<Today />));
    await fireEvent.press(await screen.findByLabelText('Add a glass of water, 250 millilitres', {}, find));
    expect(await screen.findByText('Added a glass of water · 1 today', {}, find)).toBeTruthy();
    expect(await water.get(todayKey())).toBe(250);
    await fireEvent.press(screen.getByLabelText('Undo'));
    await waitFor(async () => expect(await water.get(todayKey())).toBe(0), find);
  });

  it('hides sections saved as hidden and persists changes from Customise Today', async () => {
    await kv.set(TODAY_HIDDEN_KEY, ['yoga', 'ask']);
    await render(wrap(<Today />));
    expect(await screen.findByText('Move', {}, find)).toBeTruthy();
    await waitFor(() => expect(screen.queryByText('Today’s yoga')).toBeNull(), find);
    expect(screen.queryByLabelText('Ask Bloom, your AI coach')).toBeNull();

    await fireEvent.press(screen.getByText('Customise Today'));
    const moveSwitch = await screen.findByLabelText('Show Move on Today', {}, find);
    await fireEvent(moveSwitch, 'valueChange', false);
    // "Move" is still a row label in the sheet; the section's own buttons are gone.
    await waitFor(() => expect(screen.queryByText('See activity')).toBeNull(), find);
    await waitFor(async () => expect(await kv.get(TODAY_HIDDEN_KEY)).toEqual(['yoga', 'ask', 'move']), find);

    await fireEvent(screen.getByLabelText('Show Today’s yoga on Today'), 'valueChange', true);
    await waitFor(() => expect(screen.getAllByText('Today’s yoga').length).toBe(2), find);
  });

  it('only shows what the user tracks', async () => {
    await setSettings(false, { tracks: ['steps'] });
    await render(wrap(<Today />));
    expect(await screen.findByLabelText(/^Steps: /, {}, find)).toBeTruthy();
    expect(screen.getByText('Move')).toBeTruthy();
    expect(screen.queryByText('Your cycle')).toBeNull();
    expect(screen.queryByText('Sleep & heart')).toBeNull();
    expect(screen.queryByLabelText('Log period')).toBeNull();
    expect(screen.queryByLabelText('Log sleep')).toBeNull();
  });

  it('hides the Steps tile when steps are not tracked', async () => {
    await setSettings(false, { tracks: ['sleep'] });
    await render(wrap(<Today />));
    expect(await screen.findByLabelText(/^Food: /, {}, find)).toBeTruthy();
    expect(screen.queryByLabelText(/^Steps: /)).toBeNull();
    expect(screen.getByText('Sleep & heart')).toBeTruthy();
  });
});
