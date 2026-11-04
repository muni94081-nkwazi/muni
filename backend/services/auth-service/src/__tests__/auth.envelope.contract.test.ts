/**
 * auth.envelope.contract.test.ts
 *
 * One shape for every endpoint that hands back a session.
 *
 * register, login, refresh, exchange and 2fa/authenticate all answer with
 *
 *     { success: true, data: <payload> }
 *
 * Three of them used to answer bare and two enveloped, with nothing written
 * down saying which was which — so every client hardcoded a guess per endpoint,
 * and mobile got it wrong in both directions at once. Unwrapping `.data` on the
 * bare ones yielded `undefined` and broke login, registration and token refresh
 * simultaneously, while customer-web read them bare, worked, and hid it.
 *
 * A type cannot catch that: the wire is untyped, and both shapes are plain
 * objects. Only an assertion against a real response can, which is what this is
 * — the controllers are mounted on an Express app and driven over HTTP.
 *
 * Deliberately NOT asserted here: GET /users/me, GET /auth/providers, and the
 * admin/seller/gdpr controllers. Those are still mixed and were out of scope;
 * see the contract note at the top of auth.controller.ts. Adding them to this
 * file without changing them would just encode the inconsistency.
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';

process.env.GOOGLE_CLIENT_ID = 'test-client-id';
process.env.GOOGLE_CLIENT_SECRET = 'test-client-secret';
process.env.FRONTEND_REDIRECT_URL = 'https://muni.test/auth/callback';

// ─── Service layer, mocked ────────────────────────────────────────────────────
// The contract under test is the SHAPE of the response, not what produced it,
// so everything below the controller is stubbed to a known payload.

const session = {
  accessToken: 'access-abc',
  refreshToken: 'refresh-def',
  tokenType: 'Bearer' as const,
  expiresIn: 900,
  user: { id: 'user-1', email: 'shopper@example.com', roles: ['ROLE_CUSTOMER'] },
};

let loginResult: unknown = { status: 'AUTHENTICATED', ...session };

jest.unstable_mockModule('../services/auth.service.js', () => ({
  register: async () => session,
  login: async () => loginResult,
  refresh: async () => session,
  logout: async () => undefined,
  buildAuthResponse: async () => session,
  currentUser: async () => session.user,
  updateUser: async () => session.user,
  listUsers: async () => ({ users: [], total: 0, page: 1, limit: 20 }),
  changePassword: async () => undefined,
  forgotPassword: async () => undefined,
  resetPassword: async () => undefined,
}));

jest.unstable_mockModule('../db/prisma.js', () => ({
  prisma: {},
  connectDB: async () => undefined,
  disconnectDB: async () => undefined,
}));

jest.unstable_mockModule('../../../../shared/utils/token.js', () => ({
  createAccessToken: () => 'mock-access-token',
  createRefreshToken: () => 'mock-refresh-token',
  createMfaChallengeToken: (userId: string, purpose: string) => `mock:${purpose}:${userId}`,
  readMfaChallengeToken: () => ({ sub: 'user-1', purpose: 'verify' }),
  readAccessToken: () => ({ sub: 'user-1', roles: ['ROLE_CUSTOMER'] }),
  readRefreshToken: () => ({ sub: 'user-1', family: 'fam-1' }),
  ACCESS_TOKEN_TTL_SECONDS: 900,
}));

jest.unstable_mockModule('../repositories/twofactor.repository.js', () => ({
  twoFactorRepository: {
    find: async () => ({ secret: 'SECRET', enabled: true }),
    upsertSecret: async () => ({}),
    markEnabled: async () => ({}),
  },
}));

jest.unstable_mockModule('../repositories/user.repository.js', () => ({
  userRepository: {
    findById: async () => ({ ...session.user, active: true }),
    update: async () => session.user,
  },
}));

jest.unstable_mockModule('../../../../shared/security/totp.js', () => ({
  TOTPService: {
    verifyToken: () => true,
    generateSecret: () => ({ secret: 'S', otpauthUrl: 'otpauth://x' }),
  },
}));

jest.unstable_mockModule('../security/mfa-attempt.store.js', () => ({
  isLockedOut: async () => false,
  countFailedAttempt: async () => ({ locked: false, attempts: 1 }),
  clearAttempts: async () => undefined,
  burnCode: async () => true,
  MFA_MAX_ATTEMPTS: 5,
}));

// The exchange code the OAuth callback hands back. Redeemed once, like the
// real store.
let exchangePayload: unknown = { ...session, user: undefined };
jest.unstable_mockModule('../security/oauth-state.store.js', () => ({
  consumeExchangeCode: async (code?: string) => (code === 'good-code' ? exchangePayload : null),
  consumeHandshake: async () => null,
  createExchangeCode: async () => 'good-code',
  createPkcePair: () => ({ codeVerifier: 'v', codeChallenge: 'c' }),
  startHandshake: async () => 'nonce',
  OAUTH_STATE_COOKIE: 'oauth_state',
  OAUTH_HANDSHAKE_TTL_SEC: 600,
}));

const express = (await import('express')).default;
const request = (await import('supertest')).default;
const controller = await import('../controllers/auth.controller.js');
const totpController = await import('../controllers/totp.controller.js');
const { oauthRouter } = await import('../controllers/oauth.controller.js');

/**
 * The same mounting app.ts uses, minus everything irrelevant to the shape.
 * app.ts itself calls start() at module scope, so it cannot be imported into a
 * test — hence rebuilding the routes rather than reusing it.
 */
