/**
 * disputes.authz.test.ts
 *
 * Who may see and change a dispute.
 *
 * This service shipped with no route guards at all. It carried a local
 * auth.middleware.ts that nothing imported, so every route — filing, reading,
 * evidence, the seller's response, escalation to arbitration, and the whole
 * admin queue — was reachable by any caller who could open a socket to the
 * port. When no identity arrived the controllers invented one: 'user-123' for
 * buyers, 'seller-001' for sellers, 'admin-001' for arbitration.
 *
 * The seller path was the sharpest edge. The service layer did check
 * `dispute.sellerId !== sellerId` before letting a seller respond or resolve —
 * but the controller took that sellerId from `req.body.sellerId`, so the check
 * compared the caller's own claim against itself and passed for anyone.
 *
 * These run the REAL router, the REAL shared auth middleware and the REAL
 * service against an in-memory repository, so they check the behaviour rather
 * than a description of it.
 *
 * Both identity modes are covered, because they fail differently:
 *   header mode — INTERNAL_IDENTITY_SECRET unset; the gateway's x-user-id is
 *                 trusted, as it is in a dev checkout.
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

jest.unstable_mockModule('../clients/buyer-protection.client.js', () => ({
  buyerProtectionClient: {
    holdForDispute: jest.fn<() => Promise<void>>().mockResolvedValue(),
    resolveDisputeHold: jest.fn<() => Promise<void>>().mockResolvedValue(),
  },
}));

// Order verification is exercised in disputes.order-validation.test.ts. Here
// every filing is for the filer's own order, so authorization is what is under
// test rather than order lookup.
jest.unstable_mockModule('../clients/order.client.js', () => ({
  orderClient: {
    fetchOrderForBuyer: jest.fn(async (orderId: string, buyerId: string) => ({
      id: orderId,
      userId: buyerId,
      items: [{ sellerId: 'seller-a' }, { sellerId: 'seller-b' }],
      subOrders: [
        { id: 'sub-a', sellerId: 'seller-a' },
        { id: 'sub-b', sellerId: 'seller-b' },
      ],
    })),
  },
  OrderVerificationError: class OrderVerificationError extends Error {
    constructor(public status: number, message: string, public reason: string) { super(message); }
  },
}));

jest.unstable_mockModule('../clients/user-service.client.js', () => ({
  userServiceClient: {
    recordSellerTrustEvent: jest.fn<() => Promise<void>>().mockResolvedValue(),
  },
}));

// The exported `disputeService` singleton binds its repository at construction,
// and the controllers use that singleton. Standing in for the Prisma repo is
// what lets these drive the real controllers without a database.
const { MemoryDisputeRepository } = await import('../repositories/memory-dispute.repository.js');
const repo = new MemoryDisputeRepository();
jest.unstable_mockModule('../repositories/prisma-dispute.repository.js', () => ({
  prismaDisputeRepository: repo,
}));

const express = (await import('express')).default;
const request = (await import('supertest')).default;
const { router } = await import('../routes/index.js');
const { signIdentity } = await import('../../../../shared/utils/internal-identity.js');

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/v1', router); // exactly as app.ts mounts it
  return app;
}

const app = makeApp();

const BUYER_A = 'cust-a';
const BUYER_B = 'cust-b';
const SELLER_A = 'seller-a';
const SELLER_B = 'seller-b';
const ADMIN = 'admin-a';

const SIGNING_SECRET = 'test-internal-identity-secret-32-chars-plus';

/** The headers the gateway stamps once it has verified the JWT. */
const asUser = (id: string, roles: string[] = ['ROLE_CUSTOMER']) => ({
  'x-user-id': id,
  'x-user-roles': roles.join(','),
});

const FILING = {
  orderId: 'MUNI-9001',
  sellerId: SELLER_A,
  claimType: 'NON_DELIVERY' as const,
  description: 'Marked delivered, never arrived.',
  claimAmountUGX: 250_000,
  evidence: [{ url: 'https://muni.ug/evidence/a.jpg' }],
};

async function fileAs(userId: string, over: Record<string, unknown> = {}) {
  const res = await request(app)
    .post('/api/v1/disputes')
    .set(asUser(userId))
    .send({ ...FILING, ...over });
  return res.body.data as { id: string; buyerId: string; sellerId: string; status: string };
}

beforeEach(() => {
  delete process.env.INTERNAL_IDENTITY_SECRET;
  repo.clear();
});

// ─── Authentication ───────────────────────────────────────────────────────────

