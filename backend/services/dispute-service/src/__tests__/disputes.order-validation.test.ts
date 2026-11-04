/**
 * disputes.order-validation.test.ts
 *
 * Whether a filing describes an order the filer actually placed.
 *
 * Phase 3A fixed who the filer is. It left what they were filing about
 * unchecked: `orderId` and `sellerId` were whatever the client typed, and both
 * carry consequences for a third party — `holdForDispute` freezes the named
 * seller's payout, `recordSellerTrustEvent` records a DISPUTE_OPENED against
 * them. So any authenticated buyer could freeze an unrelated seller's money by
 * filing against an order that seller had never seen.
 *
 * order-service is the authority. These drive the real verification through the
 * real router and controller, with the order client standing in for the HTTP
 * call so each test can set what order-service would have said.
 *
 * MUNI orders are multi-seller — an Order carries subOrders[], each with its
 * own sellerId, and items[] likewise — so the fixtures below are multi-seller
 * and the seller check is tested against that real structure, not an assumed
 * one-order-one-seller shape.
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';

jest.unstable_mockModule('../../../../shared/kafka/producer.js', () => ({
  publish: jest.fn<() => Promise<void>>().mockResolvedValue(),
  connectProducer: jest.fn<() => Promise<void>>().mockResolvedValue(),
  disconnectProducer: jest.fn<() => Promise<void>>().mockResolvedValue(),
  isProducerReady: jest.fn<() => boolean>().mockReturnValue(true),
}));

const holdForDispute = jest.fn<() => Promise<void>>().mockResolvedValue();
jest.unstable_mockModule('../clients/buyer-protection.client.js', () => ({
  buyerProtectionClient: {
    holdForDispute,
    resolveDisputeHold: jest.fn<() => Promise<void>>().mockResolvedValue(),
  },
}));

const recordSellerTrustEvent = jest.fn<() => Promise<void>>().mockResolvedValue();
jest.unstable_mockModule('../clients/user-service.client.js', () => ({
  userServiceClient: { recordSellerTrustEvent },
}));

/**
 * Stands in for the HTTP call only. The class below is the same one
 * dispute.service.ts imports and instanceof-checks, so the mapping from a
 * verification failure to a status is the real one.
 */
class OrderVerificationError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly reason: 'not_found' | 'unavailable',
  ) {
    super(message);
    this.name = 'OrderVerificationError';
  }
}

/** Typed so mockImplementation/mockRejectedValue keep their argument types. */
type FetchOrder = (orderId: string, buyerId: string) => Promise<{
  id: string;
  userId: string;
  items?: { sellerId?: string }[];
  subOrders?: { id?: string; sellerId?: string }[];
}>;

const fetchOrderForBuyer = jest.fn<FetchOrder>();
jest.unstable_mockModule('../clients/order.client.js', () => ({
  orderClient: { fetchOrderForBuyer },
  fetchOrderForBuyer,
  OrderVerificationError,
}));

const { MemoryDisputeRepository } = await import('../repositories/memory-dispute.repository.js');
const repo = new MemoryDisputeRepository();
jest.unstable_mockModule('../repositories/prisma-dispute.repository.js', () => ({
  prismaDisputeRepository: repo,
}));

const express = (await import('express')).default;
const request = (await import('supertest')).default;
const { router } = await import('../routes/index.js');

const app = express();
app.use(express.json());
app.use('/api/v1', router); // exactly as app.ts mounts it

const BUYER_A = 'cust-a';
const BUYER_B = 'cust-b';
const SELLER_ON_ORDER = 'seller-onorder';
const SECOND_SELLER = 'seller-second';
const UNRELATED_SELLER = 'seller-unrelated';

const asUser = (id: string) => ({ 'x-user-id': id, 'x-user-roles': 'ROLE_CUSTOMER' });

/**
 * A real MUNI order shape: two sellers, each with their own sub-order, and
 * line items carrying the seller too.
 */
function multiSellerOrder(orderId: string, buyerId: string) {
  return {
    id: orderId,
    userId: buyerId,
    items: [{ sellerId: SELLER_ON_ORDER }, { sellerId: SECOND_SELLER }],
    subOrders: [
      { id: 'sub-first', sellerId: SELLER_ON_ORDER },
      { id: 'sub-second', sellerId: SECOND_SELLER },
    ],
  };
}

const FILING = {
  orderId: 'MUNI-ORD-1',
  sellerId: SELLER_ON_ORDER,
  claimType: 'NON_DELIVERY' as const,
  description: 'Marked delivered, never arrived.',
  claimAmountUGX: 250_000,
  evidence: [{ url: 'https://muni.ug/evidence/a.jpg' }],
};

const file = (userId: string, over: Record<string, unknown> = {}) =>
  request(app).post('/api/v1/disputes').set(asUser(userId)).send({ ...FILING, ...over });

