/**
 * cod.routes.authz.test.ts
 *
 * The two COD routes where the path, not the caller, used to decide access.
 *
 *   PATCH /fulfillment/:id/cod          — carried `requireAuth` and nothing
 *     else, unlike its sibling routes which check `mayTouch`/staff. Any
 *     authenticated caller could flag any seller's parcel cash-on-delivery with
 *     an `amountDue` of their choosing, and that figure is what a rider's cash
 *     is measured against.
 *
 *   GET /cod/ledger/:riderId/:date      — admits ROLE_RIDER, and took
 *     `:riderId` as proof of which rider was asking. One rider could read
 *     another's takings, variance and reconciliation status by editing the URL.
 *
 * These drive the REAL router and the REAL shared auth middleware over
 * in-memory repositories. The ownership rule behind flagging is also covered at
 * the service level in rider-cod.test.ts; what is added here is the route
 * wiring — that the guard is actually mounted, and that identity reaches it.
 */
import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';

const { MemoryFulfillmentRepository, MemoryCodRepository, MemoryRiderRepository } = await import(
  '../repositories/memory-fulfillment.repository.js'
);

const fulfillments = new MemoryFulfillmentRepository();
const cod = new MemoryCodRepository();
const riders = new MemoryRiderRepository(fulfillments.signatures);

// The service singletons bind their repository at construction and the
// controllers use those singletons, so standing in for the Prisma module is
// what lets these drive the real route table without a database.
jest.unstable_mockModule('../repositories/prisma-fulfillment.repository.js', () => ({
  prismaFulfillmentRepository: fulfillments,
  prismaCodRepository: cod,
  prismaRiderRepository: riders,
}));

const express = (await import('express')).default;
const request = (await import('supertest')).default;
const routes = (await import('../routes/index.js')).default;
const { fulfillmentService } = await import('../services/fulfillment.service.js');
const { signIdentity } = await import('../../../../shared/utils/internal-identity.js');

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/v1', routes); // exactly as app.ts mounts it
  return app;
}

const app = makeApp();

const SELLER_A = 'seller-a';
const SELLER_B = 'seller-b';
const RIDER_1 = 'rider-1';
const RIDER_2 = 'rider-2';

/** The headers the gateway stamps once it has verified the JWT. */
const asUser = (id: string, roles: string[]) => ({
  'x-user-id': id,
  'x-user-roles': roles.join(','),
});

async function parcelForSellerA() {
  return fulfillmentService.createFulfillment({
    orderId: 'ORD-1',
    sellerId: SELLER_A,
    items: [{ productId: 'p-1', quantity: 1 }],
    shippingAddress: { city: 'Kampala' },
  } as never);
}

beforeEach(() => {
  delete process.env.INTERNAL_IDENTITY_SECRET;
});

// ─── Flagging a parcel COD ────────────────────────────────────────────────────

describe('PATCH /fulfillment/:id/cod', () => {
  it('401s with no identity', async () => {
    const f = await parcelForSellerA();

    const res = await request(app).patch(`/api/v1/fulfillment/${f.id}/cod`).send({ amountDue: 50_000 });

    expect(res.status).toBe(401);
    expect((await fulfillmentService.getFulfillment(f.id))!.paymentMethod).not.toBe('COD');
  });

  it('lets the parcel’s own seller flag it', async () => {
    const f = await parcelForSellerA();

    const res = await request(app)
      .patch(`/api/v1/fulfillment/${f.id}/cod`)
      .set(asUser(SELLER_A, ['ROLE_SELLER']))
      .send({ amountDue: 50_000 });

    expect(res.status).toBe(200);
    expect(res.body.data.codAmountDue).toBe(50_000);
  });

  it('404s another seller, and leaves the parcel prepaid', async () => {
    const f = await parcelForSellerA();

    const res = await request(app)
      .patch(`/api/v1/fulfillment/${f.id}/cod`)
      .set(asUser(SELLER_B, ['ROLE_SELLER']))
      .send({ amountDue: 50_000 });

    expect(res.status).toBe(404);
    expect((await fulfillmentService.getFulfillment(f.id))!.paymentMethod).not.toBe('COD');
  });

  it('404s a customer setting an arbitrary amount due', async () => {
    const f = await parcelForSellerA();

    const res = await request(app)
      .patch(`/api/v1/fulfillment/${f.id}/cod`)
      .set(asUser('cust-1', ['ROLE_CUSTOMER']))
      .send({ amountDue: 1 });

    expect(res.status).toBe(404);
    expect((await fulfillmentService.getFulfillment(f.id))!.codAmountDue).toBeUndefined();
  });
});

