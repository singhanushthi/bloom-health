/**
 * Route checks for "no dead buttons": collect every navigation target written in source files
 * (router.push/replace/navigate, href=, pathname:, route:) and resolve it against the
 * expo-router file tree under src/app.
 */
/* eslint-disable @typescript-eslint/no-require-imports */
// No @types/node in this project, so describe the few Node APIs used here.
interface Dirent {
  name: string;
  isDirectory(): boolean;
}
const fs = require('node:fs') as {
  readdirSync(dir: string, o: { withFileTypes: true }): Dirent[];
  readFileSync(file: string, enc: 'utf8'): string;
  statSync(p: string): { isDirectory(): boolean };
};
const path = require('node:path') as {
  join(...p: string[]): string;
  relative(from: string, to: string): string;
  sep: string;
};
declare const __dirname: string;

const APP_DIR = path.join(__dirname, '..', 'src', 'app');

function walk(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    return e.isDirectory() ? walk(p) : /\.(tsx?|jsx?)$/.test(e.name) ? [p] : [];
  });
}

/** Route patterns (segments) for every screen file, e.g. ['yoga', 'session', '[id]']. */
export function appRoutes(): string[][] {
  return walk(APP_DIR)
    .map((f) => path.relative(APP_DIR, f).replace(/\.(tsx?|jsx?)$/, '').split(path.sep))
    .filter((segs) => !segs[segs.length - 1].startsWith('_') && !segs[segs.length - 1].startsWith('+'))
    .map((segs) => segs.filter((s) => !/^\(.*\)$/.test(s)))
    .map((segs) => (segs[segs.length - 1] === 'index' ? segs.slice(0, -1) : segs));
}

const isDynamic = (s: string) => /^\[.*\]$/.test(s);

/** Does `/food/add?meal=x` (or `/(tabs)/yoga`, `/yoga/session/[id]`) resolve to a screen file? */
export function routeExists(href: string, routes = appRoutes()): boolean {
  const clean = href.split(/[?#]/)[0].replace(/\$\{[^}]*\}/g, '__param__');
  const segs = clean.split('/').filter(Boolean).filter((s) => !/^\(.*\)$/.test(s));
  return routes.some((r) => r.length === segs.length && r.every((s, i) => isDynamic(s) || s === segs[i]));
}

/** All literal navigation targets found in a source file. */
export function hrefsIn(file: string): string[] {
  const src = fs.readFileSync(file, 'utf8');
  const out = new Set<string>();
  const patterns = [
    /router\.(?:push|replace|navigate)\(\s*(['"`])(\/[^'"`]*)\1/g,
    /href=\{?\s*(['"`])(\/[^'"`]*)\1/g,
    /pathname:\s*(['"`])(\/[^'"`]*)\1/g,
    /route:\s*(['"`])(\/[^'"`]*)\1/g,
  ];
  for (const re of patterns) for (const m of src.matchAll(re)) out.add(m[2]);
  return [...out];
}

/** Every file under `dir` (recursive) or the file itself. */
export function sourceFiles(...entries: string[]): string[] {
  const root = path.join(__dirname, '..');
  return entries.flatMap((e) => {
    const p = path.join(root, e);
    return fs.statSync(p).isDirectory() ? walk(p) : [p];
  });
}
