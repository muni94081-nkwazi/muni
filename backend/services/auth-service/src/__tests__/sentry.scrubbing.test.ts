/**
 * sentry.scrubbing.test.ts
 *
 * What is allowed to leave the process when an error is reported.
 *
 * Error tracking on an auth service is a data-exfiltration risk wearing a
 * helpful hat: the events it ships carry request headers, bodies and URLs, and
 * every one of those routinely holds a bearer token, a refresh token, a
 * password, a TOTP code or an OAuth exchange code. A scrubber that misses one
 * field posts a live credential to a third-party SaaS on every 500.
 *
 * These assertions are about the redaction, not about Sentry. They run against
 * the pure helpers rather than through the SDK, so they hold whether or not a
 * DSN is configured — which in this suite it never is.
 */
import { describe, it, expect } from '@jest/globals';
import { __testing, sentryEnabled } from '../../../../shared/observability/sentry.js';

const { scrub, scrubUrl, isSensitive } = __testing;

describe('isSensitive — which field names are treated as credentials', () => {
  it('catches the obvious ones regardless of casing or spelling', () => {
    for (const key of [
      'authorization', 'Authorization', 'AUTHORIZATION',
      'cookie', 'Cookie',
      'password', 'newPassword', 'currentPassword', 'passwordHash',
      'token', 'accessToken', 'refreshToken', 'refresh_token', 'challengeToken',
      'otp', 'secret', 'client_secret', 'code_verifier',
      'x-internal-identity', 'apiKey',
    ]) {
      expect(isSensitive(key)).toBe(true);
    }
  });

  it('leaves ordinary fields alone, or an event carries no useful detail', () => {
    for (const key of ['email', 'firstName', 'status', 'route', 'method', 'productId']) {
      expect(isSensitive(key)).toBe(false);
    }
  });
});

describe('scrub — request bodies and headers', () => {
  it('redacts a bearer token from headers', () => {
    const scrubbed = scrub({
      authorization: 'Bearer eyJhbGciOiJIUzI1NiJ9.real-token',
      'user-agent': 'Mozilla/5.0',
    }) as Record<string, string>;

    expect(scrubbed.authorization).toBe('[redacted]');
    expect(scrubbed['user-agent']).toBe('Mozilla/5.0');
  });

  it('redacts a login body without discarding the address that identifies it', () => {
    const scrubbed = scrub({
      email: 'shopper@example.com',
      password: 'hunter2-but-longer!',
    }) as Record<string, string>;

    expect(scrubbed.password).toBe('[redacted]');
    // The email is what makes the event actionable — it is the account the
    // error happened to, and it is not a credential.
    expect(scrubbed.email).toBe('shopper@example.com');
  });

  it('redacts nested values, not just top-level ones', () => {
    const scrubbed = scrub({
      request: { body: { refreshToken: 'live-refresh', page: 2 } },
    }) as { request: { body: Record<string, unknown> } };

    expect(scrubbed.request.body.refreshToken).toBe('[redacted]');
    expect(scrubbed.request.body.page).toBe(2);
  });

  it('walks arrays', () => {
    const scrubbed = scrub([{ otp: '123456' }, { productId: 'p1' }]) as Record<string, unknown>[];
    expect(scrubbed[0].otp).toBe('[redacted]');
    expect(scrubbed[1].productId).toBe('p1');
  });

  it('terminates on a deeply nested structure rather than recursing forever', () => {
    // Sentry payloads can be deep or cyclic, and an unbounded walk inside an
    // error handler is its own outage.
    let deep: Record<string, unknown> = { password: 'leaf' };
    for (let i = 0; i < 50; i++) deep = { nested: deep };

    expect(() => scrub(deep)).not.toThrow();
  });

  it('passes primitives and null through untouched', () => {
    expect(scrub('a string')).toBe('a string');
    expect(scrub(42)).toBe(42);
    expect(scrub(null)).toBeNull();
  });
});

describe('scrubUrl — credentials that ride in the query string', () => {
  it('redacts the OAuth exchange code', () => {
    // The whole point of the exchange-code change was to keep tokens out of
    // URLs. Reporting the URL verbatim would put the code straight back into a
    // third-party system.
    const scrubbed = scrubUrl('https://muni.ug/auth/callback?code=abc-123-def');
    expect(scrubbed).not.toContain('abc-123-def');
    expect(scrubbed).toContain('code=%5Bredacted%5D');
  });

  it('redacts the OAuth state nonce', () => {
    const scrubbed = scrubUrl('https://muni.ug/api/v1/auth/google/callback?state=nonce-xyz&code=c');
    expect(scrubbed).not.toContain('nonce-xyz');
  });

  it('redacts tokens from an older-style callback URL', () => {
    const scrubbed = scrubUrl(
      'https://muni.ug/auth/callback?access_token=at-live&refresh_token=rt-live',
    );
    expect(scrubbed).not.toContain('at-live');
    expect(scrubbed).not.toContain('rt-live');
  });

  it('keeps the path and the harmless params, or the event says nothing useful', () => {
    const scrubbed = scrubUrl('https://muni.ug/api/v1/products?limit=20&page=2');
    expect(scrubbed).toContain('/api/v1/products');
    expect(scrubbed).toContain('limit=20');
    expect(scrubbed).toContain('page=2');
  });

  it('handles a relative URL, which is what Express reports as req.url', () => {
    const scrubbed = scrubUrl('/auth/callback?code=abc');
    expect(scrubbed).toBe('/auth/callback?code=%5Bredacted%5D');
  });

  it('returns an unparseable value unchanged rather than throwing', () => {
    expect(() => scrubUrl('::::not a url::::')).not.toThrow();
  });
});

describe('opt-in behaviour', () => {
  it('stays disabled when no DSN is configured', () => {
    // The normal state in development, in CI, and in any deployment not using
    // Sentry. It must be a no-op, never a startup failure.
    expect(sentryEnabled()).toBe(false);
  });
});
