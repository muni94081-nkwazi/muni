/**
 * buyer-protection.authz.test.ts
 *
 * Who may file a claim, and whose money may be frozen or released.
 *
 * This service shipped with no authentication of any kind. There was no
 * auth.middleware.ts in it at all, every route in app.ts was mounted bare, and
 * the gateway published the whole /buyer-protection prefix with pub() — all
 * methods, no JWT. The controllers then resolved the caller as:
 *
 *   (req.headers['x-user-id'] as string) || req.body.userId || 'user-123'
 *
 * — an unverified header, then the attacker's own request body, then a literal
 * user id. So, verified against this route table before the fix:
 *
 *   • anyone could file a protection claim against any order id they typed,
 *     because nothing checked the order was theirs (or existed);
 *   • anyone could POST /escrow/:orderId/confirm-receipt naming the real buyer
 *     and release a stranger's escrow to the seller — the service layer did
 *     compare `hold.buyerId !== buyerId`, but the controller took that buyerId
 *     from the caller, so the check compared a claim against itself;
 *   • anyone could freeze escrow via /escrow/dispute-hold, or list the entire
 *     admin claims queue;
 *   • with no identity at all, claims were filed and listed as 'user-123'.
 *
 * These run the REAL app — the real route table, the real shared auth
 * middleware, the real controllers and services — over in-memory repositories,
 * so they check the behaviour rather than a description of it.
 *
 * Both identity modes are covered, because they fail differently:
 *   header mode — INTERNAL_IDENTITY_SECRET unset; the gateway's stamped
 *                 x-user-id is trusted, as in a dev checkout.
 *   signed mode — the secret is set; a raw x-user-id is unverified noise and a
 *                 forged one must buy nothing at all.
 */
import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';

jest.unstable_mockModule('../../../../shared/kafka/producer.js', () => ({
  publish: jest.fn<() => Promise<void>>().mockResolvedValue(),
  connectProducer: jest.fn<() => Promise<void>>().mockResolvedValue(),
  disconnectProducer: jest.fn<() => Promise<void>>().mockResolvedValue(),
  isProducerReady: jest.fn<() => boolean>().mockReturnValue(true),
}));

jest.unstable_mockModule('../db/prisma.js', () => ({
  prisma: { $queryRaw: jest.fn<() => Promise<unknown>>().mockResolvedValue([1]) },
  connectDB: jest.fn<() => Promise<void>>().mockResolvedValue(),
  disconnectDB: jest.fn<() => Promise<void>>().mockResolvedValue(),
}));

const mockReleaseEscrow = jest.fn<() => Promise<void>>().mockResolvedValue();
jest.unstable_mockModule('../clients/payment-service.client.js', () => ({
  paymentServiceClient: {
    releaseEscrow: mockReleaseEscrow,
    holdEscrowForDispute: jest.fn<() => Promise<void>>().mockResolvedValue(),
  },
}));

jest.unstable_mockModule('../clients/user-service.client.js', () => ({
  userServiceClient: {
    recordDeliveryEvent: jest.fn<() => Promise<void>>().mockResolvedValue(),
  },
}));

// ─── order-service, standing in for the real ownership authority ──────────────
//
// ORDERS maps an order id to the buyer who actually placed it. Asking for
// anyone else's is a 404 — exactly what the shared verification client does, so
// the endpoint cannot be used to discover which order ids exist.
const ORDERS: Record<string, string> = {
  'MUNI-1001': 'cust-a',
  'MUNI-2002': 'cust-b',
};

class MockOrderVerificationError extends Error {
  constructor(readonly status: number, message: string, readonly reason: string) {
    super(message);
  }
}

jest.unstable_mockModule('../clients/order.client.js', () => ({
  OrderVerificationError: MockOrderVerificationError,
  orderClient: {
    fetchOrderForBuyer: jest.fn(async (orderId: string, buyerId: string) => {
      if (ORDERS[orderId] !== buyerId) {
        throw new MockOrderVerificationError(404, 'Order not found', 'not_found');
      }
      return { id: orderId, userId: buyerId, items: [{ sellerId: 'seller-a' }] };
    }),
  },
  fetchOrderForBuyer: jest.fn(),
}));

