import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';

/**
 * pricing.authz.test.ts
 *
 * Whose prices a caller may read and rewrite.
 *
 * This service had no authentication — every route in app.ts mounted bare —
 * and the gateway published /pricing with `pub()`: all methods, no JWT. The
 * controllers resolved the seller as an unverified `x-user-id`, then the
 * caller's own body, then a literal 'seller-001'. So, from the internet:
 *
 *   • POST /pricing/rules — write an auto-pricing rule against any seller,
 *     including its minPriceFloor, the number their automation will not go
 *     below;
 *   • GET  /pricing/rules?sellerId= — read a competitor's floors, which is the
 *     one figure you want before undercutting them;
 *   • POST /pricing/apply — re-price EVERY active rule on the platform. There
 *     is no per-seller variant of applyAutoPricingRules(); it walks them all.
 *
 * These drive the REAL app — the real route table, the real shared auth
 * middleware, the real controllers — over an in-memory repository.
 */

const mockPublish = jest.fn<() => Promise<void>>().mockResolvedValue();
jest.unstable_mockModule('../../../../shared/kafka/producer.js', () => ({
  publish: mockPublish,
  connectProducer: jest.fn<() => Promise<void>>().mockResolvedValue(),
  disconnectProducer: jest.fn<() => Promise<void>>().mockResolvedValue(),
  isProducerReady: jest.fn<() => boolean>().mockReturnValue(true),
}));

jest.unstable_mockModule('../db/prisma.js', () => ({
  prisma: { $queryRaw: jest.fn<() => Promise<unknown>>().mockResolvedValue([1]) },
  connectDB: jest.fn<() => Promise<void>>().mockResolvedValue(),
  disconnectDB: jest.fn<() => Promise<void>>().mockResolvedValue(),
}));

const { MemoryPricingRepository } = await import('../repositories/memory-pricing.repository.js');
const repo = new MemoryPricingRepository();
jest.unstable_mockModule('../repositories/prisma-pricing.repository.js', () => ({
  prismaPricingRepository: repo,
}));

const request = (await import('supertest')).default;
const app = (await import('../app.js')).default;
const { signIdentity, signServiceIdentity } = await import('../../../../shared/utils/internal-identity.js');

const SELLER_A = 'seller-a';
const SELLER_B = 'seller-b';
const ADMIN = 'admin-1';
const SIGNING_SECRET = 'test-internal-identity-secret-32-chars-plus';
const BASE = '/api/v1/pricing';

const asUser = (id: string, roles: string[] = ['ROLE_SELLER']) => ({
  'x-user-id': id,
  'x-user-roles': roles.join(','),
});

const RULE = {
  productId: 'prod-1',
  ruleType: 'MATCH',
  targetPrice: 40_000,
  minPriceFloor: 30_000,
  currentPrice: 45_000,
};

beforeEach(() => {
  delete process.env.INTERNAL_IDENTITY_SECRET;
  repo.clear();
  mockPublish.mockClear();
});

// ─── Authentication ───────────────────────────────────────────────────────────

describe('pricing routes require an identity', () => {
  it('401s a rule written with no identity, rather than filing it under seller-001', async () => {
    const res = await request(app).post(`${BASE}/rules`).send(RULE);

    expect(res.status).toBe(401);
    expect(JSON.stringify(res.body)).not.toContain('seller-001');
  });

  it.each([
    ['the rule list', 'get', `${BASE}/rules`],
    ['competitor prices', 'get', `${BASE}/competitors/prod-1`],
    ['price history', 'get', `${BASE}/history/prod-1`],
  ])('401s %s with no identity', async (_label, method, path) => {
    const res = await (request(app) as never as Record<string, (p: string) => Promise<{ status: number }>>)[method](path);
    expect(res.status).toBe(401);
  });

  it('401s a platform-wide re-price with no identity', async () => {
    const res = await request(app).post(`${BASE}/apply`).send({});
    expect(res.status).toBe(401);
  });
});

// ─── Ownership ────────────────────────────────────────────────────────────────