// ─── Reading a rider's cash ledger ────────────────────────────────────────────

describe('GET /cod/ledger/:riderId/:date', () => {
  const DATE = '2026-02-01';

  it('401s with no identity', async () => {
    const res = await request(app).get(`/api/v1/cod/ledger/${RIDER_1}/${DATE}`);
    expect(res.status).toBe(401);
  });

  it('lets a rider read their own ledger', async () => {
    const res = await request(app)
      .get(`/api/v1/cod/ledger/${RIDER_1}/${DATE}`)
      .set(asUser(RIDER_1, ['ROLE_RIDER']));

    expect(res.status).toBe(200);
    expect(res.body.data.riderId).toBe(RIDER_1);
  });

  it('403s a rider reading another rider’s ledger', async () => {
    const res = await request(app)
      .get(`/api/v1/cod/ledger/${RIDER_2}/${DATE}`)
      .set(asUser(RIDER_1, ['ROLE_RIDER']));

    expect(res.status).toBe(403);
    expect(JSON.stringify(res.body)).not.toContain('totalCollected');
  });

  it('lets ops read any rider’s ledger', async () => {
    const res = await request(app)
      .get(`/api/v1/cod/ledger/${RIDER_2}/${DATE}`)
      .set(asUser('ops-1', ['ROLE_OPS']));

    expect(res.status).toBe(200);
  });

  it('lets finance read any rider’s ledger — it reconciles them', async () => {
    const res = await request(app)
      .get(`/api/v1/cod/ledger/${RIDER_2}/${DATE}`)
      .set(asUser('fin-1', ['ROLE_FINANCE']));

    expect(res.status).toBe(200);
  });

  it('403s a seller, who has no business in a rider’s cash position', async () => {
    const res = await request(app)
      .get(`/api/v1/cod/ledger/${RIDER_1}/${DATE}`)
      .set(asUser(SELLER_A, ['ROLE_SELLER']));

    // requireRole refuses the route outright for a seller.
    expect(res.status).toBe(403);
  });
});

// ─── Signed identity mode ─────────────────────────────────────────────────────

describe('with INTERNAL_IDENTITY_SECRET set, a raw header buys nothing', () => {
  const SIGNING_SECRET = 'test-internal-identity-secret-32-chars-plus';

  beforeEach(() => {
    process.env.INTERNAL_IDENTITY_SECRET = SIGNING_SECRET;
  });
  afterEach(() => {
    delete process.env.INTERNAL_IDENTITY_SECRET;
  });

  const signed = (id: string, roles: string[]) => ({
    'x-internal-identity': signIdentity(id, roles) as string,
  });

  it('401s a forged x-user-id on the COD flag', async () => {
    const f = await parcelForSellerA();

    const res = await request(app)
      .patch(`/api/v1/fulfillment/${f.id}/cod`)
      .set(asUser(SELLER_A, ['ROLE_SELLER']))
      .send({ amountDue: 50_000 });

    expect(res.status).toBe(401);
    expect((await fulfillmentService.getFulfillment(f.id))!.paymentMethod).not.toBe('COD');
  });

  it('will not let a forged rider id override a signed one on the ledger', async () => {
    const res = await request(app)
      .get(`/api/v1/cod/ledger/${RIDER_2}/2026-02-01`)
      .set(signed(RIDER_1, ['ROLE_RIDER']))
      .set('x-user-id', RIDER_2);

    expect(res.status).toBe(403);
  });
});