describe('every dispute route requires an authenticated identity', () => {
  it('401s a filing with no identity, rather than opening it as user-123', async () => {
    const res = await request(app).post('/api/v1/disputes').send(FILING);

    expect(res.status).toBe(401);
    expect(JSON.stringify(res.body)).not.toContain('user-123');
  });

  it('401s reading a dispute with no identity', async () => {
    const filed = await fileAs(BUYER_A);
    const res = await request(app).get(`/api/v1/disputes/${filed.id}`);
    expect(res.status).toBe(401);
  });

  it('401s the caller’s own list with no identity', async () => {
    const res = await request(app).get('/api/v1/disputes/mine');
    expect(res.status).toBe(401);
  });

  it.each([
    ['evidence', 'post', (id: string) => `/api/v1/disputes/${id}/evidence`],
    ['escalation', 'post', (id: string) => `/api/v1/disputes/${id}/escalate`],
    ['a seller response', 'post', (id: string) => `/api/v1/disputes/${id}/respond`],
    ['a seller resolution', 'post', (id: string) => `/api/v1/disputes/${id}/resolve`],
  ])('401s %s with no identity', async (_label, method, path) => {
    const filed = await fileAs(BUYER_A);
    const res = await (request(app) as never as Record<string, (p: string) => never>)[method](
      path(filed.id),
    );
    expect((res as { status: number }).status).toBe(401);
  });

  it('401s every admin route with no identity', async () => {
    const filed = await fileAs(BUYER_A);

    const list = await request(app).get('/api/v1/admin/disputes');
    const dash = await request(app).get('/api/v1/admin/disputes/dashboard');
    const resolve = await request(app)
      .patch(`/api/v1/admin/disputes/${filed.id}/resolve`)
      .send({ resolution: 'RESOLVED_BUYER_FAVOR' });

    expect([list.status, dash.status, resolve.status]).toEqual([401, 401, 401]);
    expect(JSON.stringify(resolve.body)).not.toContain('admin-001');
  });
});

// ─── Customer ownership ───────────────────────────────────────────────────────

describe('a dispute belongs to the two parties named on it', () => {
  it('files the dispute against the session, not the payload', async () => {
    const filed = await fileAs(BUYER_A, { buyerId: BUYER_B });
    expect(filed.buyerId).toBe(BUYER_A);
  });

  it('lets the buyer read their own dispute', async () => {
    const filed = await fileAs(BUYER_A);

    const res = await request(app).get(`/api/v1/disputes/${filed.id}`).set(asUser(BUYER_A));

    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe(filed.id);
  });

  it('lets the seller on the dispute read it too', async () => {
    const filed = await fileAs(BUYER_A);

    const res = await request(app)
      .get(`/api/v1/disputes/${filed.id}`)
      .set(asUser(SELLER_A, ['ROLE_SELLER']));

    expect(res.status).toBe(200);
  });

  it('refuses another customer reading it, and reveals nothing', async () => {
    const filed = await fileAs(BUYER_A);

    const res = await request(app).get(`/api/v1/disputes/${filed.id}`).set(asUser(BUYER_B));

    expect(res.status).toBe(404);
    const body = JSON.stringify(res.body);
    expect(body).not.toContain('MUNI-9001');
    expect(body).not.toContain(SELLER_A);
    expect(body).not.toContain('never arrived');
  });

  it('answers another customer’s dispute exactly like one that does not exist', async () => {
    const filed = await fileAs(BUYER_A);

    const other = await request(app).get(`/api/v1/disputes/${filed.id}`).set(asUser(BUYER_B));
    const missing = await request(app).get('/api/v1/disputes/no-such-dispute').set(asUser(BUYER_B));

    expect(other.status).toBe(missing.status);
    expect(other.body).toEqual(missing.body);
  });

  it('lists only the caller’s own disputes', async () => {
    await fileAs(BUYER_A);
    await fileAs(BUYER_B);

    const res = await request(app).get('/api/v1/disputes/mine').set(asUser(BUYER_B));

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].buyerId).toBe(BUYER_B);
  });

  it('cannot list another customer’s disputes by asking for the seller view', async () => {
    await fileAs(BUYER_A);

    const res = await request(app).get('/api/v1/disputes/mine?role=seller').set(asUser(BUYER_B));

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
  });
});

// ─── Customer mutations ───────────────────────────────────────────────────────

