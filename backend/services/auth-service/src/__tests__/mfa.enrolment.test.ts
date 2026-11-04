/**
 * mfa.enrolment.test.ts
 *
 * Mandatory 2FA enrolment must be completable.
 *
 * login() returns MFA_ENROLLMENT_REQUIRED with an `enrol` challenge token when
 * an account (a newly-approved seller, say) may not have a session until it has
 * a second factor. That token is `type: 'mfa_challenge'`, but the enrolment
 * routes sat behind `requireUser`, which accepts only `type: 'access'` — so the
 * only credential the caller held was rejected by the only endpoints that could
 * clear the requirement. Enrolment was impossible and the account was stranded:
 * approved as a seller, unable to sign in.
 *
 * These use the REAL token module — signing, verification, issuer, audience,
 * expiry and purpose all genuine — because the whole point is what the token
 * layer accepts. A mocked reader would assert nothing about that.
 *
 * The security properties pinned here are as important as the fix:
 *   • an enrol token unlocks enrolment and NOTHING else
 *   • it cannot enrol a different account
 *   • it does not grant roles, and does not become a session
 *   • a `verify` challenge cannot be swapped in for an `enrol` one
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';

process.env.JWT_ACCESS_SECRET = 'test-access-secret-at-least-32-characters-long';
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-at-least-32-characters-long';
process.env.INTERNAL_IDENTITY_SECRET = 'test-internal-identity-secret-32-chars-plus';

let totpValid = true;
jest.unstable_mockModule('../../../../shared/security/totp.js', () => ({
  TOTPService: {
    verifyToken: () => totpValid,
    generateSecret: () => ({ secret: 'SYNTHETIC-SECRET', otpauthUrl: 'otpauth://totp/x' }),
  },
}));

let twoFactorRow: { secret: string; enabled: boolean } | null = null;
const enabledFor: string[] = [];
const secretWrittenFor: string[] = [];
jest.unstable_mockModule('../repositories/twofactor.repository.js', () => ({
  twoFactorRepository: {
    find: async () => twoFactorRow,
    upsertSecret: async (userId: string) => { secretWrittenFor.push(userId); return {}; },
    markEnabled: async (userId: string) => { enabledFor.push(userId); return {}; },
  },
}));

const USERS: Record<string, { id: string; email: string; roles: string[]; active: boolean }> = {
  'seller-A': { id: 'seller-A', email: 'a@example.test', roles: ['ROLE_CUSTOMER', 'ROLE_SELLER'], active: true },
  'seller-B': { id: 'seller-B', email: 'b@example.test', roles: ['ROLE_CUSTOMER', 'ROLE_SELLER'], active: true },
};
jest.unstable_mockModule('../repositories/user.repository.js', () => ({
  userRepository: {
    findById: async (id: string) => USERS[id] ?? null,
    update: async () => USERS['seller-A'],
  },
}));

jest.unstable_mockModule('../services/auth.service.js', () => ({
  buildAuthResponse: async () => ({
    accessToken: 'access-abc', refreshToken: 'refresh-def',
    tokenType: 'Bearer', expiresIn: 900,
    user: { id: 'seller-A', email: 'a@example.test', roles: ['ROLE_SELLER'] },
  }),
}));

jest.unstable_mockModule('../security/mfa-attempt.store.js', () => ({
  isLockedOut: async () => false,
  countFailedAttempt: async () => ({ attempts: 1 }),
  clearAttempts: async () => undefined,
  burnCode: async () => true,
  MFA_MAX_ATTEMPTS: 5,
}));

jest.unstable_mockModule('../db/prisma.js', () => ({
  prisma: {}, connectDB: async () => undefined, disconnectDB: async () => undefined,
}));

const express = (await import('express')).default;
const request = (await import('supertest')).default;
const jwt = (await import('jsonwebtoken')).default;
// The real thing — not mocked. This is the layer under test.
const { createMfaChallengeToken, createAccessToken } =
  await import('../../../../shared/utils/token.js');
const totpController = await import('../controllers/totp.controller.js');
const { adminRouter } = await import('../controllers/admin.controller.js');
const { sellerRouter } = await import('../controllers/seller.controller.js');

/** Mounted exactly as app.ts mounts them — no requireUser on enrolment. */
function makeApp() {
  const app = express();
  app.use(express.json());
  app.post('/api/v1/auth/2fa/generate', totpController.generate2FASecret);
  app.post('/api/v1/auth/2fa/verify', totpController.verify2FASecret);
  // Two unrelated protected surfaces, to prove the enrol token reaches neither.
  app.use('/api/v1', sellerRouter);
  app.use('/api/v1', adminRouter);
  return app;
}

