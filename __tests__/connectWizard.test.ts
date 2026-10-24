/**
 * Connect wizards (pure logic) and the Health Connect hero states.
 */
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

import { CONNECT_APPS } from '../src/health/apps';
import {
  currentStepIndex,
  FEATURED_APP_IDS,
  heroState,
  isStepDone,
  summarizeCheck,
  toggleTick,
  WIZARDS,
  wizardFor,
} from '../src/health/connectWizard';

const now = new Date(2026, 9, 24, 12, 0); // 24 Oct 2026, noon local
const at = (d: number, h: number) => new Date(2026, 9, d, h, 0).toISOString();
const GFIT = 'com.google.android.apps.fitness';

describe('Noise wizard definition', () => {
  const w = WIZARDS.noise;

  it('has the five guided steps in order, with Health Connect and the check last', () => {
    expect(w.steps.map((s) => s.id)).toEqual(['install', 'noisefit-gfit', 'gfit-hc', 'hc-access', 'check']);
    expect(w.steps[0].action).toEqual({ kind: 'store-search', query: 'NoiseFit', label: 'Find NoiseFit' });
    expect(w.steps[1].body).toMatch(/Profile → Connect apps \(or Settings → Third-party\) → Google Fit/);
    expect(w.steps[1].note).toMatch(/vary/);
    expect(w.steps[2].body).toMatch(/Sync Fit with Health Connect → On/);
    expect(w.steps[2].note).toMatch(/Google Health → Settings → Health Connect/);
    expect(w.steps[3].auto).toBe('hc-access');
    expect(w.steps[4].auto).toBe('check');
  });

  it('offers direct Bluetooth (beta, heart rate only) as the second path', () => {
    expect(w.path?.tag).toBe('Recommended');
    expect(w.path?.gets).toMatch(/Steps, sleep, heart rate and SpO₂/);
    expect(w.altPath?.tag).toBe('Beta');
    expect(w.altPath?.gets).toBe('Heart rate only');
    expect(w.altPath?.action).toEqual({ kind: 'route', route: '/watch', label: 'Try direct Bluetooth' });
  });

  it('counts Noise data arriving through Google Fit or Google Health', () => {
    expect(w.check?.apps).toEqual(expect.arrayContaining(['noise', 'google-fit', 'google-health']));
  });
});

describe('step progress', () => {
  const w = WIZARDS.noise;
  const off = { hcGranted: false, checkFound: false };

  it('starts at step 1 and moves on as steps are ticked', () => {
    expect(currentStepIndex(w, undefined, off)).toBe(0);
    let t = toggleTick({}, 'noise', 'install');
    expect(currentStepIndex(w, t.noise, off)).toBe(1);
    t = toggleTick(t, 'noise', 'noisefit-gfit');
    t = toggleTick(t, 'noise', 'gfit-hc');
    expect(currentStepIndex(w, t.noise, off)).toBe(3);
  });

  it('ticks "allow Health Connect" automatically and ignores a manual tick for it', () => {
    const step = w.steps[3];
    expect(isStepDone(step, { 'hc-access': true }, off)).toBe(false);
    expect(isStepDone(step, {}, { hcGranted: true, checkFound: false })).toBe(true);
  });

  it('ticks the check when data is found (or it was found before)', () => {
    const step = w.steps[4];
    expect(isStepDone(step, {}, { hcGranted: true, checkFound: true })).toBe(true);
    expect(isStepDone(step, { check: true }, off)).toBe(true);
  });

  it('is complete when every step is done', () => {
    const ticks = { install: true, 'noisefit-gfit': true, 'gfit-hc': true, check: true };
    expect(currentStepIndex(w, ticks, { hcGranted: true, checkFound: false })).toBe(w.steps.length);
  });

  it('toggleTick flips one step and keeps other apps untouched', () => {
    const t = toggleTick({ flo: { 'flo-share': true } }, 'noise', 'install');
    expect(t).toEqual({ flo: { 'flo-share': true }, noise: { install: true } });
    expect(toggleTick(t, 'noise', 'install').noise.install).toBe(false);
  });
});