describe('a pricing rule belongs to the seller who wrote it', () => {
  it('files the rule against the session, ignoring a sellerId in the body', async () => {
    const res = await request(app)
      .post(`${BASE}/rules`)
      .set(asUser(SELLER_A))
      .send({ ...RULE, sellerId: SELLER_B });

    expect(res.status).toBe(201);
    expect(res.body.data.sellerId).toBe(SELLER_A);
  });

  it('lists only the caller’s own rules, ignoring ?sellerId=', async () => {
    await request(app).post(`${BASE}/rules`).set(asUser(SELLER_A)).send(RULE);

    const res = await request(app)
      .get(`${BASE}/rules?sellerId=${SELLER_A}`)
      .set(asUser(SELLER_B));

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(0);
  });

  it('never leaks a competitor’s price floor', async () => {
    await request(app).post(`${BASE}/rules`).set(asUser(SELLER_A)).send(RULE);

    const res = await request(app)
      .get(`${BASE}/rules?sellerId=${SELLER_A}`)
      .set(asUser(SELLER_B));

    // 30,000 is what seller A's automation will not price below.
    expect(JSON.stringify(res.body)).not.toContain('30000');
  });

  it('gives a seller their own rules back', async () => {
    await request(app).post(`${BASE}/rules`).set(asUser(SELLER_A)).send(RULE);

    const res = await request(app).get(`${BASE}/rules`).set(asUser(SELLER_A));

    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].minPriceFloor).toBe(30_000);
  });

  it('lets staff read a named seller’s rules', async () => {
    await request(app).post(`${BASE}/rules`).set(asUser(SELLER_A)).send(RULE);

    const res = await request(app)
      .get(`${BASE}/rules?sellerId=${SELLER_A}`)
      .set(asUser(ADMIN, ['ROLE_ADMIN']));

    expect(res.body.data).toHaveLength(1);
  });

  it('403s a customer writing a pricing rule', async () => {
    const res = await request(app)
      .post(`${BASE}/rules`)
      .set(asUser('cust-1', ['ROLE_CUSTOMER']))
      .send(RULE);

    expect(res.status).toBe(403);
  });
});

// ─── The platform-wide job ────────────────────────────────────────────────────

describe('applying rules is a platform-wide operation', () => {
  it('403s a seller firing it', async () => {
    const res = await request(app).post(`${BASE}/apply`).set(asUser(SELLER_A)).send({});

    // applyAutoPricingRules() walks EVERY seller's active rules — there is no
    // per-seller variant — so one seller must not be able to drive it.
    expect(res.status).toBe(403);
  });

  it('403s a customer firing it', async () => {
    const res = await request(app)
      .post(`${BASE}/apply`)
      .set(asUser('cust-1', ['ROLE_CUSTOMER']))
      .send({});

    expect(res.status).toBe(403);
  });

  it('lets an admin fire it', async () => {
    const res = await request(app).post(`${BASE}/apply`).set(asUser(ADMIN, ['ROLE_ADMIN'])).send({});
    expect(res.status).toBe(200);
  });

  it('lets a signed peer service fire it — a scheduler is the intended caller', async () => {
    process.env.INTERNAL_IDENTITY_SECRET = SIGNING_SECRET;
    try {
      const assertion = signServiceIdentity('pricing-scheduler', [], 'pricing-scheduler') as string;
      const res = await request(app)
        .post(`${BASE}/apply`)
        .set('x-internal-identity', assertion)
        .send({});

      expect(res.status).toBe(200);
    } finally {
      delete process.env.INTERNAL_IDENTITY_SECRET;
    }
  });
});

// ─── Signed identity mode ─────────────────────────────────────────────────────

describe('with INTERNAL_IDENTITY_SECRET set, a raw header buys nothing', () => {
  beforeEach(() => { process.env.INTERNAL_IDENTITY_SECRET = SIGNING_SECRET; });
  afterEach(() => { delete process.env.INTERNAL_IDENTITY_SECRET; });

  const signed = (id: string, roles: string[] = ['ROLE_SELLER']) => ({
    'x-internal-identity': signIdentity(id, roles) as string,
  });

  it('401s a forged x-user-id', async () => {
    const res = await request(app).get(`${BASE}/rules`).set(asUser(SELLER_A));
    expect(res.status).toBe(401);
  });

  it('accepts a properly signed assertion', async () => {
    const res = await request(app).get(`${BASE}/rules`).set(signed(SELLER_A));
    expect(res.status).toBe(200);
  });

  it('ignores a hand-written x-user-roles claiming admin on the platform job', async () => {
    const res = await request(app)
      .post(`${BASE}/apply`)
      .set(signed(SELLER_A))
      .set('x-user-roles', 'ROLE_ADMIN')
      .send({});

    expect(res.status).toBe(403);
  });
});
