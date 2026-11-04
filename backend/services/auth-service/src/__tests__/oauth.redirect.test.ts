/**
 * oauth.redirect.test.ts
 *
 * What a social login is allowed to turn into.
 *
 * Two boundaries are covered here, both of which the OAuth path used to cross
 * without checking:
 *
 *   1. Where a completed login is sent. `state` is reflected back verbatim by
 *      the provider and is therefore attacker-controllable, and the redirect
 *      carries a live access and refresh token — so what counts as an
 *      acceptable target is a security boundary in its own right.
 *
 *   2. Whether a session may be issued at all. The password path refuses a
 *      deactivated account and refuses a privileged account with no second
 *      factor; the OAuth path did neither, so "Continue with Google" was a way
 *      around both. It also linked a provider identity to any pre-existing
 *      account bearing the same address, verified or not.
 *
 * ESM note: as elsewhere in this suite, module mocking uses
 * jest.unstable_mockModule before a dynamic import of the module under test.
 * oauth.service reads its provider configuration into module-level constants at
 * import time, so process.env must be set before that import too.
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';

// ─── Environment, before the module under test reads it ───────────────────────
process.env.GOOGLE_CLIENT_ID = 'test-client-id';
process.env.GOOGLE_CLIENT_SECRET = 'test-client-secret';
process.env.FRONTEND_REDIRECT_URL = 'https://muni.test/auth/callback';

// ─── Fake database ────────────────────────────────────────────────────────────
// Hand-rolled rather than a mocking library: the assertions are about which
// branch was taken, so the fixtures need to be readable at a glance.

interface FakeUser {
  id: string;
  email: string;
  roles: string[];
  active: boolean;
  firstName: string;
  lastName: string;
  emailVerified: boolean;
}

const db = {
  users: [] as FakeUser[],
  oauthAccounts: [] as { id: string; provider: string; providerUserId: string; userId: string }[],
  createdUsers: [] as FakeUser[],
  updatedUsers: [] as { id: string; data: Record<string, unknown> }[],
};

const prismaMock = {
  oAuthAccount: {
    findUnique: jest.fn(async ({ where }: never) => {
      const key = (where as { provider_providerUserId: { provider: string; providerUserId: string } })
        .provider_providerUserId;
      const row = db.oauthAccounts.find(
        (a) => a.provider === key.provider && a.providerUserId === key.providerUserId,
      );
      if (!row) return null;
      return { ...row, user: db.users.find((u) => u.id === row.userId) ?? null };
    }),
    update: jest.fn(async () => ({})),
    create: jest.fn(async () => ({})),
  },
  user: {
    findUnique: jest.fn(async ({ where }: never) => {
      const { email, id } = where as { email?: string; id?: string };
      return db.users.find((u) => (email ? u.email === email : u.id === id)) ?? null;
    }),
    create: jest.fn(async ({ data }: never) => {
      const user = data as FakeUser;
      db.users.push(user);
      db.createdUsers.push(user);
      return user;
    }),
    update: jest.fn(async ({ where, data }: never) => {
      db.updatedUsers.push({ id: (where as { id: string }).id, data: data as Record<string, unknown> });
      return {};
    }),
  },
  refreshToken: {
    deleteMany: jest.fn(async () => ({ count: 0 })),
    create: jest.fn(async () => ({})),
  },
};

jest.unstable_mockModule('../db/prisma.js', () => ({
  prisma: prismaMock,
  connectDB: () => Promise.resolve(),
  disconnectDB: () => Promise.resolve(),
}));

jest.unstable_mockModule('../../../../shared/utils/token.js', () => ({
  createAccessToken: (_userId: string, _roles: string[]) => 'mock-access-token',
  createRefreshToken: (_userId: string, _family: string) => 'mock-refresh-token',
  createMfaChallengeToken: (userId: string, purpose: string) => `mock-challenge:${purpose}:${userId}`,
  ACCESS_TOKEN_TTL_SECONDS: 900,
}));

// Mocked at the shared module oauth.service now imports directly. It used to
// go through a services/security.service.js re-export that added no behaviour;
// that indirection is gone, so the mock points at the real source.
jest.unstable_mockModule('../../../../shared/security/security-core.js', () => ({
  encryptPII: (value: string) => value,
  encryptNullable: (value: string | null) => value,
}));

// Whether the account under test has a confirmed second factor. Set per test.
let twoFactorRow: { enabled: boolean } | null = null;
jest.unstable_mockModule('../repositories/twofactor.repository.js', () => ({
  twoFactorRepository: { find: async () => twoFactorRow },
}));

const { appReturnUrl, handleGoogleCallback } = await import('../services/oauth.service.js');
// Not mocked: with no REDIS_URL reachable the store falls back to its
// in-process map, which is exactly the behaviour under test here — a code is
// written, readable once, and gone afterwards.
const { consumeExchangeCode, consumeHandshake, startHandshake, createPkcePair } =
  await import('../security/oauth-state.store.js');

// ─── Google handshake, faked at the network boundary ──────────────────────────
//
// exchangeCode makes exactly two calls: POST for the token, GET for the
// profile. Faking `fetch` rather than the whole function keeps the real
// request-building and error-handling in the path under test.

function mockGoogleHandshake(profile: Record<string, unknown>): void {
  global.fetch = jest.fn(async (url: unknown) => {
    if (String(url).includes('oauth2.googleapis.com/token')) {
      return { ok: true, json: async () => ({ access_token: 'google-access' }) } as never;
    }
    return { ok: true, json: async () => profile } as never;
  }) as never;
}

/** A Google profile for a returning user, verified unless told otherwise. */
function googleProfile(overrides: Record<string, unknown> = {}) {
  return {
    sub: 'google-sub-1',
    email: 'shopper@example.com',
    email_verified: true,
    name: 'Ada Shopper',
    given_name: 'Ada',
    family_name: 'Shopper',
    picture: 'https://example.com/a.png',
    ...overrides,
  };
}

