/**
 * Resolve an expo-router href to a screen file under src/app (Jest only).
 * Handles route groups "(tabs)", index files, dynamic "[param]" segments, query strings and
 * template placeholders (`/connect/${id}`). Layouts (_layout) and special files (+not-found) are
 * not screens.
 */
// Typed locally: the project doesn't ship Node type definitions.
declare const __dirname: string;
// eslint-disable-next-line @typescript-eslint/no-require-imports
const fs = require('fs') as {
  readdirSync(p: string, o: { withFileTypes: true }): { name: string; isDirectory(): boolean }[];
  readFileSync(p: string, enc: 'utf8'): string;
  statSync(p: string): { isDirectory(): boolean };
};
// eslint-disable-next-line @typescript-eslint/no-require-imports
const path = require('path') as { join(...p: string[]): string; relative(a: string, b: string): string; sep: string };

export const ROOT = path.join(__dirname, '..');
const APP_DIR = path.join(ROOT, 'src', 'app');

function walk(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    return e.isDirectory() ? walk(p) : /\.tsx?$/.test(e.name) ? [p] : [];
  });
}

export interface ScreenRoute {
  file: string;
  /** URL segments with groups removed and a trailing "index" dropped. */
  segments: string[];
}

export function screenRoutes(): ScreenRoute[] {
  return walk(APP_DIR)
    .map((file) => ({ file, segs: path.relative(APP_DIR, file).replace(/\.tsx?$/, '').split(path.sep) }))
    .filter(({ segs }) => !/^[_+]/.test(segs[segs.length - 1]))
    .map(({ file, segs }) => {
      const s = segs.filter((x) => !/^\(.*\)$/.test(x));
      return { file, segments: s[s.length - 1] === 'index' ? s.slice(0, -1) : s };
    });
}

const dynamic = (s: string) => /^\[.+\]$/.test(s);

/** The screen file an href opens, or null. */
export function resolveRoute(href: string, routes: ScreenRoute[] = screenRoutes()): string | null {
  const clean = href.split(/[?#]/)[0].replace(/\$\{[^}]*\}/g, ':param');
  const segs = clean.split('/').filter(Boolean).filter((s) => !/^\(.*\)$/.test(s));
  // Prefer a static match over a dynamic one (expo-router does the same).
  const candidates = routes.filter((r) => r.segments.length === segs.length && r.segments.every((s, i) => dynamic(s) || s === segs[i]));
  candidates.sort((a, b) => a.segments.filter(dynamic).length - b.segments.filter(dynamic).length);
  return candidates[0]?.file ?? null;
}

/** Literal navigation targets in a source file: router.push/replace/navigate, href=, route:. */
export function navTargets(relFile: string): string[] {
  const src = fs.readFileSync(path.join(ROOT, relFile), 'utf8');
  const out = new Set<string>();
  const patterns = [
    /router\.(?:push|replace|navigate)\(\s*(['"`])(\/[^'"`]*)\1/g,
    /href=\{?\s*(['"`])(\/[^'"`]*)\1/g,
    /route:\s*(['"`])(\/[^'"`]*)\1/g,
    /fallback=\{?\s*(['"`])(\/[^'"`]*)\1/g,
    /goBack\(\s*(['"`])(\/[^'"`]*)\1/g,
  ];
  for (const re of patterns) for (const m of src.matchAll(re)) out.add(m[2]);
  return [...out];
}

/** Files under a directory (relative to the repo root), or the file itself. */
export function filesIn(...entries: string[]): string[] {
  return entries.flatMap((e) => {
    const p = path.join(ROOT, e);
    return fs.statSync(p).isDirectory() ? walk(p).map((f) => path.relative(ROOT, f)) : [e];
  });
}
