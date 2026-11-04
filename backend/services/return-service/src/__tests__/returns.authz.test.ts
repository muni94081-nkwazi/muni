/**
 * returns.authz.test.ts
 *
 * Who may see and change a return.
 *
 * Three defects sat behind the customer returns page, all reproduced against a
 * running service before this fix:
 *
 *   1. No requireAuth on any customer route. An unauthenticated POST created a
 *      return owned by the hardcoded 'user-123' and answered 201.
 *   2. GET /returns/:id took an id and returned whatever it found. Customer B
 *      read customer A's return — order id, seller, items, reasons — with a 200.
 *   3. PATCH /returns/:id/cancel had neither an ownership check nor a state
 *      check, so any caller could cancel any return from any state, including
 *      one already REFUNDED.
 *
 * These run the real router, the real auth middleware and the real service
 * against the in-memory repository, so they check the behaviour rather than a
 * description of it.
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';

jest.unstable_mockModule('../../../../shared/kafka/producer.js', () => ({
  publish: jest.fn<() => Promise<void>>().mockResolvedValue(),
  getProducer: jest.fn().mockReturnValue(null),
  connectProducer: jest.fn<() => Promise<void>>().mockResolvedValue(),
  disconnectProducer: jest.fn<() => Promise<void>>().mockResolvedValue(),
  isProducerReady: jest.fn<() => boolean>().mockReturnValue(true),
}));

jest.unstable_mockModule('../db/prisma.js', () => ({
  prisma: {}, connectDB: async () => undefined, disconnectDB: async () => undefined,
}));

// order-service, at the client boundary. These tests are about WHO may act on
// a return; the order behind it is a delivered one belonging to whoever is
// asking, so ownership of the order is never what fails here.
const mockFetchOrder = jest.fn<(orderId: string, buyerId: string) => Promise<unknown>>(
  async (orderId: string, buyerId: string) => ({
    id: orderId,
    userId: buyerId,
    subOrders: [{
      id: 'sub-1',
      sellerId: 'seller-a',
      status: 'delivered',
      deliveredAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
      items: [{ id: 'oi-1', productId: 'p-1', quantity: 5 }],
    }],
  }),
);

jest.unstable_mockModule('../clients/order.client.js', () => ({
  fetchOrderForBuyer: mockFetchOrder,
  orderClient: { fetchOrderForBuyer: mockFetchOrder },
  OrderVerificationError: class extends Error {
    constructor(readonly status: number, message: string, readonly reason: string) { super(message); }
  },
}));

const express = (await import('express')).default;
const request = (await import('supertest')).default;
const { MemoryReturnRepository } = await import('../repositories/memory-return.repository.js');
const service = await import('../services/return.service.js');
const routes = (await import('../routes/index.js')).default;

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/v1', routes);   // exactly as app.ts mounts it

  // The same error handler app.ts installs, so validation failures surface as
  // the 422 the service really returns rather than an unhandled rejection.
  app.use((error: any, _req: any, res: any, _next: any) => {
    if (error.name === 'ZodError') {
      res.status(422).json({ message: 'Validation failed', issues: error.issues });
      return;
    }
    res.status(error.status ?? 500).json({ message: error.message ?? 'Internal server error' });
  });

  return app;
}

const app = makeApp();

/** The header the gateway stamps after verifying a JWT. */
const asUser = (id: string) => ({ 'x-user-id': id });

const PAYLOAD = {
  orderId: 'ORD-A1',
  sellerId: 'seller-a',
  items: [{ orderItemId: 'oi-1', quantity: 1, reason: 'CHANGED_MIND' }],
  refundMethod: 'ORIGINAL_PAYMENT_METHOD',
};

async function createFor(userId: string, over: Record<string, unknown> = {}) {
  const res = await request(app).post('/api/v1/returns').set(asUser(userId)).send({ ...PAYLOAD, ...over });
  return res.body.data as { id: string; userId: string; status: string };
}

beforeEach(() => {
  service.setReturnRepository(new MemoryReturnRepository());
});

describe('every customer route requires an authenticated identity', () => {
  it('401s a create with no identity, rather than filing it under user-123', async () => {
    const res = await request(app).post('/api/v1/returns').send(PAYLOAD);

    expect(res.status).toBe(401);
    expect(JSON.stringify(res.body)).not.toContain('user-123');
  });

  it('401s the list with no identity', async () => {
    const res = await request(app).get('/api/v1/returns');
    expect(res.status).toBe(401);
  });

  it('401s a read with no identity', async () => {
    const created = await createFor('cust-A');
    const res = await request(app).get(`/api/v1/returns/${created.id}`);
    expect(res.status).toBe(401);
  });

  it('401s a cancel with no identity', async () => {
    const created = await createFor('cust-A');
    const res = await request(app).patch(`/api/v1/returns/${created.id}/cancel`);
    expect(res.status).toBe(401);
  });
});