function seedUser(overrides: Partial<FakeUser> = {}): FakeUser {
  const user: FakeUser = {
    id: 'user-1',
    email: 'shopper@example.com',
    roles: ['ROLE_CUSTOMER'],
    active: true,
    firstName: 'Ada',
    lastName: 'Shopper',
    emailVerified: true,
    ...overrides,
  };
  db.users.push(user);
  return user;
}

/** Link the seeded user to the Google identity, so linking is not re-tested. */
function seedLinkedGoogleAccount(userId: string): void {
  db.oauthAccounts.push({ id: 'oauth-1', provider: 'google', providerUserId: 'google-sub-1', userId });
}

beforeEach(() => {
  db.users = [];
  db.oauthAccounts = [];
  db.createdUsers = [];
  db.updatedUsers = [];
  twoFactorRow = null;
  jest.clearAllMocks();
});

// ══════════════════════════════════════════════════════════════════════════════
// 1. Redirect target
// ══════════════════════════════════════════════════════════════════════════════

describe('appReturnUrl — accepted app schemes', () => {
  it('accepts the release build deep link', () => {
    expect(appReturnUrl('muni://auth/callback')?.toString()).toBe('muni://auth/callback');
  });

  it('accepts an Expo Go link, so the flow is testable in development', () => {
    const url = appReturnUrl('exp://192.168.1.5:8081/--/auth/callback');
    expect(url).not.toBeNull();
    expect(url?.protocol).toBe('exp:');
  });

  it('accepts a dev-client scheme', () => {
    expect(appReturnUrl('exp+muni://auth/callback')).not.toBeNull();
  });

  it('matches the scheme case-insensitively', () => {
    expect(appReturnUrl('MUNI://auth/callback')).not.toBeNull();
  });
});

