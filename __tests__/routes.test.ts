/**
 * No dead buttons anywhere: every navigation target written in src/ (call sites and any string
 * literal that looks like an app path) must resolve to a screen file under src/app.
 */
import { filesIn, navTargets, readSource, resolveRoute, routeExists, routeLiterals, screenRoutes, type ScreenRoute } from '../test-utils/routes';

const routes = screenRoutes();
const SRC = filesIn('src');

/** In-app-looking literals that are not routes (keep this list short and justified). */
const NOT_ROUTES = new Set<string>([]);

describe('route helper', () => {
  it('resolves groups, index files, dynamic segments and query strings', () => {
    const fake: ScreenRoute[] = [
      { file: 'a', segments: ['food', 'add'] },
      { file: 'b', segments: ['yoga', 'session', '[id]'] },
      { file: 'c', segments: ['yoga'] },
      { file: 'd', segments: [] },
    ];
    expect(routeExists('/(tabs)/yoga', fake)).toBe(true);
    expect(routeExists('/food/add?meal=lunch', fake)).toBe(true);
    expect(routeExists('/yoga/session/[id]', fake)).toBe(true);
    expect(routeExists('/yoga/session/${id}', fake)).toBe(true);
    expect(routeExists('/', fake)).toBe(true);
    expect(routeExists('/nope', fake)).toBe(false);
  });

  it('collects call sites and literals', () => {
    expect(navTargets('src/app/(tabs)/index.tsx')).toContain('/settings');
    expect(routeLiterals('src/app/(tabs)/index.tsx').length).toBeGreaterThan(0);
  });
});

describe('every navigation target in src/ exists', () => {
  const targets = SRC.flatMap((f) => [...new Set([...navTargets(f), ...routeLiterals(f)])].map((href) => [href, f] as const)).filter(
    ([h]) => !NOT_ROUTES.has(h)
  );

  it('scans the whole source tree and finds the targets the app relies on', () => {
    const hrefs = targets.map(([h]) => h);
    for (const h of ['/settings', '/settings/ai', '/connect', '/coach', '/weight', '/food', '/food/add', '/activity', '/activity/add', '/kitchen', '/(tabs)/trends', '/(tabs)/plan', '/watch']) {
      expect(hrefs).toContain(h);
    }
    expect(SRC.length).toBeGreaterThan(50);
  });

  it.each(targets)('%s (in %s)', (href) => {
    expect(resolveRoute(href, routes)).not.toBeNull();
  });

  it("nothing references the removed hidden tab '/(tabs)/settings'", () => {
    const offenders = SRC.filter((f) => /\/\(tabs\)\/settings\b/.test(readSource(f)));
    expect(offenders).toEqual([]);
  });

  it('the root stack registers settings and connect as stack routes', () => {
    const root = readSource('src/app/_layout.tsx');
    expect(root).toMatch(/<Stack\.Screen name="settings"/);
    expect(root).toMatch(/<Stack\.Screen name="connect\/index"/);
    expect(root).toMatch(/<Stack\.Screen name="connect\/\[appId\]"/);
  });

  it('no hidden tab (href: null) exists that something could navigate to', () => {
    const code = readSource('src/app/(tabs)/_layout.tsx').replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');
    expect(code).not.toMatch(/href:\s*null/);
    const tabs = [...code.matchAll(/<Tabs\.Screen\s+name="([^"]+)"/g)].map((m) => m[1]);
    expect(tabs).toEqual(['index', 'plan', 'yoga', 'cycle', 'trends']);
  });
});
