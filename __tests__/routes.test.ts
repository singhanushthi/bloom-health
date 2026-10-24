/**
 * No dead buttons on Today and Plan: every navigation target written in their files (and the
 * shared cards they render) must resolve to a screen file under src/app.
 */
import { appRoutes, hrefsIn, routeExists, sourceFiles } from '../test-utils/routes';

const FILES = sourceFiles(
  'src/app/(tabs)/index.tsx',
  'src/app/(tabs)/plan.tsx',
  'src/components',
  'src/plan/ui',
  'src/yoga/TodayYogaCard.tsx',
  'src/cycle/TodayCycleCard.tsx',
  'src/watch/components.tsx',
  'src/kitchen/ui/KitchenEntryCard.tsx'
);

describe('route helper', () => {
  it('resolves groups, index files, dynamic segments and query strings', () => {
    const routes = [['food', 'add'], ['yoga', 'session', '[id]'], ['yoga'], []];
    expect(routeExists('/(tabs)/yoga', routes)).toBe(true);
    expect(routeExists('/food/add?meal=lunch', routes)).toBe(true);
    expect(routeExists('/yoga/session/[id]', routes)).toBe(true);
    expect(routeExists('/', routes)).toBe(true);
    expect(routeExists('/nope', routes)).toBe(false);
  });
});

describe('Today and Plan navigation targets exist', () => {
  const routes = appRoutes();
  const all = FILES.flatMap((f) => hrefsIn(f).map((href) => ({ f, href })));

  it('finds the targets Today and Plan rely on', () => {
    const hrefs = all.map((x) => x.href);
    for (const h of ['/settings', '/coach', '/weight', '/food', '/food/add', '/activity', '/activity/add', '/kitchen', '/(tabs)/trends']) {
      expect(hrefs).toContain(h);
    }
  });

  it.each(FILES.flatMap((f) => hrefsIn(f).map((href) => [href, f.replace(/.*bloom-health\//, '')])))('%s (in %s)', (href) => {
    expect(routeExists(href, routes)).toBe(true);
  });
});
