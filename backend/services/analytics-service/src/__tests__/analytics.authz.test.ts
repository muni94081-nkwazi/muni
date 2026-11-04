import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';

/**
 * analytics.authz.test.ts
 *
 * Whose numbers a caller may read.
 *
 * No route on this service had any authentication. The seller dashboard took
 * its subject from the URL:
 *
 *   req.params.id || (req.headers['x-user-id'] as string) || 'seller-001'
 *
 * so any seller could read any other seller's revenue, order counts, best
 * sellers and conversion rate by editing the path — and with no identity at all
 * the endpoint answered as a real seller id. The executive endpoints
 * (/overview, /gmv, /sellers, /products) returned platform GMV, order volume
 * and user totals to anyone who asked.
 *
 * These drive the REAL app — the real route table, the real shared auth
 * middleware, the real controller.
 */

jest.unstable_mockModule('../../../../shared/cache/redis.js', () => ({
  // Straight through to the loader: caching is not what is under test, and a
  // shared cache key would let one test's result answer another's request.
  cache: { getOrSet: (_k: string, _ttl: number, loader: () => unknown) => loader() },
  connectCache: jest.fn<() => Promise<void>>().mockResolvedValue(),
  disconnectCache: jest.fn<() => Promise<void>>().mockResolvedValue(),
  isCacheReady: () => true,
}));

const sellerDashboard = jest.fn(async (sellerId: string) => ({
  sellerId,
  revenue: { total: 12_345_000, currency: 'UGX' },
  orders: { total: 42 },
}));
jest.unstable_mockModule('../services/seller-analytics.service.js', () => ({
  sellerAnalyticsService: { getSellerDashboard: sellerDashboard },
}));

jest.unstable_mockModule('../services/admin-analytics.service.js', () => ({
  adminAnalyticsService: {
    getAdminDashboard: jest.fn(async () => ({ gmv: { total: 284_500_000 } })),
  },
}));

// Consumers and the aggregator job would otherwise reach for Kafka on import.
jest.unstable_mockModule('../consumers/events.consumer.js', () => ({
  startEventsConsumer: jest.fn(), stopEventsConsumer: jest.fn(),
  counters: {}, eventLog: [],
}));
jest.unstable_mockModule('../consumers/order.consumer.js', () => ({
  startOrderConsumer: jest.fn(), stopOrderConsumer: jest.fn(),
  getOrderMetrics: () => ({ totalOrdersCount: 0, ordersByStatus: {} }),
}));
jest.unstable_mockModule('../consumers/payment.consumer.js', () => ({
  startPaymentConsumer: jest.fn(), stopPaymentConsumer: jest.fn(),
  getRevenueMetrics: () => ({ revenueTotal: 0, refundTotal: 0, paymentsByMethod: {} }),
}));
jest.unstable_mockModule('../jobs/aggregator.job.js', () => ({
  startAnalyticsAggregatorJob: jest.fn(), stopAnalyticsAggregatorJob: jest.fn(),
}));

const request = (await import('supertest')).default;
const app = (await import('../app.js')).default;
const { signIdentity } = await import('../../../../shared/utils/internal-identity.js');

const SELLER_A = 'seller-a';
const SELLER_B = 'seller-b';
const ADMIN = 'admin-1';
const SIGNING_SECRET = 'test-internal-identity-secret-32-chars-plus';

const asUser = (id: string, roles: string[] = ['ROLE_SELLER']) => ({
  'x-user-id': id,
  'x-user-roles': roles.join(','),
});

beforeEach(() => {
  delete process.env.INTERNAL_IDENTITY_SECRET;
  sellerDashboard.mockClear();
});

// ─── The IDOR ─────────────────────────────────────────────────────────────────

