import { jest, describe, it, expect, beforeEach } from '@jest/globals';

// ─── A return has to be for something you actually bought ─────────────────────
//
// return-service made no outbound calls at all. `createReturn` took `orderId`,
// `sellerId` and `items[]` straight off the request body and wrote a return
// against them. Nothing checked that the order existed, that it belonged to the
// person filing, that the named seller had anything on it, that the items were
// ever in the basket, that the quantities were ever bought, that the order had
// been delivered, or that the 14-day window was still open.
//
// The 14-day policy was not absent — `checkGuaranteeEligibility` implements it
// — it simply was not consulted at creation, and it took the delivery date from
// a query parameter, defaulting to "five days ago" when none was supplied. So
// the one eligibility rule the service had was both unenforced and, where it
// was reachable, decided by the client.
//
// An auto-approving reason on a fabricated return also published
// `refund.initiated`, which is a refund event against an order that need not
// exist.

const mockPublish = jest
  .fn<(topic: string, payload: { type?: string; data?: Record<string, unknown> }) => Promise<void>>()
  .mockResolvedValue();

jest.unstable_mockModule('../../../../shared/kafka/producer.js', () => ({
  publish: mockPublish,
  connectProducer: jest.fn<() => Promise<void>>().mockResolvedValue(),
  disconnectProducer: jest.fn<() => Promise<void>>().mockResolvedValue(),
  isProducerReady: jest.fn<() => boolean>().mockReturnValue(true),
}));

class FakeOrderVerificationError extends Error {
  constructor(readonly status: number, message: string, readonly reason: string) { super(message); }
}

const mockFetchOrder = jest.fn<(orderId: string, buyerId: string) => Promise<unknown>>();

jest.unstable_mockModule('../clients/order.client.js', () => ({
  fetchOrderForBuyer: mockFetchOrder,
  orderClient: { fetchOrderForBuyer: mockFetchOrder },
  OrderVerificationError: FakeOrderVerificationError,
}));

const { MemoryReturnRepository } = await import('../repositories/memory-return.repository.js');
const service = await import('../services/return.service.js');

const BUYER = 'buyer-1';
const SELLER = 'seller-1';

const daysAgo = (n: number) => new Date(Date.now() - n * 24 * 60 * 60 * 1000).toISOString();

/** An order this buyer really placed, delivered two days ago. */
function order(over: Record<string, unknown> = {}, subOver: Record<string, unknown> = {}) {
  return {
    id: 'ORD-1',
    userId: BUYER,
    subOrders: [{
      id: 'sub-1',
      sellerId: SELLER,
      status: 'delivered',
      deliveredAt: daysAgo(2),
      items: [
        { id: 'oi-1', productId: 'p-1', quantity: 3 },
        { id: 'oi-2', productId: 'p-2', quantity: 1 },
      ],
      ...subOver,
    }],
    ...over,
  };
}

function request(over: Record<string, unknown> = {}) {
  return {
    orderId: 'ORD-1',
    userId: BUYER,
    sellerId: SELLER,
    items: [{ orderItemId: 'oi-1', quantity: 1, reason: 'DEFECTIVE' }],
    refundMethod: 'ORIGINAL_PAYMENT_METHOD',
    ...over,
  } as never;
}

beforeEach(() => {
  service.setReturnRepository(new MemoryReturnRepository());
  jest.clearAllMocks();
  mockFetchOrder.mockResolvedValue(order());
});

describe('the order behind the return', () => {
  it('files a return for an order the buyer really placed', async () => {
    const created = await service.createReturn(request());
    expect(created.orderId).toBe('ORD-1');
    expect(mockFetchOrder).toHaveBeenCalledWith('ORD-1', BUYER);
  });

  it('refuses an order that does not exist', async () => {
    mockFetchOrder.mockRejectedValue(new FakeOrderVerificationError(404, 'Order not found', 'not_found'));
    await expect(service.createReturn(request({ orderId: 'MADE-UP' })))
      .rejects.toMatchObject({ status: 404 });
  });

  it('refuses another customer\'s order', async () => {
    // order-service answers 404 for an order that is not the caller's, and the
    // client turns that into the same error as a missing one — so a buyer
    // cannot use this endpoint to discover which order ids exist.
    mockFetchOrder.mockRejectedValue(new FakeOrderVerificationError(404, 'Order not found', 'not_found'));
    await expect(service.createReturn(request())).rejects.toMatchObject({ status: 404 });
  });

  it('writes nothing when the order cannot be verified', async () => {
    mockFetchOrder.mockRejectedValue(new FakeOrderVerificationError(404, 'Order not found', 'not_found'));
    await service.createReturn(request()).catch(() => undefined);

    expect(await service.getUserReturns(BUYER)).toHaveLength(0);
  });

  it('fails closed when order-service is unreachable', async () => {
    // Letting a filing through while the authority is down is the same hole,
    // reachable by anyone who can make the service time out.
    mockFetchOrder.mockRejectedValue(new FakeOrderVerificationError(503, 'Could not verify', 'unavailable'));
    await expect(service.createReturn(request())).rejects.toMatchObject({ status: 503 });
  });
});