// The service singletons bind their repository at construction and the
// controllers use those singletons, so standing in for the Prisma module is
// what lets these drive the real route table without a database.
const { MemoryClaimRepository, MemoryEscrowHoldRepository } = await import(
  '../repositories/memory-buyer-protection.repository.js'
);
const claims = new MemoryClaimRepository();
const holds = new MemoryEscrowHoldRepository();

jest.unstable_mockModule('../repositories/prisma-buyer-protection.repository.js', () => ({
  prismaClaimRepository: claims,
  prismaEscrowHoldRepository: holds,
  // Mirrors the real implementation; the memory repository imports it from here.
  holdKeyFor: (orderId: string, subOrderId?: string | null) =>
    (subOrderId ? `${orderId}:${subOrderId}` : orderId),
}));

const request = (await import('supertest')).default;
const app = (await import('../app.js')).default;
const { signIdentity, signServiceIdentity } = await import(
  '../../../../shared/utils/internal-identity.js'
);

const BUYER_A = 'cust-a';
const BUYER_B = 'cust-b';
const SELLER_A = 'seller-a';
const ADMIN = 'admin-1';

const SIGNING_SECRET = 'test-internal-identity-secret-32-chars-plus';
const BASE = '/api/v1/buyer-protection';

/** The headers the gateway stamps once it has verified the JWT. */
const asUser = (id: string, roles: string[] = ['ROLE_CUSTOMER']) => ({
  'x-user-id': id,
  'x-user-roles': roles.join(','),
});

const CLAIM = {
  orderId: 'MUNI-1001',
  productId: 'prod-1',
  reason: 'ITEM_NOT_RECEIVED',
  claimAmountUGX: 250_000,
};

/** A HELD escrow on BUYER_A's order, payable to SELLER_A. */
function seedHold(over: Record<string, unknown> = {}) {
  const now = new Date().toISOString();
  holds.seed({
    id: 'hold-1',
    orderId: 'MUNI-1001',
    subOrderId: null,
    buyerId: BUYER_A,
    sellerId: SELLER_A,
    amount: 250_000,
    currency: 'UGX',
    status: 'HELD',
    deliveredAt: null,
    autoReleaseAt: null,
    expectedDeliveryAt: null,
    activeDisputeId: null,
    createdAt: now,
    updatedAt: now,
    ...over,
  } as never);
}

beforeEach(() => {
  delete process.env.INTERNAL_IDENTITY_SECRET;
  claims.clear();
  holds.clear();
  mockReleaseEscrow.mockClear();
});

// ─── Authentication ───────────────────────────────────────────────────────────

describe('the routes that touch money require an identity', () => {
  it('401s a claim filed with no identity, rather than opening it as user-123', async () => {
    const res = await request(app).post(`${BASE}/claims`).send(CLAIM);

    expect(res.status).toBe(401);
    expect(JSON.stringify(res.body)).not.toContain('user-123');
    expect(await claims.findAll()).toHaveLength(0);
  });

  it('401s the caller’s own claim list with no identity', async () => {
    const res = await request(app).get(`${BASE}/claims`);
    expect(res.status).toBe(401);
  });

  it('401s reading an escrow hold with no identity', async () => {
    seedHold();
    const res = await request(app).get(`${BASE}/escrow/MUNI-1001`);
    expect(res.status).toBe(401);
  });

  it('401s a receipt confirmation with no identity, and releases nothing', async () => {
    seedHold();

    const res = await request(app).post(`${BASE}/escrow/MUNI-1001/confirm-receipt`).send({});

    expect(res.status).toBe(401);
    expect(mockReleaseEscrow).not.toHaveBeenCalled();
    expect((await holds.findByKey('MUNI-1001'))!.status).toBe('HELD');
  });

  it('401s the seller payout list with no identity, rather than answering as seller-001', async () => {
    const res = await request(app).get(`${BASE}/seller/escrow`);

    expect(res.status).toBe(401);
    expect(JSON.stringify(res.body)).not.toContain('seller-001');
  });

  it('401s both admin queues with no identity', async () => {
    const claimsQueue = await request(app).get(`${BASE}/admin/claims`);
    const escrowQueue = await request(app).get(`${BASE}/admin/escrow`);

    expect([claimsQueue.status, escrowQueue.status]).toEqual([401, 401]);
  });

  it('keeps the policy and the product badge public — a shopper reads them signed out', async () => {
    const policy = await request(app).get(`${BASE}/policy`);
    const badge = await request(app).get(`${BASE}/badge/prod-1`);

    expect(policy.status).toBe(200);
    expect(policy.body.data.protectionWindowDays).toBe(30);
    expect(badge.status).toBe(200);
  });
});

