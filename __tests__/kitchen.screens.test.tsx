/**
 * Smoke tests for the Kitchen screens in demo mode and live (empty DB).
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

const mockRequest = jest.fn(async () => ({ granted: false, canAskAgain: true, status: 'denied' }));
jest.mock('expo-camera', () => ({
  CameraView: () => null,
  useCameraPermissions: () => [{ granted: false, canAskAgain: true, status: 'undetermined' }, mockRequest],
}));

import { setDriver } from '../src/db/driver';
import { foodEntries } from '../src/db/repos';
import { todayKey } from '../src/health/dates';
import { memoryDriver } from '../test-utils/memoryDriver';
import { CoachProvider } from '../src/ai/CoachState';
import { AppStateProvider } from '../src/state/AppState';
import KitchenHome from '../src/app/kitchen/index';
import AddToKitchen from '../src/app/kitchen/add';
import NewProduct from '../src/app/kitchen/product';
import RecipeScreen from '../src/app/kitchen/recipe/[id]';
import BrowseRecipes from '../src/app/kitchen/recipes';
import ScanProduct from '../src/app/kitchen/scan';
import { resetDemoKitchen } from '../src/kitchen/demo';
import { sqlKitchen } from '../src/kitchen/pantry';
import { router as mockRouter } from 'expo-router';

jest.setTimeout(30000);
const find = { timeout: 8000 };

const wrap = (el: React.ReactElement) => (
  <AppStateProvider>
    <CoachProvider>{el}</CoachProvider>
  </AppStateProvider>
);

const setSettings = (demo: boolean) =>
  AsyncStorage.setItem('bloom.settings.v1', JSON.stringify({ demoMode: demo, onboarded: true, stepGoal: 8000, historyRequested: false }));

beforeEach(async () => {
  setDriver(memoryDriver());
  resetDemoKitchen();
  mockParams.current = {};
  jest.clearAllMocks();
});

describe('demo mode', () => {
  beforeEach(() => setSettings(true));

  it('shows cook now, my kitchen with use-soon chips and the health check badges', async () => {
    await render(wrap(<KitchenHome />));
    expect(await screen.findByText('Cook now', {}, find)).toBeTruthy();
    expect(await screen.findByText('My kitchen', {}, find)).toBeTruthy();
    expect(screen.getAllByText('Use by tomorrow').length).toBeGreaterThan(0);
    expect(screen.getByText('Treat')).toBeTruthy(); // the demo biscuits
    expect(screen.getAllByText('You have everything').length).toBeGreaterThan(0);
    expect(screen.getByLabelText(/items in your kitchen/)).toBeTruthy();
  });

  it('does not save meals logged from a recipe in demo mode', async () => {
    mockParams.current = { id: 'paneer-bhurji' };
    await render(wrap(<RecipeScreen />));
    expect(await screen.findByText('Paneer bhurji', {}, find)).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Log this meal'));
    expect(await screen.findByText(/Demo mode is on/, {}, find)).toBeTruthy();
    expect(await foodEntries.list(todayKey())).toHaveLength(0);
  });
});

describe('live (empty kitchen)', () => {
  beforeEach(() => setSettings(false));

  it('invites the user to start their kitchen', async () => {
    await render(wrap(<KitchenHome />));
    expect(await screen.findByLabelText('Tap what you usually keep', {}, find)).toBeTruthy();
    expect(screen.getByText('Your recipes will show up here')).toBeTruthy();
  });

  it('adds staples from the picker', async () => {
    mockParams.current = { tab: 'staples' };
    await render(wrap(<AddToKitchen />));
    await fireEvent.press(await screen.findByLabelText('Onion', {}, find));
    await fireEvent.press(screen.getByLabelText('Tomato'));
    await fireEvent.press(screen.getByLabelText('Add 2 to my kitchen'));
    await waitFor(async () => expect((await sqlKitchen.pantry.list()).map((i) => i.ingredientKey).sort()).toEqual(['onion', 'tomato']), find);
  });

  it('parses a typed list', async () => {
    mockParams.current = { tab: 'type' };
    await render(wrap(<AddToKitchen />));
    await fireEvent.changeText(await screen.findByLabelText('What do you have?', {}, find), 'paneer, palak, dragonfruit');
    await fireEvent.press(screen.getByLabelText('Find ingredients'));
    expect(await screen.findByText('Found 2', {}, find)).toBeTruthy();
    expect(screen.getByLabelText('Add “dragonfruit” as my own item')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Add 2 items'));
    await waitFor(async () => expect(await sqlKitchen.pantry.list()).toHaveLength(2), find);
  });

  it('saves a packaged product typed by hand with a live health check', async () => {
    await render(wrap(<NewProduct />));
    await fireEvent.changeText(await screen.findByLabelText('Name', {}, find), 'Masala namkeen');
    const set = (label: string, v: string) => fireEvent.changeText(screen.getByLabelText(label), v);
    await set('Energy (kcal)', '560');
    await set('Protein (g)', '12');
    await set('Carbohydrate (g)', '40');
    await set('of which sugars (g)', '3');
    await set('Fat (g)', '38');
    await set('Salt (g)', '2.1');
    expect(await screen.findByText('Sometimes', {}, find)).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Save to my kitchen'));
    await waitFor(async () => expect((await sqlKitchen.pantry.list())[0]?.nutritionPer100g?.salt).toBe(2.1), find);
  });

  it('shows inline errors on the product form', async () => {
    await render(wrap(<NewProduct />));
    await fireEvent.press(await screen.findByLabelText('Save to my kitchen', {}, find));
    expect(await screen.findByText('Give the item a name.', {}, find)).toBeTruthy();
  });

  it('logs a recipe to the food log and adds missing items to the shopping list', async () => {
    await sqlKitchen.pantry.add({ name: 'Paneer', ingredientKey: 'paneer' });
    mockParams.current = { id: 'paneer-bhurji' };
    await render(wrap(<RecipeScreen />));
    expect(await screen.findByText(/at home/, {}, find)).toBeTruthy();
    await fireEvent.press(screen.getByLabelText(/missing to shopping list/));
    await waitFor(async () => expect((await sqlKitchen.shopping.list()).length).toBeGreaterThan(0), find);
    await fireEvent.press(screen.getByLabelText('Log this meal'));
    await waitFor(async () => {
      const list = await foodEntries.list(todayKey());
      expect(list).toHaveLength(1);
      expect(list[0]).toMatchObject({ name: 'Paneer bhurji', servings: 1, source: 'custom', foodKey: 'recipe:paneer-bhurji' });
    }, find);
  });

  it('browses and filters recipes', async () => {
    await render(wrap(<BrowseRecipes />));
    expect(await screen.findByText(/^\d+ recipes$/, {}, find)).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Period comfort'));
    const label = await screen.findByText(/^\d+ recipes?$/, {}, find);
    expect(Number(String(label.props.children[0]))).toBeLessThan(20);
  });

  it('only asks for the camera when the user taps scan, and looks up typed barcodes', async () => {
    const fetchMock = jest.fn(async () => ({ ok: true, status: 200, json: async () => ({ status: 0 }) }));
    (globalThis as unknown as { fetch: unknown }).fetch = fetchMock;
    await render(wrap(<ScanProduct />));
    expect(await screen.findByText(/Point your camera/, {}, find)).toBeTruthy();
    expect(mockRequest).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByLabelText('Allow camera & scan'));
    await waitFor(() => expect(mockRequest).toHaveBeenCalledTimes(1), find);
    expect(await screen.findByText(/type the number below/, {}, find)).toBeTruthy();
    await fireEvent.changeText(screen.getByLabelText('Barcode number'), '8901234567890');
    await fireEvent.press(screen.getByLabelText('Look up'));
    await waitFor(() => expect(mockRouter.replace).toHaveBeenCalledWith('/kitchen/product?from=scan'), find);
    expect((fetchMock.mock.calls[0] as unknown as [string])[0]).toContain('/api/v2/product/8901234567890.json');
  });
});
