import {
  CONNECT_APPS,
  computeStatuses,
  isSystemOrigin,
  matchOrigin,
  playStoreSearchUrl,
  prettifyPackage,
} from '../src/health/apps';

describe('matchOrigin', () => {
  it('matches verified package names exactly', () => {
    expect(matchOrigin('org.iggymedia.periodtracker')).toEqual(['flo']);
    expect(matchOrigin('com.google.android.apps.fitness')).toEqual(['google-fit']);
    expect(matchOrigin('com.sec.android.app.shealth')).toEqual(['samsung-health']);
    expect(matchOrigin('com.strava')).toEqual(['strava']);
    expect(matchOrigin('com.mi.health')).toEqual(['mi-zepp']);
  });

  it('maps the Google Health (Fitbit) app to both its cards', () => {
    expect(matchOrigin('com.fitbit.FitbitMobile').sort()).toEqual(['fitbit', 'google-health']);
  });

  it('falls back to name tokens for apps without a verified id', () => {
    expect(matchOrigin('com.noisefit')).toEqual(['noise']);
    expect(matchOrigin('com.example.noisefit.beta')).toEqual(['noise']);
    expect(matchOrigin('in.boat.crest')).toEqual(['boat-fireboltt']);
    expect(matchOrigin('com.fireboltt.app')).toEqual(['boat-fireboltt']);
    expect(matchOrigin('com.huami.watch.other')).toEqual(['mi-zepp']);
  });

  it('ignores the phone, Health Connect, Bloom and local pseudo-origins', () => {
    for (const o of ['android', 'com.android.healthconnect.phone.123', 'com.google.android.apps.healthdata', 'com.bloomhealth.app', 'bloom:log']) {
      expect(isSystemOrigin(o)).toBe(true);
      expect(matchOrigin(o)).toEqual([]);
    }
  });

  it('returns nothing for unknown apps', () => {
    expect(matchOrigin('com.example.stepper')).toEqual([]);
  });
});

describe('computeStatuses', () => {
  it('marks apps with recent data as sharing and collects unknown origins', () => {
    const s = computeStatuses({
      Steps: ['com.google.android.apps.fitness', 'com.example.my_steps', 'android'],
      SleepSession: ['com.google.android.apps.fitness'],
      MenstruationPeriod: ['org.iggymedia.periodtracker'],
      HeartRate: ['com.noisefit'],
    });
    expect(s.byApp['google-fit'].status).toBe('sharing');
    expect(s.byApp['google-fit'].metrics.sort()).toEqual(['SleepSession', 'Steps']);
    expect(s.byApp.flo.status).toBe('sharing');
    expect(s.byApp.noise.status).toBe('sharing');
    expect(s.byApp.strava.status).toBe('not-connected');
    expect(s.others).toEqual([{ pkg: 'com.example.my_steps', name: 'My Steps', metrics: ['Steps'] }]);
  });

  it('keeps special statuses for apps Bloom cannot read directly', () => {
    const s = computeStatuses({});
    expect(s.byApp.huawei.status).toBe('no-health-connect');
    expect(s.byApp['apple-health'].status).toBe('not-android');
    expect(s.others).toEqual([]);
  });

  it('shows a Huawei bridge as sharing when its data does arrive', () => {
    const s = computeStatuses({ Steps: ['com.huawei.health'] });
    expect(s.byApp.huawei.status).toBe('sharing');
  });

  it('has a status for every card', () => {
    const s = computeStatuses({});
    expect(Object.keys(s.byApp).sort()).toEqual(CONNECT_APPS.map((a) => a.id).sort());
  });
});

describe('helpers', () => {
  it('prettifies package names', () => {
    expect(prettifyPackage('com.example.myStepApp')).toBe('My Step App');
    expect(prettifyPackage('com.acme.android')).toBe('Acme');
    expect(prettifyPackage('io.walkers.fitness')).toBe('Walkers Fitness');
    expect(prettifyPackage('com')).toBe('com');
  });

  it('builds Play Store search links (no guessed ids)', () => {
    expect(playStoreSearchUrl('Mi Fitness Zepp')).toBe('https://play.google.com/store/search?q=Mi%20Fitness%20Zepp&c=apps');
  });

  it('every card has 1–4 steps and Apple Health has no store link', () => {
    for (const a of CONNECT_APPS) {
      expect(a.steps.length).toBeGreaterThanOrEqual(1);
      expect(a.steps.length).toBeLessThanOrEqual(4);
    }
    expect(CONNECT_APPS.find((a) => a.id === 'apple-health')!.storeQuery).toBeNull();
  });
});