// ─── Filing a claim ───────────────────────────────────────────────────────────

describe('a claim may only be filed against the filer’s own order', () => {
  it('lets a buyer file against their own order', async () => {
    const res = await request(app).post(`${BASE}/claims`).set(asUser(BUYER_A)).send(CLAIM);

    expect(res.status).toBe(201);
    expect(res.body.data.userId).toBe(BUYER_A);
    expect(res.body.data.orderId).toBe('MUNI-1001');
  });

  it('refuses a claim against another buyer’s order, and writes nothing', async () => {
    // MUNI-2002 is BUYER_B's. Before the fix this wrote a claim that froze a
    // payout on a purchase the filer had nothing to do with.
    const res = await request(app)
      .post(`${BASE}/claims`)
      .set(asUser(BUYER_A))
      .send({ ...CLAIM, orderId: 'MUNI-2002' });

    expect(res.status).toBe(404);
    expect(await claims.findAll()).toHaveLength(0);
  });

  it('answers another buyer’s order exactly like an order that does not exist', async () => {
    const someoneElses = await request(app)
      .post(`${BASE}/claims`)
      .set(asUser(BUYER_A))
      .send({ ...CLAIM, orderId: 'MUNI-2002' });

    const missing = await request(app)
      .post(`${BASE}/claims`)
      .set(asUser(BUYER_A))
      .send({ ...CLAIM, orderId: 'NO-SUCH-ORDER' });

    expect(someoneElses.status).toBe(missing.status);
    expect(someoneElses.body).toEqual(missing.body);
  });

  it('records the filer from the session, ignoring a userId in the body', async () => {
    const res = await request(app)
      .post(`${BASE}/claims`)
      .set(asUser(BUYER_B))
      .send({ ...CLAIM, orderId: 'MUNI-2002', userId: BUYER_A });

    expect(res.status).toBe(201);
    expect(res.body.data.userId).toBe(BUYER_B);
  });

  it('lists only the caller’s own claims, ignoring a userId in the query', async () => {
    await request(app).post(`${BASE}/claims`).set(asUser(BUYER_A)).send(CLAIM);
    await request(app)
      .post(`${BASE}/claims`)
      .set(asUser(BUYER_B))
      .send({ ...CLAIM, orderId: 'MUNI-2002' });

    const res = await request(app)
      .get(`${BASE}/claims?userId=${BUYER_A}`)
      .set(asUser(BUYER_B));

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].userId).toBe(BUYER_B);
  });
});

// ─── Escrow ownership ─────────────────────────────────────────────────────────

