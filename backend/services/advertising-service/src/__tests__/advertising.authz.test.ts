import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';

/**
 * advertising.authz.test.ts
 *
 * Whose campaigns a caller may open, read and retune.
 *
 * This service had no authentication of any kind — no middleware file, every
 * route in app.ts mounted bare — and the gateway published the whole
 * /advertising prefix with `pub()`: all methods, no JWT. The controllers then
 * resolved the seller as
 *
 *   (req.headers['x-user-id'] as string) || req.body.sellerId || 'seller-001'
 *
 * so, reachable from the internet with no session at all:
 *
 *   • open a campaign billed to any seller, by naming them in the body;
 *   • read any seller's campaigns and ad analytics via `?sellerId=`;
 *   • read a competitor's campaign by id — their bid, budget, keywords and
 *     spend, which is their whole ad strategy;
 *   • PATCH a competitor's campaign: drop their bid to lose every auction, or
 *     raise their daily budget to drain it.
 *
 * A click charges the campaign's bid against its daily budget, so all of this
 * is seller billing.
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

// The service singleton binds its repository at construction and the
// controllers use that singleton, so standing in for the Prisma module is what
// lets these drive the real route table without a database.
const { MemoryAdvertisingRepository } = await import('../repositories/memory-advertising.repository.js');
const repo = new MemoryAdvertisingRepository();
jest.unstable_mockModule('../repositories/prisma-advertising.repository.js', () => ({
  prismaAdvertisingRepository: repo,
}));

const request = (await import('supertest')).default;
const app = (await import('../app.js')).default;
const { signIdentity } = await import('../../../../shared/utils/internal-identity.js');

const SELLER_A = 'seller-a';
const SELLER_B = 'seller-b';
const ADMIN = 'admin-1';
const SIGNING_SECRET = 'test-internal-identity-secret-32-chars-plus';
const BASE = '/api/v1/advertising';

/** The headers the gateway stamps once it has verified the JWT. */
const asUser = (id: string, roles: string[] = ['ROLE_SELLER']) => ({
  'x-user-id': id,
  'x-user-roles': roles.join(','),
});

const CAMPAIGN = {
  productId: 'prod-1',
  productName: 'Kasese Pure Honey 1L',
  dailyBudgetUGX: 50_000,
  bidPerClickUGX: 500,
  keywords: ['honey'],
};

/** A live campaign belonging to seller A. */
function seedForA(id = 'camp-a') {
  const now = new Date().toISOString();
  repo.seed({
    id,
    sellerId: SELLER_A,
    productId: 'prod-1',
    productName: 'Kasese Pure Honey 1L',
    campaignName: 'Honey push',
    dailyBudgetUGX: 50_000,
    bidPerClickUGX: 500,
    keywords: ['honey'],
    status: 'ACTIVE',
    totalImpressions: 0,
    totalClicks: 0,
    totalSpentUGX: 0,
    startDate: now,
    createdAt: now,
    updatedAt: now,
  } as never);
  return id;
}

beforeEach(() => {
  delete process.env.INTERNAL_IDENTITY_SECRET;
  repo.clear?.();
  mockPublish.mockClear();
});

// ─── Authentication ───────────────────────────────────────────────────────────

describe('campaign routes require an identity', () => {
  it('401s a campaign opened with no identity, rather than billing seller-001', async () => {
    const res = await request(app).post(`${BASE}/campaigns`).send(CAMPAIGN);

    expect(res.status).toBe(401);
    expect(JSON.stringify(res.body)).not.toContain('seller-001');
  });

  it.each([
    ['the campaign list', 'get', `${BASE}/campaigns`],
    ['ad analytics', 'get', `${BASE}/analytics`],
  ])('401s %s with no identity', async (_label, method, path) => {
    const res = await (request(app) as never as Record<string, (p: string) => Promise<{ status: number }>>)[method](path);
    expect(res.status).toBe(401);
  });

  it('401s reading one campaign with no identity', async () => {
    const id = seedForA();
    const res = await request(app).get(`${BASE}/campaigns/${id}`);
    expect(res.status).toBe(401);
  });

  it('401s retuning a campaign with no identity, and changes nothing', async () => {
    const id = seedForA();

    const res = await request(app).patch(`${BASE}/campaigns/${id}`).send({ bidPerClickUGX: 1 });

    expect(res.status).toBe(401);
    expect((await repo.findCampaignById(id))!.bidPerClickUGX).toBe(500);
  });

  it('keeps sponsored placements public — a product page renders them signed out', async () => {
    const res = await request(app).get(`${BASE}/sponsored-products`);
    expect(res.status).toBe(200);
  });

  it('keeps click recording public — the shopper clicking an ad may be anonymous', async () => {
    const id = seedForA();
    const res = await request(app).post(`${BASE}/clicks`).send({ campaignId: id });
    expect(res.status).toBe(200);
  });
});

// ─── Ownership ────────────────────────────────────────────────────────────────