describe('the seller on the return', () => {
  it('refuses a seller who has nothing on the order', async () => {
    await expect(service.createReturn(request({ sellerId: 'seller-somebody-else' })))
      .rejects.toMatchObject({ status: 422 });
  });

  it('records the seller the order names, not the one the request asserted', async () => {
    const created = await service.createReturn(request());
    expect(created.sellerId).toBe(SELLER);
  });
});

describe('the items on the return', () => {
  it('refuses an item that is not on the order', async () => {
    await expect(service.createReturn(request({ items: [{ orderItemId: 'oi-never', quantity: 1, reason: 'X' }] })))
      .rejects.toMatchObject({ status: 422 });
  });

  it('refuses a quantity larger than was bought', async () => {
    // Three were bought; four cannot come back.
    await expect(service.createReturn(request({ items: [{ orderItemId: 'oi-1', quantity: 4, reason: 'X' }] })))
      .rejects.toMatchObject({ status: 422 });
  });

  it('allows returning exactly what was bought', async () => {
    const created = await service.createReturn(request({ items: [{ orderItemId: 'oi-1', quantity: 3, reason: 'X' }] }));
    expect(created.items[0].quantity).toBe(3);
  });

  it('refuses a zero or fractional quantity', async () => {
    await expect(service.createReturn(request({ items: [{ orderItemId: 'oi-1', quantity: 0, reason: 'X' }] })))
      .rejects.toMatchObject({ status: 422 });
    await expect(service.createReturn(request({ items: [{ orderItemId: 'oi-1', quantity: 1.5, reason: 'X' }] })))
      .rejects.toMatchObject({ status: 422 });
  });

  it('refuses the same item listed twice to double the quantity', async () => {
    await expect(service.createReturn(request({
      items: [
        { orderItemId: 'oi-1', quantity: 2, reason: 'X' },
        { orderItemId: 'oi-1', quantity: 2, reason: 'X' },
      ],
    }))).rejects.toMatchObject({ status: 422 });
  });

  it('refuses a return that names no items at all', async () => {
    await expect(service.createReturn(request({ items: [] }))).rejects.toMatchObject({ status: 422 });
  });
});

describe('the return window', () => {
  it('refuses an order that has not been delivered', async () => {
    mockFetchOrder.mockResolvedValue(order({}, { status: 'processing', deliveredAt: null }));
    await expect(service.createReturn(request())).rejects.toMatchObject({ status: 422 });
  });

  it('refuses a delivered order with no delivery date recorded', async () => {
    mockFetchOrder.mockResolvedValue(order({}, { status: 'delivered', deliveredAt: null }));
    await expect(service.createReturn(request())).rejects.toMatchObject({ status: 422 });
  });

  it('refuses an order delivered outside the 14-day window', async () => {
    mockFetchOrder.mockResolvedValue(order({}, { deliveredAt: daysAgo(20) }));
    await expect(service.createReturn(request())).rejects.toMatchObject({ status: 422 });
  });

  it('allows one delivered just inside the window', async () => {
    mockFetchOrder.mockResolvedValue(order({}, { deliveredAt: daysAgo(13) }));
    await expect(service.createReturn(request())).resolves.toBeTruthy();
  });

  it('takes the delivery date from the order, not from the caller', async () => {
    // checkGuaranteeEligibility reads `orderDeliveredAt` off a query parameter.
    // Creation does not: an ancient order stays ancient however the request is
    // dressed up.
    mockFetchOrder.mockResolvedValue(order({}, { deliveredAt: daysAgo(90) }));
    await expect(service.createReturn(request({ orderDeliveredAt: daysAgo(1) })))
      .rejects.toMatchObject({ status: 422 });
  });
});

describe('no refund is set in motion by an unverified return', () => {
  it('publishes nothing at all when verification fails', async () => {
    mockFetchOrder.mockRejectedValue(new FakeOrderVerificationError(404, 'Order not found', 'not_found'));
    await service.createReturn(request({ reason: 'DEFECTIVE' })).catch(() => undefined);

    expect(mockPublish).not.toHaveBeenCalled();
  });

  it('publishes no refund.initiated for an item that was never bought', async () => {
    await service.createReturn(request({
      reason: 'DEFECTIVE',
      items: [{ orderItemId: 'oi-never', quantity: 1, reason: 'DEFECTIVE' }],
    })).catch(() => undefined);

    const refundEvents = mockPublish.mock.calls.filter(([, payload]) => payload?.type === 'refund.initiated');
    expect(refundEvents).toHaveLength(0);
  });
});
