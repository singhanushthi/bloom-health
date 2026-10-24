/**
 * AI Coach setup helpers: lenient key inspection (quotes from a long-press paste are tolerated),
 * and "needs setup" errors that make screens show a Set up AI Coach button.
 */
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);
jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(async () => null),
  setItemAsync: jest.fn(async () => {}),
  deleteItemAsync: jest.fn(async () => {}),
}));

import { GeminiError } from '../src/ai/gemini';
import { cleanPastedKey, inspectKey, MissingAiKeyError, needsAiSetup } from '../src/ai/key';
import { aiMakeRecipe, AiRecipeError } from '../src/kitchen/aiRecipe';
import { aiParseFood } from '../src/plan/aiFood';

const AQ = 'AQ.Ab8RN6abcdefghijklmnopqrstuvwxyz0123';
const AIZA = 'AIzaSyAbcdefghijklmnopqrstuvwxyz0123456';

describe('inspectKey', () => {
  it('accepts AQ. and AIza keys, with whitespace or quotes around them', () => {
    expect(inspectKey(AQ)).toEqual({ level: 'ok', format: 'AQ.' });
    expect(inspectKey(` ${AIZA}\n`)).toEqual({ level: 'ok', format: 'AIza' });
    expect(inspectKey(`"${AQ}"`)).toEqual({ level: 'ok', format: 'AQ.' });
    expect(inspectKey(`“${AIZA}”`)).toEqual({ level: 'ok', format: 'AIza' });
    expect(cleanPastedKey(`'${AQ}'\n`)).toBe(AQ);
  });

  it('warns (but allows) other prefixes; blocks spaces inside; empty is empty', () => {
    expect(inspectKey('sk-12345678901234567890').level).toBe('warn');
    expect(inspectKey('AQ.abc def ghi jkl mno pqr').level).toBe('error');
    expect(inspectKey('   ').level).toBe('empty');
  });
});

describe('needsAiSetup', () => {
  it('is true for a missing key and a key Google rejected, false otherwise', () => {
    expect(needsAiSetup(new MissingAiKeyError('x'))).toBe(true);
    expect(needsAiSetup(new AiRecipeError('x', 'no-key'))).toBe(true);
    expect(needsAiSetup(new GeminiError('auth', 'bad key'))).toBe(true);
    expect(needsAiSetup(new GeminiError('quota', 'limit'))).toBe(false);
    expect(needsAiSetup(new AiRecipeError('bad json'))).toBe(false);
    expect(needsAiSetup(new Error('x'))).toBe(false);
    expect(needsAiSetup(null)).toBe(false);
  });

  it('AI quick add and AI recipes without a key say “Set up AI Coach” and flag setup', async () => {
    const food = await aiParseFood('2 roti').catch((e: unknown) => e);
    expect(needsAiSetup(food)).toBe(true);
    expect((food as Error).message).toMatch(/^Set up AI Coach/);
    expect((food as Error).message).not.toMatch(/Settings →/);

    const recipe = await aiMakeRecipe({ pantryNames: ['rice'], diet: null, remainingKcal: null, remainingProtein: null, meal: 'lunch' }).catch(
      (e: unknown) => e
    );
    expect(recipe).toBeInstanceOf(AiRecipeError);
    expect(needsAiSetup(recipe)).toBe(true);
    expect((recipe as Error).message).toMatch(/^Set up AI Coach/);
  });
});
