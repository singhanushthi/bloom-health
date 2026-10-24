/**
 * Connect apps & watch: Health Connect hero with one action, calm app rows (Noise first) that open
 * a wizard, the direct-watch entry, and the Noise wizard itself (ticks persist, two paths).
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import React from 'react';
import { Linking } from 'react-native';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

const mockPush = jest.fn();
const mockParams: { current: Record<string, string> } = { current: {} };
jest.mock('expo-router', () => ({
  router: { push: (...a: unknown[]) => mockPush(...a), replace: jest.fn(), back: jest.fn(), canGoBack: () => true },
  useFocusEffect: jest.fn(),
  useLocalSearchParams: () => mockParams.current,
  Redirect: () => null,
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
  SafeAreaProvider: ({ children }: { children: React.ReactNode }) => children,
}));

import { setDriver } from '../src/db/driver';
import { WIZARD_TICKS_KEY } from '../src/health/connectWizard';
import { AppStateProvider } from '../src/state/AppState';
import ConnectApps from '../src/app/connect';
import ConnectWizard from '../src/app/connect/[appId]';
import { memoryDriver } from '../test-utils/memoryDriver';

jest.setTimeout(30000);
const find = { timeout: 8000 };

beforeEach(async () => {
  mockPush.mockClear();
  mockParams.current = {};
  setDriver(memoryDriver());
  await AsyncStorage.clear();
  await AsyncStorage.setItem('bloom.settings.v1', JSON.stringify({ demoMode: false, onboarded: true, stepGoal: 8000, historyRequested: false }));
});

const renderConnect = () =>
  render(
    <AppStateProvider>
      <ConnectApps />
    </AppStateProvider>
  );

describe('Connect apps & watch', () => {
  it('shows the Health Connect hero with a single install action when it is missing', async () => {
    const open = jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined);
    await renderConnect();
    expect(await screen.findByText('Connect apps & watch', {}, find)).toBeTruthy();
    expect(await screen.findByText('Health Connect isn’t on this phone yet', {}, find)).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Install Health Connect'));
    await waitFor(() => expect(open).toHaveBeenCalledWith('market://details?id=com.google.android.apps.healthdata'));
    open.mockRestore();
  });

  it('lists apps as rows with Noise first, each opening its wizard', async () => {
    await renderConnect();
    const noise = await screen.findByLabelText(/^Noise watch\. Set up\./, {}, find);
    expect(screen.getByText('Your apps')).toBeTruthy();
    // Noise is the first app row.
    const names = screen.getAllByText(/^(Noise watch|Flo|Google Fit|Google Health|Samsung Health)$/).map((n) => n.props.children);
    expect(names[0]).toBe('Noise watch');
    await fireEvent.press(noise);
    expect(mockPush).toHaveBeenCalledWith('/connect/noise');
    await fireEvent.press(screen.getByLabelText(/^Flo\./));
    expect(mockPush).toHaveBeenCalledWith('/connect/flo');
  });

  it('keeps the long tail behind "Show more apps" and other senders collapsed', async () => {
    await renderConnect();
    expect(await screen.findByText(/^Show \d+ more apps$/, {}, find)).toBeTruthy();
    expect(screen.queryByText('Strava')).toBeNull();
    await fireEvent.press(screen.getByText(/^Show \d+ more apps$/));
    expect(screen.getByText('Strava')).toBeTruthy();
    expect(screen.getByText(/^Other apps sending data/)).toBeTruthy();
    expect(screen.queryByText('None in the last 30 days.')).toBeNull();
  });

  it('still offers the direct Bluetooth watch', async () => {
    await renderConnect();
    await fireEvent.press(await screen.findByLabelText(/^Connect a watch directly \(beta\)/, {}, find));
    expect(mockPush).toHaveBeenCalledWith('/watch');
  });
});

describe('Noise wizard', () => {
  const renderNoise = () => {
    mockParams.current = { appId: 'noise' };
    return render(
      <AppStateProvider>
        <ConnectWizard />
      </AppStateProvider>
    );
  };

  it('shows the recommended path as five numbered steps and saves ticks', async () => {
    await renderNoise();
    expect(await screen.findByText('Set up Noise watch', {}, find)).toBeTruthy();
    for (const t of [
      'Install NoiseFit and pair your watch',
      'In NoiseFit: connect Google Fit',
      'In Google Fit: turn on Health Connect',
      'In Bloom: allow Health Connect access',
      'Check it’s working',
    ]) {
      expect(screen.getByText(t)).toBeTruthy();
    }
    expect(screen.getByText('0 of 5 done')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Done: Install NoiseFit and pair your watch'));
    expect(await screen.findByText('1 of 5 done', {}, find)).toBeTruthy();
    await waitFor(async () => expect(JSON.parse((await AsyncStorage.getItem(WIZARD_TICKS_KEY)) ?? '{}')).toEqual({ noise: { install: true } }));
  });

  it('restores saved ticks', async () => {
    await AsyncStorage.setItem(WIZARD_TICKS_KEY, JSON.stringify({ noise: { install: true, 'noisefit-gfit': true } }));
    await renderNoise();
    expect(await screen.findByText('2 of 5 done', {}, find)).toBeTruthy();
  });

  it('opens the Play Store search for NoiseFit', async () => {
    const open = jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined);
    await renderNoise();
    await fireEvent.press(await screen.findByText('Find NoiseFit', {}, find));
    expect(open).toHaveBeenCalledWith('https://play.google.com/store/search?q=NoiseFit&c=apps');
    open.mockRestore();
  });

  it('the check explains what to do when Health Connect is not ready', async () => {
    await renderNoise();
    await fireEvent.press(await screen.findByText('Check now', {}, find));
    expect(await screen.findByText(/Health Connect isn’t ready yet/, {}, find)).toBeTruthy();
  });

  it('offers direct Bluetooth (beta) as the second path', async () => {
    await renderNoise();
    await fireEvent.press(await screen.findByLabelText('Direct Bluetooth · Beta', {}, find));
    expect(screen.getByText('You get: Heart rate only.')).toBeTruthy();
    await fireEvent.press(screen.getByText('Try direct Bluetooth'));
    expect(mockPush).toHaveBeenCalledWith('/watch');
  });

  it('Flo uses the same screen with its own steps', async () => {
    mockParams.current = { appId: 'flo' };
    await render(
      <AppStateProvider>
        <ConnectWizard />
      </AppStateProvider>
    );
    expect(await screen.findByText('Set up Flo', {}, find)).toBeTruthy();
    expect(screen.getByText(/Bloom already tracks your periods/)).toBeTruthy();
    expect(screen.queryByText('Direct Bluetooth · Beta')).toBeNull();
  });
});
