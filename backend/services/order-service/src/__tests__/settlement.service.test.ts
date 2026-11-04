import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import type { Order, OrderItem } from '../models/order.model.js';
import type { IOrderRepository } from '../repositories/order.repository.js';

// ─── Direct-path inventory settlement ─────────────────────────────────────────
//
// Orders created through `POST /orders` reserved stock and then never deducted
// it: the hold lapsed on its TTL and the stock quietly returned to the shelf
// after the customer had paid. These cover the settlement step that closes
// that gap, and — just as importantly — that saga-path orders are left alone,
// since deducting them again would take the goods off the shelf twice.

const mockPublishEvent = jest.fn<(...args: unknown[]) => Promise<void>>().mockResolvedValue();

jest.unstable_mockModule('../../../../shared/rabbitmq/index.js', () => ({
  publishEvent: mockPublishEvent,
  ROUTING_KEYS: {
    ORDER_CREATED: 'order.created',
    ORDER_CANCELLED: 'order.cancelled',
    ORDER_FAILED: 'order.failed',
    PAYMENT_COMPLETED: 'payment.completed',
    INVENTORY_LOW_STOCK: 'inventory.low_stock',
  },
  connectRabbitMQ: jest.fn(), disconnectRabbitMQ: jest.fn(), isRabbitMQReady: () => true,
}));

class StockSettlementError extends Error {
  readonly status = 409;
  constructor(readonly variantId: string, detail: string) {
    super(`Could not settle stock for variant ${variantId}: ${detail}`);
    this.name = 'StockSettlementError';
  }
}

const deductCalls: Array<{ variantId: string; quantity: number; reservationId?: string }> = [];
const refundCalls: Array<{ reference: string; reason: string }> = [];

/** variantIds inventory should refuse to deduct (expired reservation). */
const deductFails = new Set<string>();
let refundShouldFail = false;

const mockDeductStock = jest.fn(
  async (variantId: string, quantity: number, reservationId?: string) => {
    deductCalls.push({ variantId, quantity, reservationId });
    if (deductFails.has(variantId)) {
      throw new StockSettlementError(variantId, 'reservation expired');
    }
  },
);

const mockRefundPayment = jest.fn(async (reference: string, reason: string) => {
  refundCalls.push({ reference, reason });
  if (refundShouldFail) throw new Error('payment-service unreachable');
});

jest.unstable_mockModule('../clients/catalog.client.js', () => ({
  deductStock: mockDeductStock,
  refundPayment: mockRefundPayment,
  StockSettlementError,
  fetchVariant: jest.fn(), fetchProduct: jest.fn(),
  reserveStock: jest.fn(), releaseStock: jest.fn(),
  ItemUnavailableError: class extends Error {},
  OutOfStockError: class extends Error {},
  CatalogUnavailableError: class extends Error {},
}));

jest.unstable_mockModule('../db/mongoose.js', () => ({
  connectDB: () => Promise.resolve(),
  disconnectDB: () => Promise.resolve(),
  isDBReady: () => true,
}));

const { settlePaidOrder } = await import('../services/settlement.service.js');

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function makeItem(overrides: Partial<OrderItem> = {}): OrderItem {
  return {
    id: 'item-1',
    productId: 'prod-1',
    variantId: 'var-1',
    sellerId: 'seller-1',
    productName: 'Coffee',
    productSku: 'COF-001',
    productImageUrl: null,
    unitPrice: 20000,
    quantity: 2,
    lineTotal: 40000,
    reservationId: 'res-var-1',
    ...overrides,
  };
}

function makeOrder(overrides: Partial<Order> = {}): Order {
  const now = new Date().toISOString();
  return {
    id: 'ord-1',
    orderNumber: 'MUNI-1000',
    userId: 'user-1',
    status: 'paid',
    statusLabel: 'Payment Paid',
    subtotal: 40000,
    shippingFee: 0,
    taxAmount: 0,
    discountAmount: 0,
    couponCode: null,
    totalAmount: 40000,
    currency: 'UGX',
    paymentMethod: 'mtn_momo',
    paymentReference: null,
    shipping: { address: 'Plot 1', city: 'Kampala', district: null, phone: '+256770000000', notes: null },
    items: [makeItem()],
    subOrders: [],
    itemCount: 1,
    placedAt: now,
    paidAt: now,
    shippedAt: null,
    deliveredAt: null,
    cancelledAt: null,
    cancellationReason: null,
    settlementPath: 'direct',
    inventorySettledAt: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  } as Order;
}

/** Minimal repo double — settlement only reads and replaces. */
function makeRepo(order: Order | null): IOrderRepository & { saved: Order[] } {
  const saved: Order[] = [];
  return {
    saved,
    findById: async () => order,
    replace: async (o: Order) => { saved.push(JSON.parse(JSON.stringify(o))); return o; },
  } as unknown as IOrderRepository & { saved: Order[] };
}

beforeEach(() => {
  jest.clearAllMocks();
  deductCalls.length = 0;
  refundCalls.length = 0;
  deductFails.clear();
  refundShouldFail = false;
});

// ─── Happy path ───────────────────────────────────────────────────────────────

