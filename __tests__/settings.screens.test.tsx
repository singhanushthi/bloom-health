/**
 * Settings: the Today gear opens a real route, the hub lists every section, each page renders,
 * and the AI Coach key page can't get stuck (paste/trim, validation, save & test outcomes).
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import React from 'react';
import { Linking } from 'react-native';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

const mockPush = jest.fn();
const mockReplace = jest.fn();
jest.mock('expo-router', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const R = require('react') as typeof import('react');
  return {
    router: { push: (...a: unknown[]) => mockPush(...a), replace: (...a: unknown[]) => mockReplace(...a), back: jest.fn(), canGoBack: () => true },
    useFocusEffect: (cb: () => void | (() => void)) => R.useEffect(() => cb(), [cb]),
    useLocalSearchParams: () => ({}),
    Redirect: () => null,
    Stack: () => null,
  };
});

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
  SafeAreaProvider: ({ children }: { children: React.ReactNode }) => children,
}));

const mockStore = new Map<string, string>();
jest.mock('expo-secure-store', () => ({
  getItemAsync: async (k: string) => mockStore.get(k) ?? null,
  setItemAsync: async (k: string, v: string) => void mockStore.set(k, v),
  deleteItemAsync: async (k: string) => void mockStore.delete(k),
}));

const mockClipboard = jest.fn<Promise<string>, []>();
jest.mock('expo-clipboard', () => ({ getStringAsync: () => mockClipboard() }));

type Reply = { status: number; body: unknown } | 'network';
let mockReply: (url: string) => Reply = () => ({ status: 200, body: { candidates: [{ content: { parts: [{ text: 'OK' }] } }] } });
const mockFetchCalls: { url: string; headers: Record<string, string> }[] = [];
jest.mock('expo/fetch', () => ({
  fetch: async (url: string, init: { headers: Record<string, string> }) => {
    mockFetchCalls.push({ url, headers: init.headers });
    const r = mockReply(url);
    if (r === 'network') throw new TypeError('Network request failed');
    return { ok: r.status < 400, status: r.status, text: async () => JSON.stringify(r.body), body: null };
  },
}));

import { CoachProvider } from '../src/ai/CoachState';
import { LogSheetsProvider } from '../src/components/sheets/LogSheets';
import { setDriver } from '../src/db/driver';
import { StepSensorProvider } from '../src/sensors/StepSensor';
import { SETTINGS_SECTIONS } from '../src/settings/sections';
import { AppStateProvider } from '../src/state/AppState';
import Today from '../src/app/(tabs)/index';
import SettingsHub from '../src/app/settings/index';
import AiCoachSettings from '../src/app/settings/ai';
import ProfileSettings from '../src/app/settings/profile';
import CycleSettingsPage from '../src/app/settings/cycle';
import StepsSettings from '../src/app/settings/steps';
import HealthConnectSharing from '../src/app/settings/health-connect';
import DataPrivacy from '../src/app/settings/data';
import AboutBloom from '../src/app/settings/about';
import Coach from '../src/app/coach';
import { memoryDriver } from '../test-utils/memoryDriver';
import { resolveRoute } from '../test-utils/routes';

jest.setTimeout(30000);
const find = { timeout: 8000 };

const AQ_KEY = 'AQ.Ab8RN6Ixyz_test-key-0123456789abcdef';
const AIZA_KEY = 'AIzaSyD-test-key-0123456789abcdefghij';
const BAD_KEY = { status: 400, body: { error: { code: 400, status: 'INVALID_ARGUMENT', message: 'API key not valid.', details: [{ reason: 'API_KEY_INVALID' }] } } };
const QUOTA = { status: 429, body: { error: { code: 429, status: 'RESOURCE_EXHAUSTED', message: 'Quota exceeded' } } };

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
  AsyncStorage.setItem('bloom.settings.v1', JSON.stringify({ demoMode: demo, onboarded: true, stepGoal: 8000, historyRequested: false }));

beforeEach(async () => {
  setDriver(memoryDriver());
  mockPush.mockClear();
  mockReplace.mockClear();
  mockStore.clear();
  mockClipboard.mockReset();
  mockFetchCalls.length = 0;
  mockReply = () => ({ status: 200, body: { candidates: [{ content: { parts: [{ text: 'OK' }] } }] } });
  await AsyncStorage.clear();
  await setSettings(false);
});

describe('the Today gear', () => {
  it('pushes a route that exists as a screen (the settings hub)', async () => {
    await setSettings(true);
    await render(wrap(<Today />));
    await fireEvent.press(await screen.findByLabelText('Settings', {}, find));
    expect(mockPush).toHaveBeenCalledTimes(1);
    const href = mockPush.mock.calls[0][0] as string;
    const file = resolveRoute(href);
    expect(file).not.toBeNull();
    expect(file).toMatch(/src\/app\/settings\/index\.tsx$/);
  });
});

describe('settings hub', () => {
  it('lists every section with a one-line description, in groups', async () => {
    await render(wrap(<SettingsHub />));
    expect(await screen.findByText('Settings', {}, find)).toBeTruthy();
    for (const s of SETTINGS_SECTIONS) {
      expect(screen.getByText(s.title)).toBeTruthy();
      expect(screen.getByText(s.body)).toBeTruthy();
    }
    for (const g of ['You', 'Connections', 'Health', 'Privacy & app']) expect(screen.getByText(g)).toBeTruthy();
    expect(SETTINGS_SECTIONS.map((s) => s.title)).toEqual([
      'You & your goals',
      'Connect apps & watch',
      'AI Coach',
      'Health Connect sharing',
      'Period & reminders',
      'Steps & phone sensors',
      'Data & privacy',
      'About Bloom',
    ]);
  });

  it('opens each section page', async () => {
    await render(wrap(<SettingsHub />));
    await fireEvent.press(await screen.findByLabelText(/^AI Coach\. Off/, {}, find));
    expect(mockPush).toHaveBeenLastCalledWith('/settings/ai');
    await fireEvent.press(screen.getByLabelText(/^Connect apps & watch/));
    expect(mockPush).toHaveBeenLastCalledWith('/connect');
  });
});

describe('section pages render and keep every old setting', () => {
  it('You & your goals: goal, what you track, welcome steps', async () => {
    await render(wrap(<ProfileSettings />));
    expect(await screen.findByText('Set up my goal', {}, find)).toBeTruthy();
    expect(screen.getByText('What you track')).toBeTruthy();
    expect(screen.getByLabelText('Heart rate & SpO₂')).toBeTruthy();
    expect(screen.getByText('Show the welcome steps again')).toBeTruthy();
    await fireEvent.press(screen.getByText('Set up my goal'));
    expect(mockPush).toHaveBeenCalledWith('/onboarding/profile?edit=1');
  });

  it('Period & reminders wraps the cycle settings', async () => {
    await render(wrap(<CycleSettingsPage />));
    expect(await screen.findByText(/Cycle reminders/i, {}, find)).toBeTruthy();
    expect(screen.getAllByText(/Your cycle/i).length).toBeGreaterThan(0);
  });

  it('Steps & phone sensors: goal, stride, sensor', async () => {
    await render(wrap(<StepsSettings />));
    expect(await screen.findByLabelText('Daily step goal', {}, find)).toBeTruthy();
    expect(screen.getByLabelText('Stride length in centimetres')).toBeTruthy();
    expect(screen.getByText('How counting works')).toBeTruthy();
    await fireEvent.changeText(screen.getByLabelText('Stride length in centimetres'), '5');
    await fireEvent(screen.getByLabelText('Stride length in centimetres'), 'submitEditing', { nativeEvent: { text: '5' } });
    expect(await screen.findByText('Enter a stride between 30 and 150 cm.', {}, find)).toBeTruthy();
  });

  it('Health Connect sharing: four optional toggles, pointing to Connect when not connected', async () => {
    await render(wrap(<HealthConnectSharing />));
    for (const t of ['Read my weight', 'Save my weights', 'Save my meals', 'Save my workouts']) {
      expect(await screen.findByLabelText(t, {}, find)).toBeTruthy();
    }
    await fireEvent.press(screen.getByText('Connect Health Connect'));
    expect(mockPush).toHaveBeenCalledWith('/connect');
  });

  it('Data & privacy: export, delete (asks first), demo mode, privacy', async () => {
    const alert = jest.spyOn(require('react-native').Alert, 'alert').mockImplementation(() => {});
    await render(wrap(<DataPrivacy />));
    expect(await screen.findByText('Your data stays on this phone', {}, find)).toBeTruthy();
    expect(screen.getByText('Export my data')).toBeTruthy();
    expect(screen.getByLabelText('Demo mode')).toBeTruthy();
    await fireEvent.press(screen.getByText('Delete all my data'));
    expect(alert).toHaveBeenCalledWith('Delete all your data?', expect.any(String), expect.any(Array));
    alert.mockRestore();
  });

  it('About Bloom: version, what’s new, safety', async () => {
    await render(wrap(<AboutBloom />));
    expect(await screen.findByText(/^Version 1\.2\.0$/, {}, find)).toBeTruthy();
    expect(screen.getByText('What’s new in 1.2')).toBeTruthy();
    expect(screen.getByText(/not a method of contraception/)).toBeTruthy();
  });
});

/* -------------------------------- AI Coach -------------------------------- */