describe('a stranger cannot change a dispute they are not party to', () => {
  it('refuses evidence from a customer who is not on the dispute', async () => {
    const filed = await fileAs(BUYER_A);

    const res = await request(app)
      .post(`/api/v1/disputes/${filed.id}/evidence`)
      .set(asUser(BUYER_B))
      .send({ evidence: [{ url: 'https://muni.ug/evidence/planted.jpg' }] });

    expect(res.status).toBe(404);

    const still = await request(app).get(`/api/v1/disputes/${filed.id}`).set(asUser(BUYER_A));
    expect(still.body.data.evidence).toHaveLength(1);
  });

  it('attributes evidence to the uploader’s real side, not a claimed one', async () => {
    const filed = await fileAs(BUYER_A);

    await request(app)
      .post(`/api/v1/disputes/${filed.id}/evidence`)
      .set(asUser(BUYER_A))
      // The old handler read this and labelled the upload with it.
      .send({ role: 'seller', evidence: [{ url: 'https://muni.ug/evidence/b.jpg' }] });

    const res = await request(app).get(`/api/v1/disputes/${filed.id}`).set(asUser(BUYER_A));
    expect(res.body.data.evidence.map((e: { uploadedByRole: string }) => e.uploadedByRole)).toEqual([
      'buyer',
      'buyer',
    ]);
  });

  it('refuses escalation by a customer who is not on the dispute, and leaves the status alone', async () => {
    const filed = await fileAs(BUYER_A);

    const res = await request(app)
      .post(`/api/v1/disputes/${filed.id}/escalate`)
      .set(asUser(BUYER_B))
      .send({ reason: 'give me this one' });

    expect(res.status).toBe(404);

    const still = await request(app).get(`/api/v1/disputes/${filed.id}`).set(asUser(BUYER_A));
    expect(still.body.data.status).toBe('OPENED');
  });

  it('lets the buyer escalate their own dispute', async () => {
    const filed = await fileAs(BUYER_A);

    const res = await request(app)
      .post(`/api/v1/disputes/${filed.id}/escalate`)
      .set(asUser(BUYER_A))
      .send({ reason: 'no response' });

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('ARBITRATION');
  });
});

// ─── Seller authorization ─────────────────────────────────────────────────────

describe('seller actions belong to the seller on the dispute', () => {
  it('lets the seller on the dispute respond', async () => {
    const filed = await fileAs(BUYER_A);

    const res = await request(app)
      .post(`/api/v1/disputes/${filed.id}/respond`)
      .set(asUser(SELLER_A, ['ROLE_SELLER']))
      .send({ responseContent: 'Reshipping today.' });

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('SELLER_RESPONDED');
  });

  it('refuses another seller responding on it', async () => {
    const filed = await fileAs(BUYER_A);

    const res = await request(app)
      .post(`/api/v1/disputes/${filed.id}/respond`)
      .set(asUser(SELLER_B, ['ROLE_SELLER']))
      .send({ responseContent: 'Not my order.' });

    expect(res.status).toBeGreaterThanOrEqual(400);

    const still = await request(app).get(`/api/v1/disputes/${filed.id}`).set(asUser(BUYER_A));
    expect(still.body.data.status).toBe('OPENED');
  });

  it('ignores a sellerId in the body — it was how one seller became another', async () => {
    const filed = await fileAs(BUYER_A);

    const res = await request(app)
      .post(`/api/v1/disputes/${filed.id}/resolve`)
      .set(asUser(SELLER_B, ['ROLE_SELLER']))
      .send({ sellerId: SELLER_A, action: 'REFUND_FULL' });

    expect(res.status).toBeGreaterThanOrEqual(400);

    const still = await request(app).get(`/api/v1/disputes/${filed.id}`).set(asUser(BUYER_A));
    expect(still.body.data.status).toBe('OPENED');
    expect(still.body.data.refundAmountUGX).toBeUndefined();
  });

  it('refuses a customer using the seller routes at all', async () => {
    const filed = await fileAs(BUYER_A);

    const res = await request(app)
      .post(`/api/v1/disputes/${filed.id}/respond`)
      .set(asUser(BUYER_A))
      .send({ responseContent: 'resolving my own claim' });

    expect(res.status).toBe(403);
  });

  it('refuses a seller performing admin arbitration', async () => {
    const filed = await fileAs(BUYER_A);

    const res = await request(app)
      .patch(`/api/v1/admin/disputes/${filed.id}/resolve`)
      .set(asUser(SELLER_A, ['ROLE_SELLER']))
      .send({ resolution: 'RESOLVED_SELLER_FAVOR' });

    expect(res.status).toBe(403);
  });
});

// ─── Admin authorization ──────────────────────────────────────────────────────