/** How many disputes exist right now, whoever they belong to. */
async function disputeCount(): Promise<number> {
  return (await repo.findAll()).length;
}

beforeEach(() => {
  delete process.env.INTERNAL_IDENTITY_SECRET;
  repo.clear();
  fetchOrderForBuyer.mockReset();
  holdForDispute.mockClear();
  recordSellerTrustEvent.mockClear();

  // Default: order-service confirms the order belongs to whoever asked.
  fetchOrderForBuyer.mockImplementation(
    async (orderId: string, buyerId: string) => multiSellerOrder(orderId, buyerId),
  );
});

// ─── The happy path ───────────────────────────────────────────────────────────

describe('a filing for the buyer’s own order, against a seller on it', () => {
  it('is created, and records the authenticated buyer', async () => {
    const res = await file(BUYER_A);

    expect(res.status).toBe(201);
    expect(res.body.data.buyerId).toBe(BUYER_A);
    expect(res.body.data.orderId).toBe('MUNI-ORD-1');
    expect(res.body.data.sellerId).toBe(SELLER_ON_ORDER);
  });

  it('verifies the order as the authenticated buyer, not as anyone named in the body', async () => {
    await file(BUYER_A, { buyerId: BUYER_B, userId: BUYER_B });

    expect(fetchOrderForBuyer).toHaveBeenCalledWith('MUNI-ORD-1', BUYER_A);
  });

  it('accepts any seller on the order, not just the first', async () => {
    const res = await file(BUYER_A, { sellerId: SECOND_SELLER });

    expect(res.status).toBe(201);
    expect(res.body.data.sellerId).toBe(SECOND_SELLER);
  });

  it('accepts a sub-order belonging to that seller', async () => {
    const res = await file(BUYER_A, { sellerId: SECOND_SELLER, subOrderId: 'sub-second' });

    expect(res.status).toBe(201);
  });

  it('verifies before it writes, and only then places the payout hold', async () => {
    await file(BUYER_A);

    expect(fetchOrderForBuyer).toHaveBeenCalledTimes(1);
    expect(holdForDispute).toHaveBeenCalledTimes(1);
    expect(await disputeCount()).toBe(1);
  });
});

// ─── Case A — the order does not exist ────────────────────────────────────────

describe('an order that does not exist', () => {
  beforeEach(() => {
    fetchOrderForBuyer.mockRejectedValue(
      new OrderVerificationError(404, 'Order not found', 'not_found'),
    );
  });

  it('is refused with a 404 and creates nothing', async () => {
    const res = await file(BUYER_A, { orderId: 'NO-SUCH-ORDER' });

    expect(res.status).toBe(404);
    expect(await disputeCount()).toBe(0);
  });

  it('places no payout hold and records no trust event against the named seller', async () => {
    await file(BUYER_A, { orderId: 'NO-SUCH-ORDER' });

    expect(holdForDispute).not.toHaveBeenCalled();
    expect(recordSellerTrustEvent).not.toHaveBeenCalled();
  });
});

// ─── Case B — another customer's order ────────────────────────────────────────

describe('another customer’s order', () => {
  beforeEach(() => {
    // What order-service really answers: 403, which the client collapses to a
    // non-disclosing not_found.
    fetchOrderForBuyer.mockImplementation(async (orderId: string, buyerId: string) => {
      if (buyerId !== BUYER_A) {
        throw new OrderVerificationError(404, 'Order not found', 'not_found');
      }
      return multiSellerOrder(orderId, BUYER_A);
    });
  });

  it('is refused for the other customer, and creates nothing', async () => {
    const res = await file(BUYER_B, { orderId: 'MUNI-ORD-1' });

    expect(res.status).toBe(404);
    expect(await disputeCount()).toBe(0);
  });

  it('answers exactly like an order that does not exist', async () => {
    const foreign = await file(BUYER_B, { orderId: 'MUNI-ORD-1' });
    const missing = await file(BUYER_B, { orderId: 'NO-SUCH-ORDER' });

    expect(foreign.status).toBe(missing.status);
    expect(foreign.body).toEqual(missing.body);
  });

  it('leaks nothing about the real order', async () => {
    const res = await file(BUYER_B, { orderId: 'MUNI-ORD-1' });

    const body = JSON.stringify(res.body);
    expect(body).not.toContain(BUYER_A);
    expect(body).not.toContain(SELLER_ON_ORDER);
    expect(body).not.toContain('sub-first');
  });

  it('still lets the real owner file against it', async () => {
    const res = await file(BUYER_A);
    expect(res.status).toBe(201);
  });
});

// ─── Case C — a seller who is not on the order ────────────────────────────────

