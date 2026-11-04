import { jest, describe, it, expect } from '@jest/globals';
import request from 'supertest';

// ─── Loyalty authorization / IDOR regression tests ────────────────────────────
//
// These exercise the REAL route table in app.ts, not a copy of it, so a guard
// removed from a route is a failing test rather than a test that quietly keeps
// passing against its own private express app.
//
// What they pin down:
//
//   • A user-scoped route with no identity is 401, not "acts as user-123".
//   • A "userId" in the body or query string is NOT identity. This is the
//     actual vulnerability: the gateway strips the x-user-id header, but it
//     cannot strip a request body, so `{"userId":"victim"}` was enough to
//     redeem someone else's rewards.
//   • A raw x-user-id header is not accepted while signed identity is enabled,
//     so a forged header cannot impersonate anyone.
//   • The two genuinely public catalogue routes still serve guests.
//
// Signed mode is switched on deliberately: with INTERNAL_IDENTITY_SECRET unset
// the shared middleware degrades to trusting x-user-id, and a test written
// without the secret would prove nothing about the header-forgery case.
process.env.INTERNAL_IDENTITY_SECRET = 'test-internal-identity-secret-32-chars-plus';

// Bind an ephemeral port: app.ts calls start() on import, and a fixed 4030
// would collide with a running service or another worker.
process.env.PORT = '0';

const mockPublish = jest.fn<() => Promise<void>>().mockResolvedValue();

jest.unstable_mockModule('../../../../shared/kafka/producer.js', () => ({
  publish: mockPublish,
  connectProducer: jest.fn<() => Promise<void>>().mockResolvedValue(),
  disconnectProducer: jest.fn<() => Promise<void>>().mockResolvedValue(),
  isProducerReady: jest.fn<() => boolean>().mockReturnValue(true),
}));

// No database in this suite — start() would otherwise try to reach Postgres.
jest.unstable_mockModule('../db/prisma.js', () => ({
  connectDB: jest.fn<() => Promise<void>>().mockResolvedValue(),
  disconnectDB: jest.fn<() => Promise<void>>().mockResolvedValue(),
  prisma: { $queryRaw: jest.fn<() => Promise<unknown>>().mockResolvedValue([{ 1: 1 }]) },
}));

// The service layer records which user it was asked to act on. That recorded
// value is what proves whose balance was touched.
const seen: { redeem: string[]; points: string[]; referral: string[] } = {
  redeem: [], points: [], referral: [],
};

jest.unstable_mockModule('../services/loyalty.service.js', () => ({
  loyaltyService: {
    getOrCreateUser: jest.fn(async (userId: string) => {
      seen.points.push(userId);
      return { userId, points: 250, tier: 'BRONZE' };
    }),
    getHistory: jest.fn(async () => []),
    getAvailableRewards: jest.fn(async () => [{ id: 'r1', name: 'Free delivery' }]),
    redeemReward: jest.fn(async (userId: string, rewardId: string) => {
      seen.redeem.push(userId);
      return { userId, rewardId, status: 'REDEEMED' };
    }),
    generateReferral: jest.fn(async (userId: string) => {
      seen.referral.push(userId);
      return { userId, code: 'REF-1' };
    }),

    claimBirthdayBonus: jest.fn(async (userId: string) => ({ userId, points: 500 })),
  },
}));

const { signIdentity, INTERNAL_IDENTITY_HEADER } =
  await import('../../../../shared/utils/internal-identity.js');
const { default: app } = await import('../app.js');

/** The header the gateway stamps for an authenticated caller. */
function asUser(userId: string, roles: string[] = ['ROLE_CUSTOMER']) {
  const token = signIdentity(userId, roles);
  if (!token) throw new Error('signIdentity returned null — secret not configured');
  return { [INTERNAL_IDENTITY_HEADER]: token };
}

describe('loyalty-service — public catalogue stays public', () => {
  it('serves the reward catalogue to a guest', async () => {
    const res = await request(app).get('/api/v1/loyalty/rewards');
    expect(res.status).toBe(200);
  });

  it('serves tier benefits to a guest', async () => {
    const res = await request(app).get('/api/v1/loyalty/tier/benefits');
    expect(res.status).toBe(200);
  });
});

describe('loyalty-service — user-scoped routes require a verified identity', () => {
  it.each([
    ['get',  '/api/v1/loyalty/points'],
    ['get',  '/api/v1/loyalty/history'],
    ['post', '/api/v1/loyalty/redeem'],
    ['post', '/api/v1/loyalty/referral'],
    ['post', '/api/v1/loyalty/birthday'],
  ])('%s %s is 401 without identity', async (method, path) => {
    const res = await (method === 'get'
      ? request(app).get(path)
      : request(app).post(path).send({ rewardId: 'r1' }));
    expect(res.status).toBe(401);
  });
});

describe('loyalty-service — caller-supplied identity is rejected (IDOR)', () => {
  it('does not redeem on behalf of a userId named in the request body', async () => {
    const res = await request(app)
      .post('/api/v1/loyalty/redeem')
      .send({ rewardId: 'r1', userId: 'victim' });

    expect(res.status).toBe(401);
    expect(seen.redeem).not.toContain('victim');
  });

  it('ignores a body userId when a different user is authenticated', async () => {
    seen.redeem.length = 0;

    const res = await request(app)
      .post('/api/v1/loyalty/redeem')
      .set(asUser('attacker'))
      .send({ rewardId: 'r1', userId: 'victim' });

    expect(res.status).toBe(200);
    // The redemption was charged to the authenticated caller, not the body.
    expect(seen.redeem).toEqual(['attacker']);
    expect(seen.redeem).not.toContain('victim');
  });

  it('ignores a query-string userId on a read route', async () => {
    seen.points.length = 0;

    const res = await request(app)
      .get('/api/v1/loyalty/points?userId=victim')
      .set(asUser('attacker'));

    expect(res.status).toBe(200);
    expect(seen.points).toEqual(['attacker']);
  });

  it('never falls back to the old hardcoded user-123 identity', async () => {
    seen.referral.length = 0;

    const res = await request(app).post('/api/v1/loyalty/referral').send({});

    expect(res.status).toBe(401);
    expect(seen.referral).not.toContain('user-123');
    expect(seen.referral).toHaveLength(0);
  });
});

describe('loyalty-service — forged headers do not authenticate', () => {
  it('rejects a raw x-user-id header with no signed assertion', async () => {
    seen.redeem.length = 0;

    const res = await request(app)
      .post('/api/v1/loyalty/redeem')
      .set('x-user-id', 'victim')
      .send({ rewardId: 'r1' });

    expect(res.status).toBe(401);
    expect(seen.redeem).toHaveLength(0);
  });

  it('rejects a tampered internal-identity token', async () => {
    const token = signIdentity('attacker', ['ROLE_CUSTOMER']);
    if (!token) throw new Error('signIdentity returned null');

    const res = await request(app)
      .post('/api/v1/loyalty/redeem')
      .set(INTERNAL_IDENTITY_HEADER, `${token}tamper`)
      .send({ rewardId: 'r1' });

    expect(res.status).toBe(401);
  });
});
