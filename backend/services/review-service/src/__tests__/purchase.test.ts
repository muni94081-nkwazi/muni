import { jest, describe, it, expect, beforeEach } from '@jest/globals';

// ─── Verified purchase ──────────────────────────────────────────────────────
//
// This is the rule that makes a star rating mean anything, so it is tested
// against its two evidence sources directly: the local projection, and the
// order-service fallback used when the projection has nothing.
//
// Prisma and the order client are mocked because the behaviour under test is
// the decision logic, not the queries.

process.env.DATABASE_URL ??= 'postgresql://muni:muni@localhost:5432/muni_review_test';

interface FakePurchase {
  userId: string;
  productId: string;
  orderId: string;
  subOrderId: string | null;
  sellerId: string | null;
  status: 'ORDERED' | 'DELIVERED' | 'CANCELLED';
  variantId: string | null;
  deliveredAt: Date | null;
  orderedAt: Date;
}

let rows: FakePurchase[] = [];

const findMany = jest.fn(async (args: { where: Record<string, unknown> }) => {
  const where = args.where as {
    userId: string;
    productId: string;
    status?: { in?: string[] } | string;
  };
  return rows.filter((row) => {
    if (row.userId !== where.userId || row.productId !== where.productId) return false;
    if (!where.status) return true;
    if (typeof where.status === 'string') return row.status === where.status;
    return where.status.in?.includes(row.status) ?? true;
  });
});

const count = jest.fn(async (args: { where: Record<string, unknown> }) => {
  return (await findMany(args as never)).length;
});

const upsert = jest.fn(async () => ({}));

jest.unstable_mockModule('../config/prisma.js', () => ({
  default: { purchaseRecord: { findMany, count, upsert } },
  prisma: { purchaseRecord: { findMany, count, upsert } },
}));

const fetchDeliveredPurchases = jest.fn<() => Promise<unknown[]>>(async () => []);

jest.unstable_mockModule('../clients/order.client.js', () => ({
  fetchDeliveredPurchases,
  OrderServiceUnavailableError: class extends Error {},
}));

type PurchaseModule = typeof import('../services/purchase.service.js');
let purchase: PurchaseModule;

function delivered(overrides: Partial<FakePurchase> = {}): FakePurchase {
  return {
    userId: 'buyer-1',
    productId: 'prod-1',
    orderId: 'order-1',
    subOrderId: 'sub-1',
    sellerId: 'seller-1',
    status: 'DELIVERED',
    variantId: null,
    deliveredAt: new Date('2026-08-01'),
    orderedAt: new Date('2026-07-25'),
    ...overrides,
  };
}

beforeEach(async () => {
  jest.clearAllMocks();
  rows = [];
  fetchDeliveredPurchases.mockResolvedValue([]);
  purchase = await import('../services/purchase.service.js');
});

describe('getPurchaseEvidence', () => {
  it('accepts a buyer with a delivered purchase in the projection', async () => {
    rows = [delivered()];

    const evidence = await purchase.getPurchaseEvidence('buyer-1', 'prod-1');

    expect(evidence.eligible).toBe(true);
    expect(evidence.purchases).toHaveLength(1);
    // The fast path must not call order-service at all.
    expect(fetchDeliveredPurchases).not.toHaveBeenCalled();
  });

  it('refuses someone who never bought the product', async () => {
    const evidence = await purchase.getPurchaseEvidence('buyer-1', 'prod-1');

    expect(evidence.eligible).toBe(false);
    expect(evidence.reason).toContain('Only buyers who purchased');
  });

  it('distinguishes "not yet delivered" from "never bought"', async () => {
    // The buyer owns it, it just has not arrived. That is a wait, not a
    // refusal, and saying so is the difference between a clear message and a
    // support ticket.
    rows = [delivered({ status: 'ORDERED', deliveredAt: null })];

    const evidence = await purchase.getPurchaseEvidence('buyer-1', 'prod-1');

    expect(evidence.eligible).toBe(false);
    expect(evidence.reason).toContain('once your order has been delivered');
  });

  it('does not accept a cancelled order as a purchase', async () => {
    rows = [delivered({ status: 'CANCELLED' })];

    const evidence = await purchase.getPurchaseEvidence('buyer-1', 'prod-1');

    expect(evidence.eligible).toBe(false);
  });

  it('falls back to order-service when the projection has nothing', async () => {
    // Covers orders placed before this service existed, and the gap between an
    // order being placed and its event being consumed.
    fetchDeliveredPurchases.mockResolvedValue([
      {
        orderId: 'order-legacy',
        subOrderId: 'sub-legacy',
        sellerId: 'seller-1',
        variantId: null,
        quantity: 1,
        delivered: true,
        orderedAt: '2026-06-01T00:00:00Z',
        deliveredAt: '2026-06-05T00:00:00Z',
      },
    ]);
    // The backfill writes the row, then re-reads the projection.
    upsert.mockImplementation(async () => {
      rows = [delivered({ orderId: 'order-legacy', subOrderId: 'sub-legacy' })];
      return {};
    });

    const evidence = await purchase.getPurchaseEvidence('buyer-1', 'prod-1');

    expect(fetchDeliveredPurchases).toHaveBeenCalledWith('buyer-1', 'prod-1');
    expect(upsert).toHaveBeenCalled();
    expect(evidence.eligible).toBe(true);
  });

  it('fails closed when order-service is unreachable', async () => {
    // Failing open would make the verified badge meaningless during any
    // order-service outage — exactly when abuse is easiest.
    fetchDeliveredPurchases.mockRejectedValue(new Error('connection refused'));

    const evidence = await purchase.getPurchaseEvidence('buyer-1', 'prod-1');

    expect(evidence.eligible).toBe(false);
  });
});

describe('hasVerifiedPurchase', () => {
  it('is true only for a delivered purchase', async () => {
    rows = [delivered()];
    await expect(purchase.hasVerifiedPurchase('buyer-1', 'prod-1')).resolves.toBe(true);
  });

  it('is false while the order is still in transit', async () => {
    rows = [delivered({ status: 'ORDERED', deliveredAt: null })];
    await expect(purchase.hasVerifiedPurchase('buyer-1', 'prod-1')).resolves.toBe(false);
  });
});
