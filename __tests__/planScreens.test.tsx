/**
 * Smoke tests for the plan screens (Plan, Food, Food add, Activity add, Weight, Profile) in
 * demo mode and standalone (live, no Health Connect, empty DB).
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import React from 'react';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

const mockParams: { current: Record<string, string> } = { current: {} };
jest.mock('expo-router', () => ({
  router: { push: jest.fn(), replace: jest.fn(), back: jest.fn(), canGoBack: () => true },
  useFocusEffect: jest.fn(),
  useLocalSearchParams: () => mockParams.current,
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

jest.mock(
  '../src/content/foods',
  () => {
    const mk = (id: string, name: string, diet: string, kcal: number, protein: number, grams = 100) => ({
      id,
      name,
      aliases: [],
      category: 'test',
      diet,
      serving: { label: grams === 30 ? '1 roti (30 g)' : '1 bowl', grams },
      per: { kcal, protein, carbs: 20, fat: 5, fiber: 2 },
    });
    const FOODS = [
      mk('roti', 'Roti', 'vegan', 120, 3.5, 30),
      mk('paneer', 'Paneer bhurji', 'veg', 250, 16),
      mk('dahi', 'Dahi', 'veg', 100, 6),
      mk('chicken', 'Chicken curry', 'nonveg', 280, 25),
    ];
    return {
      FOODS,
      searchFoods: (q: string, o: { diet?: string; limit?: number } = {}) =>
        FOODS.filter((f) => f.name.toLowerCase().includes(q.toLowerCase())).slice(0, o.limit ?? 20),
    };
  },
  { virtual: true }
);

import { setDriver } from '../src/db/driver';
import { activityLogs, foodEntries, weightLogs } from '../src/db/repos';
import { todayKey } from '../src/health/dates';
import { memoryDriver } from '../test-utils/memoryDriver';
import { CoachProvider } from '../src/ai/CoachState';
import { LogSheetsProvider } from '../src/components/sheets/LogSheets';
import { StepSensorProvider } from '../src/sensors/StepSensor';
import { AppStateProvider } from '../src/state/AppState';
import Plan from '../src/app/(tabs)/plan';
import FoodToday from '../src/app/food/index';
import AddFood from '../src/app/food/add';
import CustomFood from '../src/app/food/custom';
import AddActivity from '../src/app/activity/add';
import ActivityToday from '../src/app/activity/index';
import Weight from '../src/app/weight/index';
import ProfileStep from '../src/app/onboarding/profile';
import { saveProfile } from '../src/plan/store';

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
  AsyncStorage.setItem('bloom.settings.v1', JSON.stringify({ demoMode: demo, onboarded: true, stepGoal: 8000, historyRequested: false }));

beforeEach(async () => {
  setDriver(memoryDriver());
  mockParams.current = {};
});

describe('demo mode', () => {
  beforeEach(() => setSettings(true));

  it('renders the Plan with progress, targets, chart, ideas and updates', async () => {
    await render(wrap(<Plan />));
    expect(await screen.findByText('Your plan', {}, find)).toBeTruthy();
    expect(await screen.findByText(/% done/, {}, find)).toBeTruthy();
    expect(screen.getByText(/Aim around this/)).toBeTruthy();
    expect(screen.getByLabelText(/^Weight chart, last 42 days/)).toBeTruthy();
    expect(screen.getByLabelText('Show night weights')).toBeTruthy();
    expect(screen.getByText(/Next meal ideas/i)).toBeTruthy();
    expect(screen.getByText(/added 100 kcal because you lost faster than planned/)).toBeTruthy();
    expect(screen.getByLabelText(/Yoga, last 7 days: 3 of 4 sessions/)).toBeTruthy();
    expect(screen.getByText(/Add your free Gemini key/)).toBeTruthy();
  });

  it('renders the Food day with meals, macros and water', async () => {
    await render(wrap(<FoodToday />));
    expect(await screen.findByText(/Breakfast/, {}, find)).toBeTruthy();
    expect(screen.getByText('Poha')).toBeTruthy();
    expect(screen.getByLabelText(/^Protein: \d+ of \d+ g/)).toBeTruthy();
    expect(screen.getByText(/of \d+ glasses/)).toBeTruthy();
  });

  it('renders Activity today with a Health Connect session labelled by source', async () => {
    await render(wrap(<ActivityToday />));
    expect(await screen.findByText('Evening walk', {}, find)).toBeTruthy();
    expect(screen.getByText(/Source: Google Fit/)).toBeTruthy();
  });
});

describe('standalone (no Health Connect, nothing logged)', () => {
  beforeEach(() => setSettings(false));

  it('Plan invites setting up a goal', async () => {
    await render(wrap(<Plan />));
    expect(await screen.findByText('Set up my plan', {}, find)).toBeTruthy();
    expect(screen.getByText('Log food')).toBeTruthy();
  });

  it('Food add: search → quantity → Add saves an entry', async () => {
    mockParams.current = { meal: 'lunch' };
    await render(wrap(<AddFood />));
    expect(await screen.findByText(/Gemini key in Settings → AI Coach/, {}, find)).toBeTruthy();
    await fireEvent.changeText(await screen.findByLabelText('Search foods', {}, find), 'rot');
    await fireEvent.press(await screen.findByLabelText(/^Roti, 1 roti \(30 g\)/, {}, find));
    expect(await screen.findByText('Add', {}, find)).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Increase Servings'));
    expect(await screen.findByLabelText('This adds 180 kilocalories and 5.3 grams protein', {}, find)).toBeTruthy();
    await fireEvent.press(screen.getByText('Add'));
    await waitFor(async () => expect(await foodEntries.list(todayKey())).toHaveLength(1), find);
    const [e] = await foodEntries.list(todayKey());
    expect(e).toMatchObject({ meal: 'lunch', name: 'Roti', servings: 1.5, kcal: 180, foodKey: 'db:roti' });
  });

  it('Food add hides foods outside the diet (veg profile)', async () => {
    await saveProfile({ formula: 'female', birthYear: 1995, heightCm: 160, weightKg: 65, targetKg: 60, activity: 'light', diet: 'veg', pace: 'steady', startDay: todayKey(), yogaPerWeek: 3 });
    await render(wrap(<AddFood />));
    await new Promise((r) => setTimeout(r, 50));
    await fireEvent.changeText(await screen.findByLabelText('Search foods', {}, find), 'curry');
    expect(await screen.findByText(/No match/, {}, find)).toBeTruthy();
  });

  it('Custom food shows inline errors', async () => {
    await render(wrap(<CustomFood />));
    await fireEvent.press(await screen.findByText('Save food', {}, find));
    expect(await screen.findByText('Give the food a name.', {}, find)).toBeTruthy();
    expect(screen.getByText('Enter calories for one serving.')).toBeTruthy();
  });

  it('Activity add: type → duration → intensity → save', async () => {
    await render(wrap(<AddActivity />));
    await fireEvent.press(await screen.findByLabelText('Yoga', {}, find));
    await fireEvent.press(screen.getByLabelText('20 min'));
    await fireEvent.press(screen.getByLabelText('Light'));
    expect(await screen.findByText('~46 kcal', {}, find)).toBeTruthy(); // 2.3 × 60 kg × 1/3 h
    await fireEvent.press(screen.getByText('Save activity'));
    await waitFor(async () => expect(await activityLogs.list(todayKey())).toHaveLength(1), find);
    expect((await activityLogs.list(todayKey()))[0]).toMatchObject({ type: 'yoga', minutes: 20, intensity: 'light', source: 'manual' });
  });

  it('Activity add: custom minutes are validated inline', async () => {
    await render(wrap(<AddActivity />));
    await fireEvent.press(await screen.findByLabelText('Custom', {}, find));
    await fireEvent.press(screen.getByText('Save activity'));
    expect(await screen.findByText('Enter between 1 and 600 minutes.', {}, find)).toBeTruthy();
  });

  it('Weight: saves a weight and explains morning vs night', async () => {
    await render(wrap(<Weight />));
    expect(await screen.findByText(/Night weight is usually 0.5–1.5 kg higher/, {}, find)).toBeTruthy();
    await fireEvent.changeText(screen.getByLabelText('Weight in kilograms'), '68.4');
    await fireEvent(screen.getByLabelText('Weight in kilograms'), 'blur');
    await fireEvent.press(screen.getByLabelText('Morning'));
    await fireEvent.press(screen.getByText('Save weight'));
    await waitFor(async () => expect(await weightLogs.list()).toHaveLength(1), find);
    expect((await weightLogs.list())[0]).toMatchObject({ kg: 68.4, slot: 'morning' });
  });

  it('Profile: blocks an underweight target kindly and offers the healthy minimum', async () => {
    await render(wrap(<ProfileStep />));
    const target = await screen.findByLabelText('Target weight', {}, find);
    await fireEvent.changeText(target, '40');
    await fireEvent(target, 'blur');
    expect(await screen.findByText(/below a healthy weight for your height/, {}, find)).toBeTruthy();
    expect(screen.getByText(/Use 47.4 kg as my target/)).toBeTruthy();
    expect(screen.getByText('Skip for now')).toBeTruthy();
  });

  it('Profile: minors see the adults-only note', async () => {
    await render(wrap(<ProfileStep />));
    const year = await screen.findByLabelText('Birth year', {}, find);
    await fireEvent.changeText(year, String(new Date().getFullYear() - 15));
    expect(await screen.findByText(/plans are for adults/, {}, find)).toBeTruthy();
  });
});