describe('a campaign belongs to the seller who opened it', () => {
  it('bills the campaign to the session, ignoring a sellerId in the body', async () => {
    const res = await request(app)
      .post(`${BASE}/campaigns`)
      .set(asUser(SELLER_A))
      .send({ ...CAMPAIGN, sellerId: SELLER_B });

    expect(res.status).toBe(201);
    expect(res.body.data.sellerId).toBe(SELLER_A);
  });

  it('lists only the caller’s own campaigns, ignoring ?sellerId=', async () => {
    seedForA();

    const res = await request(app)
      .get(`${BASE}/campaigns?sellerId=${SELLER_A}`)
      .set(asUser(SELLER_B));

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(0);
  });

  it('lets the owning seller read their campaign', async () => {
    const id = seedForA();
    const res = await request(app).get(`${BASE}/campaigns/${id}`).set(asUser(SELLER_A));

    expect(res.status).toBe(200);
    expect(res.body.data.bidPerClickUGX).toBe(500);
  });

  it('hides a competitor’s campaign behind a 404, leaking no bid or budget', async () => {
    const id = seedForA();

    const res = await request(app).get(`${BASE}/campaigns/${id}`).set(asUser(SELLER_B));

    expect(res.status).toBe(404);
    const body = JSON.stringify(res.body);
    expect(body).not.toContain('500');
    expect(body).not.toContain('honey');
  });

  it('answers a competitor’s campaign exactly like one that does not exist', async () => {
    const id = seedForA();

    const notYours = await request(app).get(`${BASE}/campaigns/${id}`).set(asUser(SELLER_B));
    const missing = await request(app).get(`${BASE}/campaigns/no-such-id`).set(asUser(SELLER_B));

    expect(notYours.status).toBe(missing.status);
    expect(notYours.body).toEqual(missing.body);
  });

  it('refuses a competitor retuning the bid, and leaves it untouched', async () => {
    const id = seedForA();

    const res = await request(app)
      .patch(`${BASE}/campaigns/${id}`)
      .set(asUser(SELLER_B))
      .send({ bidPerClickUGX: 1 });

    expect(res.status).toBe(404);
    // Dropping a competitor's bid to 1 UGX loses them every auction they enter.
    expect((await repo.findCampaignById(id))!.bidPerClickUGX).toBe(500);
  });

  it('refuses a competitor raising the daily budget to drain it', async () => {
    const id = seedForA();

    const res = await request(app)
      .patch(`${BASE}/campaigns/${id}`)
      .set(asUser(SELLER_B))
      .send({ dailyBudgetUGX: 10_000_000 });

    expect(res.status).toBe(404);
    expect((await repo.findCampaignById(id))!.dailyBudgetUGX).toBe(50_000);
  });

  it('lets the owning seller retune their own campaign', async () => {
    const id = seedForA();

    const res = await request(app)
      .patch(`${BASE}/campaigns/${id}`)
      .set(asUser(SELLER_A))
      .send({ bidPerClickUGX: 750 });

    expect(res.status).toBe(200);
    expect(res.body.data.bidPerClickUGX).toBe(750);
  });

  it('scopes ad analytics to the caller', async () => {
    seedForA();

    const mine = await request(app).get(`${BASE}/analytics`).set(asUser(SELLER_A));
    const theirs = await request(app).get(`${BASE}/analytics?sellerId=${SELLER_A}`).set(asUser(SELLER_B));

    expect(mine.body.data.totalCampaigns).toBe(1);
    expect(theirs.body.data.totalCampaigns).toBe(0);
  });
});

// ─── Staff ────────────────────────────────────────────────────────────────────

describe('staff act across sellers', () => {
  it('lets an admin read any seller’s campaign', async () => {
    const id = seedForA();
    const res = await request(app).get(`${BASE}/campaigns/${id}`).set(asUser(ADMIN, ['ROLE_ADMIN']));
    expect(res.status).toBe(200);
  });

  it('lets an admin name a seller when reading analytics', async () => {
    seedForA();
    const res = await request(app)
      .get(`${BASE}/analytics?sellerId=${SELLER_A}`)
      .set(asUser(ADMIN, ['ROLE_ADMIN']));

    expect(res.body.data.totalCampaigns).toBe(1);
  });

  it('403s a customer opening a campaign — advertising is a seller action', async () => {
    const res = await request(app)
      .post(`${BASE}/campaigns`)
      .set(asUser('cust-1', ['ROLE_CUSTOMER']))
      .send(CAMPAIGN);

    expect(res.status).toBe(403);
  });
});

// ─── Signed identity mode ─────────────────────────────────────────────────────

describe('with INTERNAL_IDENTITY_SECRET set, a raw header buys nothing', () => {
  beforeEach(() => { process.env.INTERNAL_IDENTITY_SECRET = SIGNING_SECRET; });
  afterEach(() => { delete process.env.INTERNAL_IDENTITY_SECRET; });

  const signed = (id: string, roles: string[] = ['ROLE_SELLER']) => ({
    'x-internal-identity': signIdentity(id, roles) as string,
  });

  it('401s a forged x-user-id, because nothing signed it', async () => {
    const res = await request(app).get(`${BASE}/campaigns`).set(asUser(SELLER_A));
    expect(res.status).toBe(401);
  });

  it('accepts a properly signed assertion', async () => {
    const res = await request(app).get(`${BASE}/campaigns`).set(signed(SELLER_A));
    expect(res.status).toBe(200);
  });

  it('will not let a forged header override a signed identity', async () => {
    const id = seedForA();

    const res = await request(app)
      .get(`${BASE}/campaigns/${id}`)
      .set(signed(SELLER_B))
      .set('x-user-id', SELLER_A);

    expect(res.status).toBe(404);
  });
});