function makeApp() {
  const app = express();
  app.use(express.json());
  app.post('/api/v1/auth/register', controller.register);
  app.post('/api/v1/auth/login', controller.login);
  app.post('/api/v1/auth/refresh', controller.refresh);
  app.post('/api/v1/auth/2fa/authenticate', totpController.authenticate2FA);
  app.use('/api/v1', oauthRouter);
  return app;
}

/**
 * The assertion every case shares.
 *
 * `data` must be a non-null object: `{ success: true, data: undefined }` would
 * satisfy a naive `toHaveProperty('data')` while being exactly the bug this
 * guards — a client unwrapping `.data` and getting nothing.
 */
function expectEnvelope(body: unknown): Record<string, unknown> {
  expect(body).toMatchObject({ success: true });
  const data = (body as { data?: unknown }).data;
  expect(data).toBeDefined();
  expect(data).not.toBeNull();
  expect(typeof data).toBe('object');
  return data as Record<string, unknown>;
}

beforeEach(() => {
  loginResult = { status: 'AUTHENTICATED', ...session };
  exchangePayload = {
    accessToken: session.accessToken,
    refreshToken: session.refreshToken,
    tokenType: 'Bearer',
    expiresIn: 900,
  };
});

describe('every session endpoint answers { success, data }', () => {
  it('POST /auth/register', async () => {
    const res = await request(makeApp())
      .post('/api/v1/auth/register')
      .send({ firstName: 'A', lastName: 'B', email: 'a@b.com', password: 'Password1!aaaa' });

    expect(res.status).toBe(201);
    const data = expectEnvelope(res.body);
    expect(data).toMatchObject({ accessToken: 'access-abc', refreshToken: 'refresh-def' });
  });

  it('POST /auth/login — authenticated', async () => {
    const res = await request(makeApp())
      .post('/api/v1/auth/login')
      .send({ email: 'a@b.com', password: 'whatever' });

    expect(res.status).toBe(200);
    const data = expectEnvelope(res.body);
    expect(data).toMatchObject({ status: 'AUTHENTICATED', accessToken: 'access-abc' });
  });

  it('POST /auth/login — MFA_REQUIRED', async () => {
    // The branches that carry no tokens must still be enveloped, or a client
    // switching on `data.status` has to special-case them.
    loginResult = { status: 'MFA_REQUIRED', challengeToken: 'challenge-xyz' };

    const res = await request(makeApp())
      .post('/api/v1/auth/login')
      .send({ email: 'seller@b.com', password: 'whatever' });

    expect(res.status).toBe(200);
    const data = expectEnvelope(res.body);
    expect(data).toMatchObject({ status: 'MFA_REQUIRED', challengeToken: 'challenge-xyz' });
    expect(data).not.toHaveProperty('accessToken');
  });

  it('POST /auth/login — MFA_ENROLLMENT_REQUIRED', async () => {
    loginResult = { status: 'MFA_ENROLLMENT_REQUIRED', enrollmentToken: 'enrol-xyz' };

    const res = await request(makeApp())
      .post('/api/v1/auth/login')
      .send({ email: 'admin@b.com', password: 'whatever' });

    expect(res.status).toBe(200);
    const data = expectEnvelope(res.body);
    expect(data).toMatchObject({ status: 'MFA_ENROLLMENT_REQUIRED', enrollmentToken: 'enrol-xyz' });
    expect(data).not.toHaveProperty('accessToken');
  });

  it('POST /auth/refresh', async () => {
    const res = await request(makeApp())
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: 'refresh-def' });

    expect(res.status).toBe(200);
    const data = expectEnvelope(res.body);
    expect(data).toMatchObject({ accessToken: 'access-abc', refreshToken: 'refresh-def' });
  });

  it('POST /auth/exchange', async () => {
    const res = await request(makeApp())
      .post('/api/v1/auth/exchange')
      .send({ code: 'good-code' });

    expect(res.status).toBe(200);
    const data = expectEnvelope(res.body);
    expect(data).toMatchObject({ accessToken: 'access-abc', refreshToken: 'refresh-def' });
  });

  it('POST /auth/2fa/authenticate', async () => {
    const res = await request(makeApp())
      .post('/api/v1/auth/2fa/authenticate')
      .send({ challengeToken: 'challenge-xyz', token: '123456' });

    expect(res.status).toBe(200);
    const data = expectEnvelope(res.body);
    expect(data).toMatchObject({ accessToken: 'access-abc' });
  });
});

describe('the envelope is only for success', () => {
  it('a rejected exchange code answers a flat error, not { success, data }', async () => {
    // Errors keep the flat `{ message }` shape the terminal error handler and
    // the gateway's transformer both already understand. Enveloping those too
    // would be a second, larger migration across every error path.
    const res = await request(makeApp())
      .post('/api/v1/auth/exchange')
      .send({ code: 'already-spent' });

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('message');
    expect(res.body).not.toHaveProperty('data');
  });

  it('a missing exchange code is a 400, not an envelope', async () => {
    const res = await request(makeApp()).post('/api/v1/auth/exchange').send({});
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('message');
  });
});

describe('logout is exempt — it has no body to envelope', () => {
  it('answers 204 with nothing', async () => {
    const app = express();
    app.use(express.json());
    app.post('/api/v1/auth/logout', controller.logout);

    const res = await request(app).post('/api/v1/auth/logout').send({ refreshToken: 'r' });

    expect(res.status).toBe(204);
    expect(res.text).toBe('');
  });
});