describe('a seller dashboard belongs to that seller', () => {
  it('401s with no identity, rather than answering as seller-001', async () => {
    const res = await request(app).get(`/api/v1/analytics/dashboard/seller/${SELLER_A}`);

    expect(res.status).toBe(401);
    expect(sellerDashboard).not.toHaveBeenCalled();
  });

  it('lets a seller read their own', async () => {
    const res = await request(app)
      .get(`/api/v1/analytics/dashboard/seller/${SELLER_A}`)
      .set(asUser(SELLER_A));

    expect(res.status).toBe(200);
    expect(res.body.data.revenue.total).toBe(12_345_000);
  });

  it('403s a seller reading a competitor’s by editing the path', async () => {
    const res = await request(app)
      .get(`/api/v1/analytics/dashboard/seller/${SELLER_A}`)
      .set(asUser(SELLER_B));

    expect(res.status).toBe(403);
    // The service is never asked, so nothing is computed or cached for them.
    expect(sellerDashboard).not.toHaveBeenCalled();
    expect(JSON.stringify(res.body)).not.toContain('12345000');
  });

  it('closes the /analytics/seller/:vendorId path too — same handler, same hole', async () => {
    const res = await request(app)
      .get(`/api/v1/analytics/seller/${SELLER_A}`)
      .set(asUser(SELLER_B));

    expect(res.status).toBe(403);
  });

  it('closes the /api/analytics alias as well', async () => {
    const res = await request(app)
      .get(`/api/analytics/dashboard/seller/${SELLER_A}`)
      .set(asUser(SELLER_B));

    expect(res.status).toBe(403);
  });

  it('lets staff read any seller’s', async () => {
    const res = await request(app)
      .get(`/api/v1/analytics/dashboard/seller/${SELLER_A}`)
      .set(asUser(ADMIN, ['ROLE_ADMIN']));

    expect(res.status).toBe(200);
    expect(sellerDashboard.mock.calls[0][0]).toBe(SELLER_A);
  });
});

// ─── Platform figures ─────────────────────────────────────────────────────────

describe('platform-wide figures are admin-only', () => {
  it.each([
    ['the executive dashboard', '/api/v1/analytics/dashboard/admin'],
    ['the overview', '/api/v1/analytics/overview'],
    ['GMV', '/api/v1/analytics/gmv'],
    ['the seller league table', '/api/v1/analytics/sellers'],
    ['product performance', '/api/v1/analytics/products'],
    ['the raw event log', '/api/v1/analytics/events'],
  ])('401s %s with no identity', async (_label, path) => {
    const res = await request(app).get(path);
    expect(res.status).toBe(401);
  });

  it.each([
    ['the executive dashboard', '/api/v1/analytics/dashboard/admin'],
    ['the overview', '/api/v1/analytics/overview'],
    ['GMV', '/api/v1/analytics/gmv'],
    ['the seller league table', '/api/v1/analytics/sellers'],
    ['the raw event log', '/api/v1/analytics/events'],
  ])('403s a seller asking for %s', async (_label, path) => {
    const res = await request(app).get(path).set(asUser(SELLER_A));
    expect(res.status).toBe(403);
  });

  it('lets an admin read the overview', async () => {
    const res = await request(app)
      .get('/api/v1/analytics/overview')
      .set(asUser(ADMIN, ['ROLE_ADMIN']));

    expect(res.status).toBe(200);
  });
});

// ─── Seller-facing, non-cross-seller ──────────────────────────────────────────

describe('the pending seller endpoints still need a session', () => {
  it.each([
    ['sales', '/api/v1/analytics/sales'],
    ['top products', '/api/v1/analytics/top-products'],
  ])('401s %s with no identity', async (_label, path) => {
    const res = await request(app).get(path);
    expect(res.status).toBe(401);
  });

  it('answers a signed-in seller', async () => {
    const res = await request(app).get('/api/v1/analytics/sales').set(asUser(SELLER_A));
    expect(res.status).toBe(200);
    expect(res.body.meta.pending).toBe(true);
  });
});

// ─── Signed identity mode ─────────────────────────────────────────────────────

describe('with INTERNAL_IDENTITY_SECRET set, a raw header buys nothing', () => {
  beforeEach(() => { process.env.INTERNAL_IDENTITY_SECRET = SIGNING_SECRET; });
  afterEach(() => { delete process.env.INTERNAL_IDENTITY_SECRET; });

  it('401s a forged x-user-id', async () => {
    const res = await request(app)
      .get(`/api/v1/analytics/dashboard/seller/${SELLER_A}`)
      .set(asUser(SELLER_A));

    expect(res.status).toBe(401);
  });

  it('will not let a forged header override a signed identity', async () => {
    const res = await request(app)
      .get(`/api/v1/analytics/dashboard/seller/${SELLER_A}`)
      .set('x-internal-identity', signIdentity(SELLER_B, ['ROLE_SELLER']) as string)
      .set('x-user-id', SELLER_A);

    expect(res.status).toBe(403);
  });

  it('ignores a hand-written x-user-roles claiming admin', async () => {
    const res = await request(app)
      .get('/api/v1/analytics/overview')
      .set('x-internal-identity', signIdentity(SELLER_A, ['ROLE_SELLER']) as string)
      .set('x-user-roles', 'ROLE_ADMIN');

    expect(res.status).toBe(403);
  });
});