const app = makeApp();
const enrolToken = (userId: string) => createMfaChallengeToken(userId, 'enrol');

beforeEach(() => {
  totpValid = true;
  twoFactorRow = null;
  enabledFor.length = 0;
  secretWrittenFor.length = 0;
});

describe('a stranded seller can complete mandatory enrolment', () => {
  it('accepts the enrol token login issued and returns a secret', async () => {
    const res = await request(app)
      .post('/api/v1/auth/2fa/generate')
      .send({ enrollmentToken: enrolToken('seller-A') });

    expect(res.status).toBe(200);
    expect(res.body.data.secret).toBe('SYNTHETIC-SECRET');
    expect(res.body.data.otpauthUrl).toBeTruthy();
    expect(secretWrittenFor).toEqual(['seller-A']);
  });

  it('enables 2FA when the TOTP code checks out', async () => {
    twoFactorRow = { secret: 'SYNTHETIC-SECRET', enabled: false };

    const res = await request(app)
      .post('/api/v1/auth/2fa/verify')
      .send({ enrollmentToken: enrolToken('seller-A'), token: '123456' });

    expect(res.status).toBe(200);
    expect(enabledFor).toEqual(['seller-A']);
  });

  it('does not hand back a session — the caller must log in again', async () => {
    twoFactorRow = { secret: 'SYNTHETIC-SECRET', enabled: false };

    const res = await request(app)
      .post('/api/v1/auth/2fa/verify')
      .send({ enrollmentToken: enrolToken('seller-A'), token: '123456' });

    expect(res.body).not.toHaveProperty('accessToken');
    expect(res.body).not.toHaveProperty('data.accessToken');
    expect(JSON.stringify(res.body)).not.toContain('access-abc');
  });

  it('rejects a wrong TOTP code rather than enabling anything', async () => {
    twoFactorRow = { secret: 'SYNTHETIC-SECRET', enabled: false };
    totpValid = false;

    const res = await request(app)
      .post('/api/v1/auth/2fa/verify')
      .send({ enrollmentToken: enrolToken('seller-A'), token: '000000' });

    expect(res.status).toBe(400);
    expect(enabledFor).toHaveLength(0);
  });
});

describe('the enrolment credential is not a general-purpose token', () => {
  it('does not authenticate a seller-protected endpoint', async () => {
    const res = await request(app)
      .get('/api/v1/sellers/me')
      .set('authorization', `Bearer ${enrolToken('seller-A')}`)
      .send();

    expect(res.status).toBe(401);
  });

  it('does not authenticate an admin-protected endpoint', async () => {
    const res = await request(app)
      .get('/api/v1/admin/sellers')
      .set('authorization', `Bearer ${enrolToken('seller-A')}`)
      .send();

    expect([401, 403]).toContain(res.status);
  });

  it('is not accepted as a seller application credential', async () => {
    const res = await request(app)
      .post('/api/v1/sellers/register')
      .send({ enrollmentToken: enrolToken('seller-A'), businessName: 'X Ltd' });

    expect(res.status).toBe(401);
  });
});

