import { describe, expect, it } from 'vitest';
import { matchRoutes, type RouteObject } from 'react-router-dom';
import { router } from '@/router';
import { APP_LINKS, FOOTER_COLUMNS, LEGAL_LINKS, SOCIAL_LINKS, type FooterLink } from '../footer.config';

/**
 * The dead-link guard.
 *
 * Every internal footer destination is resolved against the application's real
 * route table, so a link to a page that does not exist fails here rather than
 * rendering a 404 for a shopper. It keeps working as the footer grows: adding
 * a link to footer.config.ts automatically puts it under test.
 */

const internalLinks: FooterLink[] = [
  ...FOOTER_COLUMNS.flatMap((column) => column.links),
  ...LEGAL_LINKS,
].filter((link) => !link.external);

const routes = router.routes as RouteObject[];

function resolves(path: string): boolean {
  const matches = matchRoutes(routes, path);
  if (!matches) return false;
  // The router ends in a `path: '*'` catch-all rendering NotFoundPage, so
  // "matched something" is not "resolved" — a path only the splat caught is dead.
  return !matches.every((match) => match.route.path === '*');
}

describe('footer links', () => {
  it('points every internal link at a route that exists', () => {
    const dead = internalLinks.filter((link) => !resolves(link.href));
    expect(dead.map((link) => `${link.label} → ${link.href}`)).toEqual([]);
  });

  it('recognises a path with no route as dead', () => {
    // Guards the guard: were `resolves` to start returning true for everything,
    // the assertion above would pass vacuously.
    expect(resolves('/definitely-not-a-real-route')).toBe(false);
  });

  it('marks every protected destination with requiresAuth', () => {
    // These sit behind PrivateRoute. The flag is what makes the footer open the
    // auth prompt instead of letting the router bounce a signed-out visitor to
    // /login with no explanation.
    const protectedPaths = ['/orders', '/dashboard', '/profile', '/checkout'];
    const unflagged = internalLinks.filter(
      (link) => protectedPaths.includes(link.href) && !link.requiresAuth,
    );
    expect(unflagged.map((link) => link.label)).toEqual([]);
  });

  it('gives every link a non-empty, unique label within its column', () => {
    for (const column of FOOTER_COLUMNS) {
      const labels = column.links.map((link) => link.label);
      expect(labels.every((label) => label.trim().length > 0)).toBe(true);
      expect(new Set(labels).size).toBe(labels.length);
    }
  });
});

describe('no placeholder URLs', () => {
  const PLACEHOLDER_HOSTS = [
    'facebook.com',
    'twitter.com',
    'x.com',
    'instagram.com',
    'linkedin.com',
    'wa.me',
    'example.com',
  ];

  it('configures no social channels while none are verified', () => {
    expect(SOCIAL_LINKS).toEqual([]);
  });

  it('configures no app-store links while the app is unpublished', () => {
    expect(APP_LINKS).toEqual([]);
  });

  it('rejects a bare-homepage social URL if one is ever added', () => {
    // The previous footer linked facebook.com / twitter.com / instagram.com /
    // linkedin.com and a wa.me placeholder number. This fails the suite if any
    // of them comes back.
    for (const link of SOCIAL_LINKS) {
      expect(link.url).toMatch(/^https:\/\//);
      const { hostname, pathname } = new URL(link.url);
      const bare = hostname.replace(/^www\./, '');
      const isBareHomepage =
        PLACEHOLDER_HOSTS.includes(bare) && pathname.replace(/\/$/, '') === '';
      expect(isBareHomepage).toBe(false);
    }
  });

  it('requires app-store URLs to be on a real store host', () => {
    for (const link of APP_LINKS) {
      expect(link.url).toMatch(/^https:\/\/(apps\.apple\.com|play\.google\.com)\//);
    }
  });
});
