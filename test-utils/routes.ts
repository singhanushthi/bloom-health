/**
 * Route checks for "no dead buttons" (Jest only).
 *
 * Resolves an expo-router href to a screen file under src/app, handling route groups "(tabs)",
 * index files, dynamic "[param]" segments, query strings and template placeholders
 * (`/connect/${id}`). Layouts (_layout) and special files (+not-found) are not screens.
 *
 * Two ways to collect targets from source:
 *  - navTargets: navigation call sites (router.push/replace/navigate, href=, pathname:, route:,
 *    url:, fallback=, goBack()).
 *  - routeLiterals: every string literal that looks like an app path ('/x', "/x", `/x/${y}`),
 *    so a target stored in a constant or object is checked too.
 */
/* eslint-disable @typescript-eslint/no-require-imports */
// The project doesn't ship Node type definitions, so describe the few Node APIs used here.
declare const __dirname: string;
interface Dirent {
  name: string;
  isDirectory(): boolean;
}
const fs = require('fs') as {
  readdirSync(p: string, o: { withFileTypes: true }): Dirent[];
  readFileSync(p: string, enc: 'utf8'): string;
  statSync(p: string): { isDirectory(): boolean };
};
const path = require('path') as {
  join(...p: string[]): string;
  relative(from: string, to: string): string;
  sep: string;
};

export const ROOT = path.join(__dirname, '..');
const APP_DIR = path.join(ROOT, 'src', 'app');
const SOURCE = /\.(tsx?|jsx?)$/;

function walk(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    return e.isDirectory() ? walk(p) : SOURCE.test(e.name) ? [p] : [];
  });
}

const toPosix = (p: string): string => p.split(path.sep).join('/');

export interface ScreenRoute {
  /** Repo-relative path of the screen file, e.g. "src/app/settings/ai.tsx". */
  file: string;
  /** URL segments with groups removed and a trailing "index" dropped. */
  segments: string[];
}

/** Every screen file under src/app with its URL pattern. */
export function screenRoutes(): ScreenRoute[] {
  return walk(APP_DIR)
    .map((abs) => ({ abs, segs: path.relative(APP_DIR, abs).replace(SOURCE, '').split(path.sep) }))
    .filter(({ segs }) => !/^[_+]/.test(segs[segs.length - 1]))
    .map(({ abs, segs }) => {
      const s = segs.filter((x) => !/^\(.*\)$/.test(x));
      return { file: toPosix(path.relative(ROOT, abs)), segments: s[s.length - 1] === 'index' ? s.slice(0, -1) : s };
    });
}

const isDynamic = (s: string): boolean => /^\[.+\]$/.test(s);

/** The repo-relative screen file an href opens, or null. Static matches win over dynamic ones. */
export function resolveRoute(href: string, routes: ScreenRoute[] = screenRoutes()): string | null {
  const clean = href.split(/[?#]/)[0].replace(/\$\{[^}]*\}/g, ':param');
  const segs = clean.split('/').filter(Boolean).filter((s) => !/^\(.*\)$/.test(s));
  const candidates = routes.filter(
    (r) => r.segments.length === segs.length && r.segments.every((s, i) => isDynamic(s) || s === segs[i])
  );
  candidates.sort((a, b) => a.segments.filter(isDynamic).length - b.segments.filter(isDynamic).length);
  return candidates[0]?.file ?? null;
}

export function routeExists(href: string, routes: ScreenRoute[] = screenRoutes()): boolean {
  return resolveRoute(href, routes) !== null;
}

function read(relFile: string): string {
  return fs.readFileSync(path.join(ROOT, relFile), 'utf8');
}

/** Literal targets at navigation call sites in a repo-relative source file. */
export function navTargets(relFile: string): string[] {
  const src = read(relFile);
  const out = new Set<string>();
  const patterns = [
    /router\.(?:push|replace|navigate|dismissTo)\(\s*(['"`])(\/[^'"`]*)\1/g,
    /href=\{?\s*(['"`])(\/[^'"`]*)\1/g,
    /href:\s*(['"`])(\/[^'"`]*)\1/g,
    /pathname:\s*(['"`])(\/[^'"`]*)\1/g,
    /route:\s*(['"`])(\/[^'"`]*)\1/g,
    /url:\s*(['"`])(\/[^'"`]*)\1/g,
    /fallback=\{?\s*(['"`])(\/[^'"`]*)\1/g,
    /goBack\(\s*(['"`])(\/[^'"`]*)\1/g,
  ];
  for (const re of patterns) for (const m of src.matchAll(re)) out.add(m[2]);
  return [...out];
}

/** Every string literal in a file that looks like an in-app path ("/food/add", `/yoga/${id}`). */
export function routeLiterals(relFile: string): string[] {
  const src = read(relFile);
  const out = new Set<string>();
  for (const m of src.matchAll(/(['"`])(\/[a-z(][^'"`\s]*)\1/g)) {
    // Skip comment-ish and URL fragments like "//" or "/v1beta/…" API paths would land here too;
    // callers can allowlist those.
    if (!m[2].startsWith('//')) out.add(m[2]);
  }
  return [...out];
}

/** Repo-relative source files under a directory (recursive), or the file itself. */
export function filesIn(...entries: string[]): string[] {
  return entries.flatMap((e) => {
    const p = path.join(ROOT, e);
    return fs.statSync(p).isDirectory() ? walk(p).map((f) => toPosix(path.relative(ROOT, f))) : [e];
  });
}

/** Read a repo-relative file (for source assertions in tests). */
export function readSource(relFile: string): string {
  return read(relFile);
}