describe('the enrolment credential is refused unless it is genuinely one', () => {
  it('rejects a garbage token', async () => {
    const res = await request(app)
      .post('/api/v1/auth/2fa/generate')
      .send({ enrollmentToken: 'not-a-jwt' });

    expect(res.status).toBe(401);
    expect(secretWrittenFor).toHaveLength(0);
  });

  it('rejects a token signed with the wrong secret', async () => {
    const forged = jwt.sign(
      { sub: 'seller-A', purpose: 'enrol', type: 'mfa_challenge' },
      'attacker-secret-at-least-32-characters-long',
      { issuer: 'muni-auth', audience: 'muni-api', expiresIn: '5m' },
    );

    const res = await request(app).post('/api/v1/auth/2fa/generate').send({ enrollmentToken: forged });

    expect(res.status).toBe(401);
    expect(secretWrittenFor).toHaveLength(0);
  });

  it('rejects an expired enrol token', async () => {
    const expired = jwt.sign(
      { sub: 'seller-A', purpose: 'enrol', type: 'mfa_challenge' },
      process.env.JWT_ACCESS_SECRET as string,
      { issuer: 'muni-auth', audience: 'muni-api', expiresIn: -10 },
    );

    const res = await request(app).post('/api/v1/auth/2fa/generate').send({ enrollmentToken: expired });

    expect(res.status).toBe(401);
    expect(secretWrittenFor).toHaveLength(0);
  });

  it('rejects a VERIFY challenge — purpose is pinned to enrol', async () => {
    const res = await request(app)
      .post('/api/v1/auth/2fa/generate')
      .send({ enrollmentToken: createMfaChallengeToken('seller-A', 'verify') });

    expect(res.status).toBe(401);
    expect(secretWrittenFor).toHaveLength(0);
  });

  it('rejects an ACCESS token presented in the enrolment field', async () => {
    const res = await request(app)
      .post('/api/v1/auth/2fa/generate')
      .send({ enrollmentToken: createAccessToken('seller-A', ['ROLE_SELLER']) });

    expect(res.status).toBe(401);
    expect(secretWrittenFor).toHaveLength(0);
  });

  it('refuses a bad token instead of falling back to an ambient session', async () => {
    // A supplied-but-invalid credential must not be masked by the session path.
    const res = await request(app)
      .post('/api/v1/auth/2fa/generate')
      .set('x-user-id', 'seller-B')
      .send({ enrollmentToken: 'not-a-jwt' });

    expect(res.status).toBe(401);
    expect(secretWrittenFor).toHaveLength(0);
  });
});

describe('one account cannot enrol another', () => {
  it('enrols only the subject named in the token, ignoring a body userId', async () => {
    await request(app)
      .post('/api/v1/auth/2fa/generate')
      .send({ enrollmentToken: enrolToken('seller-A'), userId: 'seller-B' });

    expect(secretWrittenFor).toEqual(['seller-A']);
    expect(secretWrittenFor).not.toContain('seller-B');
  });

  it('ignores a forged x-user-id alongside a valid enrol token', async () => {
    await request(app)
      .post('/api/v1/auth/2fa/generate')
      .set('x-user-id', 'seller-B')
      .send({ enrollmentToken: enrolToken('seller-A') });

    expect(secretWrittenFor).toEqual(['seller-A']);
  });

  it('marks 2FA enabled only for the token’s subject', async () => {
    twoFactorRow = { secret: 'SYNTHETIC-SECRET', enabled: false };

    await request(app)
      .post('/api/v1/auth/2fa/verify')
      .set('x-user-id', 'seller-B')
      .send({ enrollmentToken: enrolToken('seller-A'), token: '123456', userId: 'seller-B' });

    expect(enabledFor).toEqual(['seller-A']);
  });
});

describe('enrolment grants no privilege of its own', () => {
  it('returns no roles anywhere in the generate response', async () => {
    const res = await request(app)
      .post('/api/v1/auth/2fa/generate')
      .send({ enrollmentToken: enrolToken('seller-A') });

    expect(JSON.stringify(res.body)).not.toContain('ROLE_');
  });

  it('returns no roles and no tokens in the verify response', async () => {
    twoFactorRow = { secret: 'SYNTHETIC-SECRET', enabled: false };

    const res = await request(app)
      .post('/api/v1/auth/2fa/verify')
      .send({ enrollmentToken: enrolToken('seller-A'), token: '123456' });

    const body = JSON.stringify(res.body);
    expect(body).not.toContain('ROLE_');
    expect(body).not.toContain('refresh-def');
  });
});

describe('the existing session path is unchanged', () => {
  it('still lets a signed-in user enrol with a gateway-stamped identity', async () => {
    const res = await request(app)
      .post('/api/v1/auth/2fa/generate')
      .set('x-user-id', 'seller-A')
      .send({});

    expect(res.status).toBe(200);
    expect(secretWrittenFor).toEqual(['seller-A']);
  });

  it('still refuses an anonymous caller with no credential at all', async () => {
    const res = await request(app).post('/api/v1/auth/2fa/generate').send({});

    expect(res.status).toBe(401);
    expect(secretWrittenFor).toHaveLength(0);
  });

  it('still refuses to replace a working authenticator', async () => {
    twoFactorRow = { secret: 'SYNTHETIC-SECRET', enabled: true };

    const res = await request(app)
      .post('/api/v1/auth/2fa/generate')
      .send({ enrollmentToken: enrolToken('seller-A') });

    expect(res.status).toBe(409);
    expect(secretWrittenFor).toHaveLength(0);
  });
});
