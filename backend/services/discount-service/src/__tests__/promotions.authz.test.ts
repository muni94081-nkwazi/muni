import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';

/**
 * promotions.authz.test.ts
 *
 * Who may create a seller promotion, and on whose behalf.
 *
 * The four seller-promotion routes carried no guard, and the controllers
 * resolved their subject as
 *
 *   (req.headers['x-user-id'] as string) || res.locals.userId || 'seller-001'
 *
 * — the raw header AHEAD of the verified identity, then a hardcoded fallback.
 * So, reachable with no session at all: schedule a flash sale, a BOGO or free
 * shipping billed to the real seller 'seller-001'. And with a valid session for
 * one seller, a typed `x-user-id` acted as another — the header outranked the
 * signed assertion that named the real caller.
 *
 * These drive the REAL app: the real route table, the real shared auth
 * middleware, the real controllers over the in-memory repository.
 */

jest.unstable_mockModule('../../../../shared/kafka/producer.js', () => ({
  publish: jest.fn<() => Promise<void>>().mockResolvedValue(),
  connectProducer: jest.fn<() => Promise<void>>().mockResolvedValue(),
  disconnectProducer: jest.fn<() => Promise<void>>().mockResolvedValue(),
  isProducerReady: jest.fn<() => boolean>().mockReturnValue(true),
  getProducer: jest.fn(() => null),
}));

// The service picks InMemoryDiscountRepository when DATABASE_URL is unset, and
// dotenv would otherwise hand it the repo's real one — these must not reach a
// database.
delete process.env.DATABASE_URL;

const express = (await import('express')).default;
const request = (await import('supertest')).default;
const routes = (await import('../routes/index.js')).default;
const { signIdentity } = await import('../../../../shared/utils/internal-identity.js');

// app.ts calls start() at import time and exports nothing, so the router is
// mounted here the way it mounts it — `app.use(routes)`, with the full
// /api/v1/... paths carried on the routes themselves.
const app = express();
app.use(express.json());
app.use(routes);

const SELLER_A = 'seller-a';
const SELLER_B = 'seller-b';
const ADMIN = 'admin-1';
const SIGNING_SECRET = 'test-internal-identity-secret-32-chars-plus';

/** The headers the gateway stamps once it has verified the JWT. */
const asUser = (id: string, roles: string[] = ['ROLE_SELLER']) => ({
  'x-user-id': id,
  'x-user-roles': roles.join(','),
});

const FLASH_SALE = {
  code: `FLASH${Date.now()}`,
  value: 20,
  expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
};

beforeEach(() => {
  delete process.env.INTERNAL_IDENTITY_SECRET;
});

describe('seller promotions require a seller', () => {
  it.each([
    ['a flash sale',    '/api/v1/discounts/flash-sales',   FLASH_SALE],
    ['a BOGO',          '/api/v1/discounts/bogo',          { productId: 'p-1' }],
    ['free shipping',   '/api/v1/discounts/free-shipping', { minOrderAmount: 1000 }],
  ])('401s %s created with no identity, rather than billing seller-001', async (_label, path, body) => {
    const res = await request(app).post(path).send(body);

    expect(res.status).toBe(401);
    expect(JSON.stringify(res.body)).not.toContain('seller-001');
  });

  it('401s the seller promotion list with no identity', async () => {
    const res = await request(app).get('/api/v1/discounts/seller/promotions');

    expect(res.status).toBe(401);
    expect(JSON.stringify(res.body)).not.toContain('seller-001');
  });

  it('403s a customer creating a promotion', async () => {
    const res = await request(app)
      .post('/api/v1/discounts/bogo')
      .set(asUser('cust-1', ['ROLE_CUSTOMER']))
      .send({ productId: 'p-1' });

    expect(res.status).toBe(403);
  });

  it('lets a seller create one against themselves', async () => {
    const res = await request(app)
      .post('/api/v1/discounts/bogo')
      .set(asUser(SELLER_A))
      .send({ productId: 'p-1' });

    expect(res.status).toBe(201);
  });

  it('keeps the public flash-sale list public — shoppers browse it signed out', async () => {
    const res = await request(app).get('/api/v1/discounts/flash-sales');
    expect(res.status).toBe(200);
  });
});

describe('the promotion list is scoped to the caller', () => {
  it('ignores ?sellerId= naming another seller', async () => {
    await request(app)
      .post('/api/v1/discounts/bogo')
      .set(asUser(SELLER_A))
      .send({ productId: 'p-owned-by-a' });

    const res = await request(app)
      .get(`/api/v1/discounts/seller/promotions?sellerId=${SELLER_A}`)
      .set(asUser(SELLER_B));

    expect(res.status).toBe(200);
    expect(JSON.stringify(res.body)).not.toContain('p-owned-by-a');
  });

  it('lets staff name a seller', async () => {
    await request(app)
      .post('/api/v1/discounts/bogo')
      .set(asUser(SELLER_A))
      .send({ productId: 'p-owned-by-a' });

    const res = await request(app)
      .get(`/api/v1/discounts/seller/promotions?sellerId=${SELLER_A}`)
      .set(asUser(ADMIN, ['ROLE_ADMIN']));

    expect(res.status).toBe(200);
    expect(JSON.stringify(res.body)).toContain('p-owned-by-a');
  });
});

describe('with INTERNAL_IDENTITY_SECRET set, a raw header buys nothing', () => {
  beforeEach(() => { process.env.INTERNAL_IDENTITY_SECRET = SIGNING_SECRET; });
  afterEach(() => { delete process.env.INTERNAL_IDENTITY_SECRET; });

  const signed = (id: string, roles: string[] = ['ROLE_SELLER']) => ({
    'x-internal-identity': signIdentity(id, roles) as string,
  });

  it('401s a forged x-user-id', async () => {
    const res = await request(app)
      .post('/api/v1/discounts/bogo')
      .set(asUser(SELLER_A))
      .send({ productId: 'p-1' });

    expect(res.status).toBe(401);
  });

  it('will not let a forged header bill the promotion to another seller', async () => {
    // A product id unique to this case: the in-memory repository is shared
    // across the file, so reusing one an earlier test created would make the
    // "not theirs" assertion pass or fail on leftovers rather than on identity.
    const productId = 'p-forged-header-check';

    // Signed as B, claiming to be A. The header used to win outright.
    const res = await request(app)
      .post('/api/v1/discounts/bogo')
      .set(signed(SELLER_B))
      .set('x-user-id', SELLER_A)
      .send({ productId });

    expect(res.status).toBe(201);

    // The promotion belongs to B — the identity that was actually verified.
    const mine = await request(app)
      .get('/api/v1/discounts/seller/promotions')
      .set(signed(SELLER_B));
    expect(JSON.stringify(mine.body)).toContain(productId);

    const theirs = await request(app)
      .get('/api/v1/discounts/seller/promotions')
      .set(signed(SELLER_A));
    expect(JSON.stringify(theirs.body)).not.toContain(productId);
  });
});