describe('"Check it\'s working"', () => {
  const check = WIZARDS.noise.check!;

  it('reports yesterday’s steps from Google Fit', () => {
    const r = summarizeCheck(
      [
        { origin: GFIT, time: at(23, 9), value: 3000 },
        { origin: GFIT, time: at(23, 19), value: 1210 },
        { origin: GFIT, time: at(22, 19), value: 999 },
      ],
      check,
      now
    );
    expect(r).toEqual({ found: true, message: 'Found 4,210 steps from Google Fit yesterday ✓' });
  });

  it('falls back to the 7-day total when yesterday is empty', () => {
    const r = summarizeCheck([{ origin: 'com.noisefit', time: at(20, 9), value: 5000 }], check, now);
    expect(r).toEqual({ found: true, message: 'Found 5,000 steps from NoiseFit in the last 7 days ✓' });
  });

  it('ignores the phone’s own steps and unrelated apps', () => {
    const r = summarizeCheck(
      [
        { origin: 'android', time: at(23, 9), value: 8000 },
        { origin: 'com.sec.android.app.shealth', time: at(23, 9), value: 8000 },
      ],
      check,
      now
    );
    expect(r.found).toBe(false);
    expect(r.message).toBe('Nothing yet — open NoiseFit and sync your watch, then Google Fit, then tap Check again.');
  });

  it('counts period days for Flo', () => {
    const r = summarizeCheck(
      [
        { origin: 'org.iggymedia.periodtracker', time: at(2, 8), value: 1 },
        { origin: 'org.iggymedia.periodtracker', time: at(3, 8), value: 1 },
        { origin: 'org.iggymedia.periodtracker', time: at(3, 20), value: 1 },
      ],
      WIZARDS.flo.check!,
      now
    );
    expect(r).toEqual({ found: true, message: 'Found 2 period days from Flo ✓' });
  });
});

describe('every app has a wizard', () => {
  it.each(CONNECT_APPS.map((a) => [a.id]))('%s', (id) => {
    const w = wizardFor(id);
    expect(w).not.toBeNull();
    expect(w!.name.length).toBeGreaterThan(0);
  });

  it('builds a generic wizard with Health Connect + check for apps without a hand-written one', () => {
    const w = wizardFor('strava')!;
    expect(w.steps.slice(-2).map((s) => s.auto)).toEqual(['hc-access', 'check']);
    expect(w.steps[0].action).toMatchObject({ kind: 'store-search', query: 'Strava' });
    expect(w.check?.apps).toEqual(['strava']);
  });

  it('has no steps to tick for an app that isn’t on Android', () => {
    expect(wizardFor('apple-health')!.steps).toEqual([]);
  });

  it('returns null for an unknown id', () => {
    expect(wizardFor('nope')).toBeNull();
  });

  it('features Noise first', () => {
    expect(FEATURED_APP_IDS[0]).toBe('noise');
    expect(FEATURED_APP_IDS).toEqual(['noise', 'flo', 'google-fit', 'google-health', 'samsung-health']);
  });

  it('Flo explains that Bloom already tracks periods', () => {
    expect(WIZARDS.flo.intro).toMatch(/Bloom already tracks your periods/);
  });
});

describe('Health Connect hero: one action per state', () => {
  it.each([
    ['checking', 0, 'checking', null],
    ['unavailable', 0, 'install', 'Install Health Connect'],
    ['unsupported', 0, 'install', 'Install Health Connect'],
    ['update-required', 0, 'update', 'Update Health Connect'],
    ['available', 0, 'allow', 'Allow access'],
    ['available', 9, 'connected', 'Manage access'],
  ] as const)('%s with %i granted → %s', (availability, granted, kind, action) => {
    const s = heroState(availability, granted, 11);
    expect(s.kind).toBe(kind);
    expect(s.action).toBe(action);
  });

  it('says how much Bloom can read once connected', () => {
    expect(heroState('available', 9, 11)).toMatchObject({ title: 'Health Connect is connected ✓', body: 'Bloom can read 9 of 11 kinds of data.' });
  });
});