describe('an escrow hold belongs to the two parties on it', () => {
  it('lets the buyer read their own hold', async () => {
    seedHold();
    const res = await request(app).get(`${BASE}/escrow/MUNI-1001`).set(asUser(BUYER_A));

    expect(res.status).toBe(200);
    expect(res.body.data.amount).toBe(250_000);
  });

  it('lets the seller on the hold read it', async () => {
    seedHold();
    const res = await request(app)
      .get(`${BASE}/escrow/MUNI-1001`)
      .set(asUser(SELLER_A, ['ROLE_SELLER']));

    expect(res.status).toBe(200);
  });

  it('hides it from an unrelated customer behind a 404, revealing no amounts', async () => {
    seedHold();
    const res = await request(app).get(`${BASE}/escrow/MUNI-1001`).set(asUser(BUYER_B));

    expect(res.status).toBe(404);
    const body = JSON.stringify(res.body);
    expect(body).not.toContain('250000');
    expect(body).not.toContain(SELLER_A);
  });

  it('lets the buyer confirm receipt of their own order', async () => {
    seedHold();
    const res = await request(app)
      .post(`${BASE}/escrow/MUNI-1001/confirm-receipt`)
      .set(asUser(BUYER_A))
      .send({});

    expect(res.status).toBe(200);
    expect(mockReleaseEscrow).toHaveBeenCalledTimes(1);
    expect((await holds.findByKey('MUNI-1001'))!.status).toBe('RELEASED');
  });

  it('refuses another customer confirming receipt, and releases nothing', async () => {
    seedHold();

    const res = await request(app)
      .post(`${BASE}/escrow/MUNI-1001/confirm-receipt`)
      .set(asUser(BUYER_B))
      .send({});

    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(mockReleaseEscrow).not.toHaveBeenCalled();
    expect((await holds.findByKey('MUNI-1001'))!.status).toBe('HELD');
  });

  it('ignores a buyerId in the body — it was how one customer became another', async () => {
    seedHold();

    const res = await request(app)
      .post(`${BASE}/escrow/MUNI-1001/confirm-receipt`)
      .set(asUser(BUYER_B))
      .send({ buyerId: BUYER_A });

    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(mockReleaseEscrow).not.toHaveBeenCalled();
    expect((await holds.findByKey('MUNI-1001'))!.status).toBe('HELD');
  });

  it('scopes the seller payout list to the caller, ignoring ?sellerId=', async () => {
    seedHold();

    const own = await request(app)
      .get(`${BASE}/seller/escrow`)
      .set(asUser(SELLER_A, ['ROLE_SELLER']));
    expect(own.body.data).toHaveLength(1);

    // A different seller naming seller-a gets their own (empty) list.
    const spoofed = await request(app)
      .get(`${BASE}/seller/escrow?sellerId=${SELLER_A}`)
      .set(asUser('seller-b', ['ROLE_SELLER']));

    expect(spoofed.status).toBe(200);
    expect(spoofed.body.data).toHaveLength(0);
  });
});

// ─── Internal-only escrow transitions ─────────────────────────────────────────

describe('freezing and releasing escrow is an internal act', () => {
  beforeEach(() => {
    process.env.INTERNAL_IDENTITY_SECRET = SIGNING_SECRET;
  });
  afterEach(() => {
    delete process.env.INTERNAL_IDENTITY_SECRET;
  });

  /** What the gateway sends for a browser user: signed, but with no `svc`. */
  const signedUser = (id: string, roles: string[] = ['ROLE_CUSTOMER']) => ({
    'x-internal-identity': signIdentity(id, roles) as string,
  });

  /** What a peer service sends: signed, and carrying the `svc` claim. */
  const signedService = (svc: string) => ({
    'x-internal-identity': signServiceIdentity(svc, [], svc) as string,
  });

  it.each([
    ['a hold', 'escrow', { orderId: 'MUNI-1001', buyerId: BUYER_A, sellerId: SELLER_A, amount: 1000 }],
    ['a delivery', 'escrow/delivered', { orderId: 'MUNI-1001', deliveredAt: new Date().toISOString() }],
    ['a dispute freeze', 'escrow/dispute-hold', { orderId: 'MUNI-1001', disputeId: 'dsp-1' }],
    ['a dispute resolution', 'escrow/dispute-resolve', { orderId: 'MUNI-1001', outcome: 'SELLER_FAVOR' }],
  ])('403s %s from a signed-in customer', async (_label, path, body) => {
    seedHold();

    const res = await request(app)
      .post(`${BASE}/${path}`)
      .set(signedUser(BUYER_A))
      .send(body);

    // A valid session is not enough: the gateway signs one of those for every
    // logged-in browser, so only the `svc` claim separates a peer service.
    expect(res.status).toBe(403);
    expect((await holds.findByKey('MUNI-1001'))!.status).toBe('HELD');
  });

  it('lets dispute-service freeze a hold with a signed service assertion', async () => {
    seedHold();

    const res = await request(app)
      .post(`${BASE}/escrow/dispute-hold`)
      .set(signedService('dispute-service'))
      .send({ orderId: 'MUNI-1001', disputeId: 'dsp-1' });

    expect(res.status).toBe(200);
    expect((await holds.findByKey('MUNI-1001'))!.status).toBe('DISPUTE_HELD');
  });

  it('lets checkout book a hold with a signed service assertion', async () => {
    const res = await request(app)
      .post(`${BASE}/escrow`)
      .set(signedService('checkout-service'))
      .send({ orderId: 'MUNI-3003', buyerId: BUYER_A, sellerId: SELLER_A, amount: 99_000 });

    expect(res.status).toBe(201);
    expect((await holds.findByKey('MUNI-3003'))!.status).toBe('HELD');
  });
});