describe('appReturnUrl — everything else falls back to the web app', () => {
  it('returns null when no state was sent, which is the browser flow', () => {
    expect(appReturnUrl(undefined)).toBeNull();
    expect(appReturnUrl('')).toBeNull();
  });

  it('refuses an arbitrary https target — tokens would leave with the redirect', () => {
    expect(appReturnUrl('https://evil.example.com/collect')).toBeNull();
  });

  it('refuses a javascript: URL', () => {
    expect(appReturnUrl('javascript:alert(1)')).toBeNull();
  });

  it('refuses a scheme that merely starts like ours', () => {
    expect(appReturnUrl('munixyz://auth/callback')).toBeNull();
    expect(appReturnUrl('https://muni.example.com')).toBeNull();
  });

  it('refuses a plain return path, which older callers passed as state', () => {
    expect(appReturnUrl('/dashboard')).toBeNull();
  });

  it('refuses a value that matches the scheme but will not parse as a URL', () => {
    expect(appReturnUrl('muni://[')).toBeNull();
    expect(appReturnUrl('muni://a b')).toBeNull();
  });

  it('still accepts a bare app scheme — it is our own, so there is nothing to leak', () => {
    expect(appReturnUrl('muni://')).not.toBeNull();
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// 2. Whether a session may be issued
// ══════════════════════════════════════════════════════════════════════════════

describe('OAuth login — account status and second factor', () => {
  it('issues a session for an ordinary active customer with no second factor', async () => {
    const user = seedUser();
    seedLinkedGoogleAccount(user.id);
    mockGoogleHandshake(googleProfile());

    const result = await handleGoogleCallback('auth-code');

    expect(result.status).toBe('AUTHENTICATED');
    if (result.status !== 'AUTHENTICATED') throw new Error('unreachable');
    expect(result.expiresIn).toBe(900);

    // The tokens exist, but they travel behind a one-time code rather than in
    // the redirect's query string — a URL is logged, kept in history, and sent
    // as a Referer, so it is not a channel for live credentials.
    expect(result.accessToken).toBe('mock-access-token');
    expect(result.redirectUrl).not.toContain('access_token');
    expect(result.redirectUrl).not.toContain('refresh_token');
    expect(result.redirectUrl).not.toContain('mock-access-token');
    expect(result.redirectUrl).toMatch(/[?&]code=[0-9a-f-]{36}/);
  });

  it('mints a code redeemable exactly once', async () => {
    const user = seedUser();
    seedLinkedGoogleAccount(user.id);
    mockGoogleHandshake(googleProfile());

    const result = await handleGoogleCallback('auth-code');
    const code = new URL(result.redirectUrl).searchParams.get('code');
    expect(code).toBeTruthy();

    const first = await consumeExchangeCode(code ?? undefined);
    expect(first).toMatchObject({ accessToken: 'mock-access-token', expiresIn: 900 });

    // A replayed callback URL — out of history, a log, or a Referer — buys
    // nothing, because the code behind it is already spent.
    expect(await consumeExchangeCode(code ?? undefined)).toBeNull();
  });

  it('records lastLoginAt, so a social login is not invisible', async () => {
    const user = seedUser();
    seedLinkedGoogleAccount(user.id);
    mockGoogleHandshake(googleProfile());

    await handleGoogleCallback('auth-code');

    expect(db.updatedUsers).toHaveLength(1);
    expect(db.updatedUsers[0]).toMatchObject({ id: 'user-1' });
    expect(db.updatedUsers[0]?.data).toHaveProperty('lastLoginAt');
  });

  it('refuses a deactivated account instead of signing it back in', async () => {
    const user = seedUser({ active: false });
    seedLinkedGoogleAccount(user.id);
    mockGoogleHandshake(googleProfile());

    const result = await handleGoogleCallback('auth-code');

    expect(result.status).toBe('ACCOUNT_DISABLED');
    expect(result.redirectUrl).toContain('/auth/error');
    expect(result.redirectUrl).toContain('reason=account_disabled');
    // The whole point: no session was minted on the way to that redirect.
    expect(result.redirectUrl).not.toContain('access_token');
    expect(prismaMock.refreshToken.create).not.toHaveBeenCalled();
  });

  it('demands the second factor when one is enrolled, rather than skipping it', async () => {
    const user = seedUser();
    seedLinkedGoogleAccount(user.id);
    twoFactorRow = { enabled: true };
    mockGoogleHandshake(googleProfile());

    const result = await handleGoogleCallback('auth-code');

    expect(result.status).toBe('MFA_REQUIRED');
    expect(result.redirectUrl).toContain('/auth/2fa/challenge');
    expect(result.redirectUrl).toContain('token=mock-challenge%3Averify%3Auser-1');
    expect(result.redirectUrl).not.toContain('access_token');
    expect(prismaMock.refreshToken.create).not.toHaveBeenCalled();
  });

  it('sends a seller with no second factor to enrolment, not to a session', async () => {
    // The case that made this a bypass: ROLE_SELLER is in MFA_REQUIRED_ROLES,
    // so the password path refuses to issue tokens without a factor. Google
    // must not be a way around that.
    const user = seedUser({ roles: ['ROLE_SELLER'] });
    seedLinkedGoogleAccount(user.id);
    mockGoogleHandshake(googleProfile());

    const result = await handleGoogleCallback('auth-code');

    expect(result.status).toBe('MFA_ENROLLMENT_REQUIRED');
    expect(result.redirectUrl).toContain('enrollment_token=mock-challenge%3Aenrol%3Auser-1');
    expect(result.redirectUrl).not.toContain('access_token');
    expect(prismaMock.refreshToken.create).not.toHaveBeenCalled();
  });

  it('applies the same rule to an admin', async () => {
    const user = seedUser({ roles: ['ROLE_ADMIN'] });
    seedLinkedGoogleAccount(user.id);
    mockGoogleHandshake(googleProfile());

    const result = await handleGoogleCallback('auth-code');

    expect(result.status).toBe('MFA_ENROLLMENT_REQUIRED');
  });

  it('lets a seller through once the factor is actually enrolled and confirmed', async () => {
    const user = seedUser({ roles: ['ROLE_SELLER'] });
    seedLinkedGoogleAccount(user.id);
    twoFactorRow = { enabled: true };
    mockGoogleHandshake(googleProfile());

    const result = await handleGoogleCallback('auth-code');

    // Enrolled, so not the enrolment branch — but still a challenge, never a
    // session straight from the provider.
    expect(result.status).toBe('MFA_REQUIRED');
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// 3. The state nonce — is this a callback we started?
// ══════════════════════════════════════════════════════════════════════════════

describe('OAuth state nonce', () => {
  it('redeems a handshake it minted, and returns what was stored against it', async () => {
    const { codeVerifier } = createPkcePair();
    const nonce = await startHandshake({
      provider: 'google',
      codeVerifier,
      returnTo: 'muni://auth/callback',
      browserBound: false,
    });

    const handshake = await consumeHandshake(nonce);
    expect(handshake).toMatchObject({
      provider: 'google',
      codeVerifier,
      returnTo: 'muni://auth/callback',
    });
  });

  it('refuses a nonce it never minted — the login-CSRF case', async () => {
    // A callback nobody here started: an attacker completing their own consent
    // flow against a victim's browser, so the victim silently ends up in the
    // attacker's account.
    expect(await consumeHandshake('not-a-nonce-we-issued')).toBeNull();
  });

  it('refuses a missing nonce rather than falling through', async () => {
    expect(await consumeHandshake(undefined)).toBeNull();
    expect(await consumeHandshake('')).toBeNull();
  });

  it('refuses a nonce a second time — a callback cannot be replayed', async () => {
    const { codeVerifier } = createPkcePair();
    const nonce = await startHandshake({
      provider: 'google', codeVerifier, returnTo: null, browserBound: true,
    });

    expect(await consumeHandshake(nonce)).not.toBeNull();
    expect(await consumeHandshake(nonce)).toBeNull();
  });

  it('derives an S256 challenge that is not the verifier itself', async () => {
    const { codeVerifier, codeChallenge } = createPkcePair();
    expect(codeVerifier).not.toBe(codeChallenge);
    // base64url — no padding, no +/ characters that would break in a query.
    expect(codeChallenge).toMatch(/^[A-Za-z0-9_-]+$/);
    // Distinct per call, or it would not bind one flow to one client.
    expect(createPkcePair().codeVerifier).not.toBe(codeVerifier);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// 4. Linking a provider identity to an existing account
// ══════════════════════════════════════════════════════════════════════════════

describe('OAuth account linking — email verification', () => {
  it('links to an existing account when the provider verified the address', async () => {
    seedUser({ id: 'existing-1' });   // same email, no Google link yet
    mockGoogleHandshake(googleProfile({ email_verified: true }));

    const result = await handleGoogleCallback('auth-code');

    expect(result.status).toBe('AUTHENTICATED');
    expect(prismaMock.oAuthAccount.create).toHaveBeenCalled();
    // Adopted the existing row rather than creating a second account.
    expect(db.createdUsers).toHaveLength(0);
  });

  it('refuses to adopt an existing account on an unverified address', async () => {
    // The takeover: anyone able to present a provider identity carrying a MUNI
    // user's address would otherwise inherit that user's account and roles.
    seedUser({ id: 'existing-1' });
    mockGoogleHandshake(googleProfile({ email_verified: false }));

    const result = await handleGoogleCallback('auth-code');

    expect(result.status).toBe('UNVERIFIED_EMAIL');
    expect(result.redirectUrl).toContain('reason=unverified_email');
    expect(result.redirectUrl).not.toContain('access_token');
    expect(prismaMock.oAuthAccount.create).not.toHaveBeenCalled();
    expect(prismaMock.refreshToken.create).not.toHaveBeenCalled();
  });

  it('still creates a new account on an unverified address nobody else holds', async () => {
    // Nothing to take over, so there is nothing to refuse — the address simply
    // lands unverified on a brand-new record.
    mockGoogleHandshake(googleProfile({ email_verified: false }));

    const result = await handleGoogleCallback('auth-code');

    expect(result.status).toBe('AUTHENTICATED');
    expect(db.createdUsers).toHaveLength(1);
    expect(db.createdUsers[0]?.emailVerified).toBe(false);
  });

  it('skips the email check entirely once the provider identity is already linked', async () => {
    // Identity is proven by the provider's stable subject id at that point, so
    // the address it happens to report is not what authorises the session.
    const user = seedUser();
    seedLinkedGoogleAccount(user.id);
    mockGoogleHandshake(googleProfile({ email_verified: false }));

    const result = await handleGoogleCallback('auth-code');

    expect(result.status).toBe('AUTHENTICATED');
  });
});
