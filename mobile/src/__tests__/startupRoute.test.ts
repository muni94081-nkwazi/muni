import { readFileSync } from 'fs';
import { resolve } from 'path';
import { sortRoutesWithInitial } from 'expo-router/build/sortRoutes';

/**
 * Guards the fix for "the app opens on login".
 *
 * There is no `app/index.tsx`, so the root stack's initial route is whichever
 * child sorts first. These reproduce expo-router's own comparator against the
 * real route names to show why `(auth)` won, and that the anchor is what
 * settles it.
 */

type SortableRoute = Parameters<ReturnType<typeof sortRoutesWithInitial>>[0];

// Only the three fields the comparator reads; a full RouteNode carries a
// loadRoute closure and a context key that are irrelevant to sorting.
const route = (name: string) =>
  ({ route: name, children: [], dynamic: null }) as unknown as SortableRoute;

const AUTH = route('(auth)');
const TABS = route('(tabs)');

describe('root route ordering', () => {
  it('cannot separate the two groups without an anchor', () => {
    // Both are groups, so both count as index-like; the comparator then falls
    // through to name length — and both names are exactly six characters.
    expect('(auth)'.length).toBe('(tabs)'.length);
    expect(sortRoutesWithInitial(undefined)(AUTH, TABS)).toBe(0);
  });

  it('leaves (auth) first when the sort is a tie, which is the bug', () => {
    // A stable sort keeps filesystem order on a 0, and (auth) comes first
    // there. Its layout lists `login` first, so login is what rendered.
    const sorted = [AUTH, TABS].sort(sortRoutesWithInitial(undefined));
    expect(sorted[0].route).toBe('(auth)');
  });

  it('puts (tabs) first once the anchor names it', () => {
    const sorted = [AUTH, TABS].sort(sortRoutesWithInitial('(tabs)'));
    expect(sorted[0].route).toBe('(tabs)');
  });

  it('still puts (tabs) first when the filesystem order is reversed', () => {
    const sorted = [TABS, AUTH].sort(sortRoutesWithInitial('(tabs)'));
    expect(sorted[0].route).toBe('(tabs)');
  });
});

describe('root layout anchor', () => {
  it('declares (tabs) as the anchor', () => {
    // Read as source rather than imported: evaluating the root layout would
    // pull in fonts, the splash screen and the whole provider tree, none of
    // which this assertion needs. If the export is ever dropped, the app
    // silently starts on login again.
    const source = readFileSync(resolve(__dirname, '../../app/_layout.tsx'), 'utf8');
    expect(source).toMatch(/export const unstable_settings\s*=\s*\{\s*anchor:\s*'\(tabs\)'\s*\}/);
  });
});