// ─── Admin ────────────────────────────────────────────────────────────────────

describe('the claims queue and its resolutions are admin-only', () => {
  it('403s a customer reading the admin claims queue', async () => {
    const res = await request(app).get(`${BASE}/admin/claims`).set(asUser(BUYER_A));
    expect(res.status).toBe(403);
  });

  it('403s a seller reading the admin escrow queue', async () => {
    const res = await request(app)
      .get(`${BASE}/admin/escrow`)
      .set(asUser(SELLER_A, ['ROLE_SELLER']));
    expect(res.status).toBe(403);
  });

  it('403s a claimant approving their own claim', async () => {
    const filed = await request(app).post(`${BASE}/claims`).set(asUser(BUYER_A)).send(CLAIM);

    const res = await request(app)
      .patch(`${BASE}/claims/${filed.body.data.id}/resolve`)
      .set(asUser(BUYER_A))
      .send({ status: 'APPROVED', resolutionNotes: 'pay me' });

    expect(res.status).toBe(403);
    expect((await claims.findById(filed.body.data.id))!.status).toBe('FILED');
  });

  it('lets an admin read the queue and resolve a claim', async () => {
    const filed = await request(app).post(`${BASE}/claims`).set(asUser(BUYER_A)).send(CLAIM);

    const queue = await request(app).get(`${BASE}/admin/claims`).set(asUser(ADMIN, ['ROLE_ADMIN']));
    expect(queue.status).toBe(200);
    expect(queue.body.data).toHaveLength(1);

    const resolved = await request(app)
      .patch(`${BASE}/claims/${filed.body.data.id}/resolve`)
      .set(asUser(ADMIN, ['ROLE_ADMIN']))
      .send({ status: 'APPROVED', resolutionNotes: 'Non-delivery upheld.' });

    expect(resolved.status).toBe(200);
    expect(resolved.body.data.status).toBe('APPROVED');
  });
});

// ─── Signed identity mode ─────────────────────────────────────────────────────

describe('with INTERNAL_IDENTITY_SECRET set, a raw header buys nothing', () => {
  beforeEach(() => {
    process.env.INTERNAL_IDENTITY_SECRET = SIGNING_SECRET;
  });
  afterEach(() => {
    delete process.env.INTERNAL_IDENTITY_SECRET;
  });

  const signed = (id: string, roles: string[] = ['ROLE_CUSTOMER']) => ({
    'x-internal-identity': signIdentity(id, roles) as string,
  });

  it('401s a forged x-user-id, because nothing signed it', async () => {
    const res = await request(app).get(`${BASE}/claims`).set(asUser(BUYER_A));
    expect(res.status).toBe(401);
  });

  it('accepts a properly signed assertion', async () => {
    const res = await request(app).get(`${BASE}/claims`).set(signed(BUYER_A));
    expect(res.status).toBe(200);
  });

  it('will not let a forged header override a signed identity on an escrow release', async () => {
    seedHold();

    // Signed as B, claiming to be A in the plain header. The hold is A's.
    const res = await request(app)
      .post(`${BASE}/escrow/MUNI-1001/confirm-receipt`)
      .set(signed(BUYER_B))
      .set('x-user-id', BUYER_A)
      .send({});

    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(mockReleaseEscrow).not.toHaveBeenCalled();
    expect((await holds.findByKey('MUNI-1001'))!.status).toBe('HELD');
  });

  it('403s a forged admin role on the claims queue', async () => {
    const res = await request(app)
      .get(`${BASE}/admin/claims`)
      .set(signed(BUYER_A))
      .set('x-user-roles', 'ROLE_ADMIN');

    expect(res.status).toBe(403);
  });
});