describe('the arbitration queue is admin-only', () => {
  it.each([
    ['the queue', '/api/v1/admin/disputes'],
    ['the dashboard', '/api/v1/admin/disputes/dashboard'],
  ])('403s a customer asking for %s', async (_label, path) => {
    const res = await request(app).get(path).set(asUser(BUYER_A));
    expect(res.status).toBe(403);
  });

  it.each([
    ['the queue', '/api/v1/admin/disputes'],
    ['the dashboard', '/api/v1/admin/disputes/dashboard'],
  ])('403s a seller asking for %s', async (_label, path) => {
    const res = await request(app).get(path).set(asUser(SELLER_A, ['ROLE_SELLER']));
    expect(res.status).toBe(403);
  });

  it('403s a customer trying to arbitrate their own dispute in their own favour', async () => {
    const filed = await fileAs(BUYER_A);

    const res = await request(app)
      .patch(`/api/v1/admin/disputes/${filed.id}/resolve`)
      .set(asUser(BUYER_A))
      .send({ resolution: 'RESOLVED_BUYER_FAVOR' });

    expect(res.status).toBe(403);

    const still = await request(app).get(`/api/v1/disputes/${filed.id}`).set(asUser(BUYER_A));
    expect(still.body.data.status).toBe('OPENED');
  });

  it('lets an admin read the queue and arbitrate', async () => {
    const filed = await fileAs(BUYER_A);

    const queue = await request(app)
      .get('/api/v1/admin/disputes')
      .set(asUser(ADMIN, ['ROLE_ADMIN']));
    expect(queue.status).toBe(200);
    expect(queue.body.data.total).toBe(1);

    const resolved = await request(app)
      .patch(`/api/v1/admin/disputes/${filed.id}/resolve`)
      .set(asUser(ADMIN, ['ROLE_ADMIN']))
      .send({ resolution: 'RESOLVED_BUYER_FAVOR', note: 'Non-delivery upheld.' });

    expect(resolved.status).toBe(200);
    expect(resolved.body.data.status).toBe('RESOLVED_BUYER_FAVOR');
    // The acting admin is recorded from the session, not defaulted to admin-001.
    expect(resolved.body.data.adminId).toBe(ADMIN);
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

  /** What the gateway sends once it has verified the JWT itself. */
  function signed(id: string, roles: string[] = ['ROLE_CUSTOMER']) {
    return { 'x-internal-identity': signIdentity(id, roles) as string };
  }

  it('401s a forged x-user-id, because nothing signed it', async () => {
    const res = await request(app).get('/api/v1/disputes/mine').set(asUser(BUYER_A));
    expect(res.status).toBe(401);
  });

  it('accepts a properly signed assertion', async () => {
    const res = await request(app).get('/api/v1/disputes/mine').set(signed(BUYER_A));
    expect(res.status).toBe(200);
  });

  it('will not let a forged header override a signed identity', async () => {
    const filed = await request(app)
      .post('/api/v1/disputes')
      .set(signed(BUYER_A))
      .send(FILING);
    expect(filed.status).toBe(201);

    // Signed as B, but claiming to be A in the plain header.
    const res = await request(app)
      .get(`/api/v1/disputes/${filed.body.data.id}`)
      .set(signed(BUYER_B))
      .set('x-user-id', BUYER_A);

    expect(res.status).toBe(404);
  });

  it('403s a signed customer on an admin route', async () => {
    const res = await request(app).get('/api/v1/admin/disputes').set(signed(BUYER_A));
    expect(res.status).toBe(403);
  });
});

// ─── Filing ownership ─────────────────────────────────────────────────────────

describe('filing a dispute', () => {
  it('records the filer as the buyer even when the body says otherwise', async () => {
    const filed = await fileAs(BUYER_B, { buyerId: BUYER_A, userId: BUYER_A });

    expect(filed.buyerId).toBe(BUYER_B);

    // And it is B's dispute in every later read: A cannot see it.
    const asA = await request(app).get(`/api/v1/disputes/${filed.id}`).set(asUser(BUYER_A));
    expect(asA.status).toBe(404);
  });

  // Phase 3A left orderId/sellerId unverified; Phase 3A.1 closed that. The
  // order here resolves as the filer's own with both sellers on it, so the
  // filing stands — and the seller recorded is the one that was verified.
  // The rejection paths live in disputes.order-validation.test.ts.
  it('records the verified seller from the filing', async () => {
    const filed = await fileAs(BUYER_A, { sellerId: SELLER_B });

    expect(filed.buyerId).toBe(BUYER_A);
    expect(filed.sellerId).toBe(SELLER_B);
  });
});
