/**
 * Settings, Connect and AI-setup navigation: every target exists as a screen file.
 * Regression for "settings icon is not working": settings must be a normal stack route, never a
 * hidden tab (expo-router 58 redirects a focused `href: null` tab back to the first tab).
 */
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

import { CONNECT_APPS } from '../src/health/apps';
import { WIZARDS } from '../src/health/connectWizard';
import { SETTINGS_SECTIONS } from '../src/settings/sections';
import { filesIn, navTargets, resolveRoute, screenRoutes } from '../test-utils/routeFiles';

declare const __dirname: string;
// eslint-disable-next-line @typescript-eslint/no-require-imports
const fs = require('fs') as { readFileSync(p: string, e: 'utf8'): string };

const routes = screenRoutes();
const rel = (f: string | null) => (f ? f.replace(/.*bloom-health\//, '') : null);

describe('route resolver', () => {
  it('resolves groups, index files, dynamic segments and query strings', () => {
    expect(rel(resolveRoute('/settings', routes))).toBe('src/app/settings/index.tsx');
    expect(rel(resolveRoute('/settings/ai', routes))).toBe('src/app/settings/ai.tsx');
    expect(rel(resolveRoute('/(tabs)', routes))).toBe('src/app/(tabs)/index.tsx');
    expect(rel(resolveRoute('/connect', routes))).toBe('src/app/connect/index.tsx');
    expect(rel(resolveRoute('/connect/noise', routes))).toBe('src/app/connect/[appId].tsx');
    expect(rel(resolveRoute('/onboarding/profile?edit=1', routes))).toBe('src/app/onboarding/profile.tsx');
    expect(resolveRoute('/nope', routes)).toBeNull();
  });

  it('the old hidden-tab file is gone, and nothing links to it', () => {
    expect(routes.some((r) => /\(tabs\)\/settings\.tsx$/.test(r.file))).toBe(false);
    for (const f of filesIn('src')) {
      expect([f, fs.readFileSync(`${__dirname}/../${f}`, 'utf8').includes("'/(tabs)/settings'")]).toEqual([f, false]);
    }
  });

  it('the tab layout does not declare a settings screen', () => {
    const src = fs.readFileSync(`${__dirname}/../src/app/(tabs)/_layout.tsx`, 'utf8');
    expect(src).not.toMatch(/name="settings"/);
    expect(src).not.toMatch(/options=\{\{[^}]*href:\s*null/);
  });

  it('the root stack registers the settings stack', () => {
    const src = fs.readFileSync(`${__dirname}/../src/app/_layout.tsx`, 'utf8');
    expect(src).toMatch(/<Stack\.Screen name="settings"/);
  });
});

describe('every settings section opens a real page', () => {
  it.each(SETTINGS_SECTIONS.map((s) => [s.route]))('%s', (route) => {
    expect(resolveRoute(route, routes)).not.toBeNull();
  });
});

describe('every connect wizard and its actions resolve', () => {
  it.each(CONNECT_APPS.map((a) => [`/connect/${a.id}`]))('%s', (route) => {
    expect(rel(resolveRoute(route, routes))).toBe('src/app/connect/[appId].tsx');
  });

  it('in-app wizard actions point at real screens', () => {
    for (const w of Object.values(WIZARDS)) {
      for (const a of [...w.steps.map((s) => s.action), w.altPath?.action]) {
        if (a?.kind === 'route') expect([a.route, resolveRoute(a.route, routes)]).not.toEqual([a.route, null]);
      }
    }
  });
});

const MY_FILES = filesIn(
  'src/app/settings',
  'src/app/connect',
  'src/app/coach.tsx',
  'src/app/watch.tsx',
  'src/app/food/add.tsx',
  'src/app/kitchen/ai.tsx',
  'src/app/kitchen/index.tsx',
  'src/components/SetUpAiCard.tsx',
  'src/components/settings.tsx',
  'src/settings',
  'src/health/connectWizard.ts'
);

describe('no dead links in Settings, Connect and AI setup', () => {
  const targets = MY_FILES.flatMap((f) => navTargets(f).map((href) => [href, f] as const));

  it('finds the links these screens rely on', () => {
    const hrefs = targets.map(([h]) => h);
    for (const h of ['/settings/ai', '/connect', '/watch', '/coach', '/settings/profile', '/onboarding/profile?edit=1', '/settings']) {
      expect(hrefs).toContain(h);
    }
  });

  it.each(targets)('%s (in %s)', (href) => {
    expect(resolveRoute(href, routes)).not.toBeNull();
  });
});