describe('settlePaidOrder — payment confirmed', () => {
  it('deducts every line against the hold it was reserved under', async () => {
    const order = makeOrder({
      items: [
        makeItem({ id: 'i1', variantId: 'var-1', quantity: 2, reservationId: 'res-1' }),
        makeItem({ id: 'i2', variantId: 'var-2', quantity: 5, reservationId: 'res-2' }),
      ],
    });
    const repo = makeRepo(order);

    const outcome = await settlePaidOrder('ord-1', 'PAY-1', repo);

    expect(outcome.status).toBe('settled');
    expect(deductCalls).toEqual([
      { variantId: 'var-1', quantity: 2, reservationId: 'res-1' },
      { variantId: 'var-2', quantity: 5, reservationId: 'res-2' },
    ]);
    expect(refundCalls).toHaveLength(0);
  });

  it('stamps inventorySettledAt so a repeated event is a no-op', async () => {
    const order = makeOrder();
    const repo = makeRepo(order);

    await settlePaidOrder('ord-1', 'PAY-1', repo);
    expect(repo.saved[0].inventorySettledAt).toBeTruthy();

    // payment.completed arrives twice — a provider webhook and the polling
    // worker both resolve the same collection.
    deductCalls.length = 0;
    const second = await settlePaidOrder('ord-1', 'PAY-1', repo);

    expect(second.status).toBe('skipped');
    expect(second.reason).toBe('already_settled');
    expect(deductCalls).toHaveLength(0);
  });
});

// ─── Saga path is untouched ───────────────────────────────────────────────────

describe('settlePaidOrder — saga-path orders', () => {
  it('does not deduct an order the saga already settled', async () => {
    // The saga deducts its own reservations as its final step. Deducting again
    // here would take the goods off the shelf twice.
    const repo = makeRepo(makeOrder({ settlementPath: 'saga' }));

    const outcome = await settlePaidOrder('ord-1', 'PAY-1', repo);

    expect(outcome.status).toBe('skipped');
    expect(outcome.reason).toBe('settled_by_saga');
    expect(deductCalls).toHaveLength(0);
    expect(refundCalls).toHaveLength(0);
    expect(repo.saved).toHaveLength(0);
  });

  it('skips an order that no longer exists rather than throwing', async () => {
    const outcome = await settlePaidOrder('ord-missing', 'PAY-1', makeRepo(null));

    expect(outcome.status).toBe('skipped');
    expect(outcome.reason).toBe('order_not_found');
    expect(deductCalls).toHaveLength(0);
  });
});

// ─── Failure path ─────────────────────────────────────────────────────────────

describe('settlePaidOrder — deduction fails', () => {
  it('refunds the payment and marks the order refunded', async () => {
    deductFails.add('var-1');
    const repo = makeRepo(makeOrder());

    const outcome = await settlePaidOrder('ord-1', 'PAY-1', repo);

    expect(outcome.status).toBe('failed');
    expect(outcome.refunded).toBe(true);
    expect(refundCalls).toEqual([
      { reference: 'PAY-1', reason: 'inventory_settlement_failed' },
    ]);
    expect(repo.saved.at(-1)?.status).toBe('refunded');
    expect(repo.saved.at(-1)?.cancellationReason).toMatch(/reservation expired/);
  });

  it('emits order.failed carrying the reason and refund outcome', async () => {
    deductFails.add('var-1');

    await settlePaidOrder('ord-1', 'PAY-1', makeRepo(makeOrder()));

    const failedEvents = mockPublishEvent.mock.calls.filter((c) => c[0] === 'order.failed');
    expect(failedEvents).toHaveLength(1);
    expect(failedEvents[0][1]).toMatchObject({
      orderId: 'ord-1',
      userId: 'user-1',
      reason: 'inventory_settlement_failed',
      refunded: true,
    });
  });

  it('does not settle the order when a later line fails', async () => {
    const order = makeOrder({
      items: [
        makeItem({ id: 'i1', variantId: 'var-1', quantity: 1, reservationId: 'res-1' }),
        makeItem({ id: 'i2', variantId: 'var-2', quantity: 1, reservationId: 'res-2' }),
      ],
    });
    deductFails.add('var-2');
    const repo = makeRepo(order);

    const outcome = await settlePaidOrder('ord-1', 'PAY-1', repo);

    expect(outcome.status).toBe('failed');
    // var-1 came off the shelf before var-2 failed; the order is refunded and
    // failed, and that first deduction is a real discrepancy for reconciliation.
    expect(outcome.deducted).toEqual([{ variantId: 'var-1', quantity: 1 }]);
    expect(repo.saved.at(-1)?.inventorySettledAt).toBeNull();
  });

  it('still fails the order and announces it when the refund itself fails', async () => {
    // A customer charged for goods they will never receive must never be
    // invisible, even when the refund call cannot go through.
    deductFails.add('var-1');
    refundShouldFail = true;
    const repo = makeRepo(makeOrder());

    const outcome = await settlePaidOrder('ord-1', 'PAY-1', repo);

    expect(outcome.status).toBe('failed');
    expect(outcome.refunded).toBe(false);
    expect(repo.saved.at(-1)?.status).toBe('payment_failed');

    const failedEvents = mockPublishEvent.mock.calls.filter((c) => c[0] === 'order.failed');
    expect(failedEvents[0][1]).toMatchObject({ refunded: false });
  });

  it('fails a line that has no variantId rather than reporting success', async () => {
    const repo = makeRepo(makeOrder({ items: [makeItem({ variantId: undefined })] }));

    const outcome = await settlePaidOrder('ord-1', 'PAY-1', repo);

    expect(outcome.status).toBe('failed');
    expect(outcome.reason).toMatch(/no variantId/);
  });

  it('cannot auto-refund without a payment reference, but still fails the order', async () => {
    deductFails.add('var-1');
    const repo = makeRepo(makeOrder());

    const outcome = await settlePaidOrder('ord-1', undefined, repo);

    expect(outcome.status).toBe('failed');
    expect(outcome.refunded).toBe(false);
    expect(refundCalls).toHaveLength(0);
    expect(repo.saved.at(-1)?.status).toBe('payment_failed');
  });
});