describe('a seller who is not on the order', () => {
  it('is refused, and creates nothing', async () => {
    const res = await file(BUYER_A, { sellerId: UNRELATED_SELLER });

    expect(res.status).toBe(422);
    expect(await disputeCount()).toBe(0);
  });

  it('freezes nobody’s payout', async () => {
    await file(BUYER_A, { sellerId: UNRELATED_SELLER });

    expect(holdForDispute).not.toHaveBeenCalled();
    expect(recordSellerTrustEvent).not.toHaveBeenCalled();
  });

  it('does not enumerate who is on the order', async () => {
    const res = await file(BUYER_A, { sellerId: UNRELATED_SELLER });

    const body = JSON.stringify(res.body);
    expect(body).not.toContain(SELLER_ON_ORDER);
    expect(body).not.toContain(SECOND_SELLER);
  });

  it('takes the seller list from the order data, not from the request', async () => {
    // An order with a single seller: the second seller is no longer valid.
    fetchOrderForBuyer.mockImplementation(async (orderId: string, buyerId: string) => ({
      id: orderId,
      userId: buyerId,
      items: [{ sellerId: SELLER_ON_ORDER }],
      subOrders: [{ id: 'sub-first', sellerId: SELLER_ON_ORDER }],
    }));

    const ok = await file(BUYER_A, { sellerId: SELLER_ON_ORDER });
    const rejected = await file(BUYER_A, { sellerId: SECOND_SELLER });

    expect(ok.status).toBe(201);
    expect(rejected.status).toBe(422);
  });

  it('refuses a sub-order that belongs to a different seller on the same order', async () => {
    const res = await file(BUYER_A, { sellerId: SELLER_ON_ORDER, subOrderId: 'sub-second' });

    expect(res.status).toBe(422);
    expect(await disputeCount()).toBe(0);
    expect(holdForDispute).not.toHaveBeenCalled();
  });

  it('refuses a sub-order that is not on the order at all', async () => {
    const res = await file(BUYER_A, { subOrderId: 'sub-from-another-order' });

    expect(res.status).toBe(422);
    expect(await disputeCount()).toBe(0);
  });
});

// ─── Cases D and E — forged identity in the payload ───────────────────────────

describe('identity in the request body changes nothing', () => {
  it('files under the session when the body names another buyer', async () => {
    const res = await file(BUYER_B, { buyerId: BUYER_A });

    expect(res.status).toBe(201);
    expect(res.body.data.buyerId).toBe(BUYER_B);
  });

  it('files under the session when the body carries a userId', async () => {
    const res = await file(BUYER_B, { userId: BUYER_A });

    expect(res.status).toBe(201);
    expect(res.body.data.buyerId).toBe(BUYER_B);
  });

  it('cannot reach another customer’s order by naming them in the body', async () => {
    fetchOrderForBuyer.mockImplementation(async (orderId: string, buyerId: string) => {
      if (buyerId !== BUYER_A) {
        throw new OrderVerificationError(404, 'Order not found', 'not_found');
      }
      return multiSellerOrder(orderId, BUYER_A);
    });

    const res = await file(BUYER_B, { buyerId: BUYER_A, userId: BUYER_A });

    expect(res.status).toBe(404);
    expect(fetchOrderForBuyer).toHaveBeenCalledWith('MUNI-ORD-1', BUYER_B);
    expect(await disputeCount()).toBe(0);
  });

  it('401s with no identity at all, before any order lookup happens', async () => {
    const res = await request(app).post('/api/v1/disputes').send(FILING);

    expect(res.status).toBe(401);
    expect(fetchOrderForBuyer).not.toHaveBeenCalled();
  });
});

// ─── Downstream failure ───────────────────────────────────────────────────────

describe('when the order cannot be verified, filing fails closed', () => {
  it('refuses with a 503 when order-service is unreachable', async () => {
    fetchOrderForBuyer.mockRejectedValue(
      new OrderVerificationError(503, 'Could not verify the order right now.', 'unavailable'),
    );

    const res = await file(BUYER_A);

    expect(res.status).toBe(503);
    expect(await disputeCount()).toBe(0);
    expect(holdForDispute).not.toHaveBeenCalled();
  });

  it('refuses when the verification throws something unexpected', async () => {
    fetchOrderForBuyer.mockRejectedValue(new Error('socket hang up'));

    const res = await file(BUYER_A);

    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(await disputeCount()).toBe(0);
    expect(holdForDispute).not.toHaveBeenCalled();
  });

  it('refuses a malformed order payload rather than treating it as verified', async () => {
    // A 200 whose body is not an order — the shape-change case.
    fetchOrderForBuyer.mockResolvedValue({ id: 'MUNI-ORD-1', userId: BUYER_A } as never);

    const res = await file(BUYER_A);

    // No sellers on it at all, so no seller can be verified against it.
    expect(res.status).toBe(422);
    expect(await disputeCount()).toBe(0);
    expect(holdForDispute).not.toHaveBeenCalled();
  });
});