const saveButton = () => screen.getByLabelText('Save and test key');
const keyInput = () => screen.getByLabelText('Gemini API key');

describe('AI Coach key page', () => {
  it('starts off, with three steps and the AI Studio link', async () => {
    const open = jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined);
    await render(wrap(<AiCoachSettings />));
    expect(await screen.findByText('AI Coach is off', {}, find)).toBeTruthy();
    expect(screen.getByText('Get your free key')).toBeTruthy();
    expect(screen.getByText('Sign in with Google, tap Create API key, then copy it.')).toBeTruthy();
    expect(screen.getByText('Paste your key')).toBeTruthy();
    expect(screen.getByText('Check that it works')).toBeTruthy();
    expect(screen.getByText('Save & test')).toBeTruthy(); // the primary button
    expect(screen.getByText('Gemini API key')).toBeTruthy(); // visible label
    expect(saveButton().props.accessibilityState).toMatchObject({ disabled: true });
    await fireEvent.press(screen.getByText('Open Google AI Studio'));
    expect(open).toHaveBeenCalledWith('https://aistudio.google.com/app/apikey');
    open.mockRestore();
  });

  it('Paste trims whitespace and quotes, then Save & test turns the coach on', async () => {
    const log = jest.spyOn(console, 'log').mockImplementation(() => {});
    mockClipboard.mockResolvedValue(`  "${AQ_KEY}"\n`);
    await render(wrap(<AiCoachSettings />));
    await fireEvent.press(await screen.findByText('Paste', {}, find));
    await waitFor(() => expect(keyInput().props.value).toBe(AQ_KEY));
    expect(keyInput().props.secureTextEntry).toBe(true);
    expect(keyInput().props.autoCapitalize).toBe('none');
    expect(keyInput().props.autoCorrect).toBe(false);
    expect(keyInput().props.spellCheck).toBe(false);
    expect(saveButton().props.accessibilityState).toMatchObject({ disabled: false });

    await fireEvent.press(saveButton());
    expect(await screen.findByText('AI Coach is on ✓ (using Gemini 3.8 Flash)', {}, find)).toBeTruthy();
    expect(screen.getByText('AI Coach is on. Using Gemini 3.8 Flash.')).toBeTruthy();
    expect([...mockStore.values()]).toEqual([AQ_KEY]);
    expect(mockFetchCalls[0].headers['x-goog-api-key']).toBe(AQ_KEY);
    expect(mockFetchCalls[0].url).not.toContain('key=');
    // The key never reaches the console.
    expect(JSON.stringify(log.mock.calls)).not.toContain(AQ_KEY);
    log.mockRestore();
  });

  it('show/hide toggles secure entry', async () => {
    await render(wrap(<AiCoachSettings />));
    await fireEvent.press(await screen.findByLabelText('Show key', {}, find));
    expect(keyInput().props.secureTextEntry).toBe(false);
    await fireEvent.press(screen.getByLabelText('Hide key'));
    expect(keyInput().props.secureTextEntry).toBe(true);
  });

  it('an empty clipboard explains what to do', async () => {
    mockClipboard.mockResolvedValue('   ');
    await render(wrap(<AiCoachSettings />));
    await fireEvent.press(await screen.findByText('Paste', {}, find));
    expect(await screen.findByText(/Nothing to paste yet/, {}, find)).toBeTruthy();
  });

  it('warns gently about an unusual prefix but still allows trying; blocks spaces', async () => {
    await render(wrap(<AiCoachSettings />));
    await fireEvent.changeText(await screen.findByLabelText('Gemini API key', {}, find), 'sk-abcdefghijklmnopqrstuvwxyz');
    expect(screen.getByText(/usually start with “AQ.” or “AIza”. You can still try this one./)).toBeTruthy();
    expect(saveButton().props.accessibilityState).toMatchObject({ disabled: false });
    await fireEvent.changeText(keyInput(), 'AQ.abc def ghi jkl mno');
    expect(screen.getByText(/has a space or line break/)).toBeTruthy();
    expect(saveButton().props.accessibilityState).toMatchObject({ disabled: true });
  });

  it('a rejected AQ. key (header and ?key= both refused) says so, with a next step', async () => {
    mockReply = () => BAD_KEY;
    await render(wrap(<AiCoachSettings />));
    await fireEvent.changeText(await screen.findByLabelText('Gemini API key', {}, find), AQ_KEY);
    await fireEvent.press(saveButton());
    expect(await screen.findByText(/Google didn’t accept this new “AQ.” key/, {}, find)).toBeTruthy();
    expect(screen.getByText(/Wait a minute, then tap Save & test again/)).toBeTruthy();
    // It tried the header first, then the ?key= fallback.
    expect(mockFetchCalls.map((c) => c.url.includes('key='))).toEqual([false, true]);
    expect(mockStore.size).toBe(0);
    expect(screen.getByText('AI Coach is off')).toBeTruthy();
  });

  it('an invalid AIza key, being offline and a busy server each get their own message', async () => {
    await render(wrap(<AiCoachSettings />));

    mockReply = () => BAD_KEY;
    await fireEvent.changeText(await screen.findByLabelText('Gemini API key', {}, find), AIZA_KEY);
    await fireEvent.press(saveButton());
    expect(await screen.findByText('Google says this key isn’t valid.', {}, find)).toBeTruthy();

    mockReply = () => 'network';
    await fireEvent.press(saveButton());
    expect(await screen.findByText(/You seem to be offline/, {}, find)).toBeTruthy();
    expect(screen.getByText(/Check your Wi-Fi or mobile data/)).toBeTruthy();

    mockReply = () => ({ status: 503, body: { error: { status: 'UNAVAILABLE' } } });
    await fireEvent.press(saveButton());
    expect(await screen.findByText('Google’s AI is busy right now.', {}, find)).toBeTruthy();
    expect(mockStore.size).toBe(0);
  });

  it('over quota: the key is accepted and saved, with a reset hint', async () => {
    mockReply = () => QUOTA;
    await render(wrap(<AiCoachSettings />));
    await fireEvent.changeText(await screen.findByLabelText('Gemini API key', {}, find), AIZA_KEY);
    await fireEvent.press(saveButton());
    expect(await screen.findByText(/Key saved. Google says today’s free limit is used up/, {}, find)).toBeTruthy();
    expect(screen.getByText(/AI Coach will answer again once it resets/)).toBeTruthy();
    expect([...mockStore.values()]).toEqual([AIZA_KEY]);
  });

  it('Remove key turns the coach off again', async () => {
    mockStore.set('bloom.gemini.key', AIZA_KEY);
    await render(wrap(<AiCoachSettings />));
    expect(await screen.findByText(/AI Coach is on ✓/, {}, find)).toBeTruthy();
    expect(screen.getByText('Key ending …ghij')).toBeTruthy();
    await fireEvent.press(screen.getByText('Ask Bloom'));
    expect(mockPush).toHaveBeenCalledWith('/coach');
    await act(async () => {
      fireEvent.press(screen.getByText('Remove key'));
    });
    expect(await screen.findByText('AI Coach is off', {}, find)).toBeTruthy();
    expect(mockStore.size).toBe(0);
  });
});

describe('Ask Bloom without a key', () => {
  it('shows a one-minute setup card that opens the key page', async () => {
    await render(wrap(<Coach />));
    expect(await screen.findByText('Set up AI Coach in 1 minute', {}, find)).toBeTruthy();
    await fireEvent.press(screen.getByText('Set up AI Coach'));
    expect(mockPush).toHaveBeenCalledWith('/settings/ai');
  });
});