describe('a return belongs to the customer who raised it', () => {
  it('files the return against the session, not the payload', async () => {
    const created = await createFor('cust-A', { userId: 'cust-B' });
    expect(created.userId).toBe('cust-A');
  });

  it('lists only the caller’s own returns', async () => {
    await createFor('cust-A');
    await createFor('cust-B');

    const res = await request(app).get('/api/v1/returns').set(asUser('cust-B'));

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].userId).toBe('cust-B');
  });

  it('lets the owner read their own return', async () => {
    const created = await createFor('cust-A');

    const res = await request(app).get(`/api/v1/returns/${created.id}`).set(asUser('cust-A'));

    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe(created.id);
  });

  it('refuses another customer reading it, and reveals nothing', async () => {
    const created = await createFor('cust-A');

    const res = await request(app).get(`/api/v1/returns/${created.id}`).set(asUser('cust-B'));

    expect(res.status).toBe(404);
    expect(JSON.stringify(res.body)).not.toContain('ORD-A1');
    expect(JSON.stringify(res.body)).not.toContain('seller-a');
  });

  it('answers another customer’s return exactly like one that does not exist', async () => {
    const created = await createFor('cust-A');

    const other = await request(app).get(`/api/v1/returns/${created.id}`).set(asUser('cust-B'));
    const missing = await request(app).get('/api/v1/returns/no-such-return').set(asUser('cust-B'));

    expect(other.status).toBe(missing.status);
    expect(other.body).toEqual(missing.body);
  });
});

describe('cancelling is owner-only and state-checked', () => {
  it('lets the owner cancel a return that is still REQUESTED', async () => {
    const created = await createFor('cust-A');
    expect(created.status).toBe('REQUESTED');

    const res = await request(app).patch(`/api/v1/returns/${created.id}/cancel`).set(asUser('cust-A'));

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('CANCELLED');
  });

  it('refuses another customer cancelling it, and leaves it untouched', async () => {
    const created = await createFor('cust-A');

    const res = await request(app).patch(`/api/v1/returns/${created.id}/cancel`).set(asUser('cust-B'));
    expect(res.status).toBe(404);

    const still = await request(app).get(`/api/v1/returns/${created.id}`).set(asUser('cust-A'));
    expect(still.body.data.status).toBe('REQUESTED');
  });

  it('refuses cancelling a return that has already been refunded', async () => {
    const created = await createFor('cust-A');
    await service.updateStatus(created.id, 'REFUNDED');

    const res = await request(app).patch(`/api/v1/returns/${created.id}/cancel`).set(asUser('cust-A'));

    expect(res.status).toBe(409);

    const still = await request(app).get(`/api/v1/returns/${created.id}`).set(asUser('cust-A'));
    expect(still.body.data.status).toBe('REFUNDED');
  });

  it('refuses cancelling an already-cancelled return', async () => {
    const created = await createFor('cust-A');
    await request(app).patch(`/api/v1/returns/${created.id}/cancel`).set(asUser('cust-A'));

    const again = await request(app).patch(`/api/v1/returns/${created.id}/cancel`).set(asUser('cust-A'));

    expect(again.status).toBe(409);
  });
});

describe('privileged fields cannot be set from the browser', () => {
  it('ignores a refundAmount in the request body', async () => {
    // ReturnRequestSchema defines no refundAmount and Zod drops unknown keys.
    const created = await createFor('cust-A', { refundAmount: 999999, currency: 'UGX' });

    expect(created).not.toMatchObject({ refundAmount: 999999 });
    const res = await request(app).get(`/api/v1/returns/${created.id}`).set(asUser('cust-A'));
    expect(res.body.data.refundAmount).toBeNull();
  });

  it('ignores a status in the request body — a customer cannot self-approve', async () => {
    const created = await createFor('cust-A', { status: 'REFUNDED', isAutoApproved: true });

    expect(created.status).toBe('REQUESTED');
  });

  it('rejects a payload missing required fields', async () => {
    const res = await request(app).post('/api/v1/returns').set(asUser('cust-A')).send({ orderId: 'ORD-A1' });

    expect(res.status).toBeGreaterThanOrEqual(400);
  });
});

describe('seller and admin routes stay closed to customers', () => {
  it('403s a customer asking for the seller queue', async () => {
    const res = await request(app).get('/api/v1/seller/returns').set(asUser('cust-A'));
    expect(res.status).toBe(403);
  });

  it('403s a customer asking for the admin queue', async () => {
    const res = await request(app).get('/api/v1/admin/returns').set(asUser('cust-A'));
    expect(res.status).toBe(403);
  });

  it('403s a customer trying to set a return’s status', async () => {
    const created = await createFor('cust-A');

    const res = await request(app)
      .patch(`/api/v1/admin/returns/${created.id}/status`)
      .set(asUser('cust-A'))
      .send({ status: 'REFUNDED' });

    expect(res.status).toBe(403);
  });
});
