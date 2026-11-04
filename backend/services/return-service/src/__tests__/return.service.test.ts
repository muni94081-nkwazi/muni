import { jest, describe, it, expect, beforeEach } from '@jest/globals';

// Typed with its real parameters so the assertions below can read
// mock.calls[n][1]; a no-arg signature makes calls a zero-length tuple.
const mockPublish = jest
  .fn<(topic: string, payload: { type?: string; data?: Record<string, unknown> }) => Promise<void>>()
  .mockResolvedValue();

jest.unstable_mockModule('../../../../shared/kafka/producer.js', () => ({
  publish: mockPublish,
  connectProducer: jest.fn<() => Promise<void>>().mockResolvedValue(),
  disconnectProducer: jest.fn<() => Promise<void>>().mockResolvedValue(),
  isProducerReady: jest.fn<() => boolean>().mockReturnValue(true),
}));

// order-service is mocked at the client boundary: what is under test is how
// return-service reacts to what the order says, not the HTTP call. Before this
// stage there was nothing to mock — return-service asked no one anything, and
// wrote whatever orderId, sellerId and items the request body carried.
const mockFetchOrder = jest.fn<(orderId: string, buyerId: string) => Promise<unknown>>();

jest.unstable_mockModule('../clients/order.client.js', () => ({
  fetchOrderForBuyer: mockFetchOrder,
  orderClient: { fetchOrderForBuyer: mockFetchOrder },
  OrderVerificationError: class extends Error {
    constructor(readonly status: number, message: string, readonly reason: string) { super(message); }
  },
}));

const { MemoryReturnRepository } = await import('../repositories/memory-return.repository.js');
const service = await import('../services/return.service.js');

const USER = 'user-123';
const SELLER = 'seller-001';

let repo: InstanceType<typeof MemoryReturnRepository>;

/** A delivered order matching `input()`, which is what most tests need. */
function deliveredOrder(over: Record<string, unknown> = {}) {
  return {
    id: 'MUNI-1001',
    userId: USER,
    subOrders: [{
      id: 'sub-1',
      sellerId: SELLER,
      status: 'delivered',
      deliveredAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
      items: [{ id: 'oi-1', productId: 'p-1', quantity: 2 }],
    }],
    ...over,
  };
}

function input(overrides: Record<string, unknown> = {}) {
  return {
    orderId: 'MUNI-1001',
    userId: USER,
    sellerId: SELLER,
    items: [{ orderItemId: 'oi-1', quantity: 1, reason: 'DEFECTIVE' }],
    description: 'Screen flickering on unboxing.',
    refundMethod: 'ORIGINAL_PAYMENT',
    ...overrides,
  };
}

beforeEach(() => {
  repo = new MemoryReturnRepository();
  service.setReturnRepository(repo);
  jest.clearAllMocks();
  mockFetchOrder.mockResolvedValue(deliveredOrder());
});

describe('return service against a repository', () => {
  it('persists a return and reads it back out of the store', async () => {
    const created = await service.createReturn(input());

    expect(created.status).toBe('REQUESTED');
    expect(created.items).toHaveLength(1);

    const reloaded = await repo.findById(created.id);
    expect(reloaded).not.toBeNull();
    expect(reloaded!.orderId).toBe('MUNI-1001');
    expect(reloaded!.items[0]!.orderItemId).toBe('oi-1');
  });

  it('auto-approves a guarantee reason and stamps approvedAt', async () => {
    const created = await service.createReturn(input({ reason: 'DEFECTIVE' }));

    expect(created.isAutoApproved).toBe(true);
    expect(created.status).toBe('APPROVED');
    expect(created.approvedAt).not.toBeNull();
  });

  it('leaves a non-guarantee reason for the seller to action', async () => {
    const created = await service.createReturn(input({ reason: 'CHANGED_MIND' }));

    expect(created.isAutoApproved).toBe(false);
    expect(created.status).toBe('REQUESTED');
    expect(created.approvedAt).toBeNull();
  });

  it('emits refund.initiated only once the return is recorded', async () => {
    const created = await service.createReturn(input({ reason: 'WRONG_ITEM' }));

    const refundEvents = mockPublish.mock.calls.filter(
      (c) => c[1]?.type === 'refund.initiated',
    );
    expect(refundEvents).toHaveLength(1);
    expect(await repo.findById(created.id)).not.toBeNull();
  });

  it('carries a null refundAmount, because nothing supplies one today', async () => {
    // Pinning the known gap rather than pretending it is fixed: the request
    // schema has no refundAmount, so the refund event goes out without one.
    const created = await service.createReturn(input({ reason: 'DEFECTIVE' }));
    expect(created.refundAmount).toBeNull();

    const refund = mockPublish.mock.calls.find(
      (c) => c[1]?.type === 'refund.initiated',
    );
    expect(refund![1].data?.refundAmount).toBeNull();
  });

  it('status changes survive a re-read', async () => {
    const created = await service.createReturn(input());

    await service.updateStatus(created.id, 'REFUNDED');

    const reloaded = await repo.findById(created.id);
    expect(reloaded!.status).toBe('REFUNDED');
  });

  it('throws Not found for an unknown id, as the Map version did', async () => {
    await expect(service.updateStatus('nope', 'APPROVED')).rejects.toThrow('Not found');
  });

  it('scopes returns to buyer, seller and admin views', async () => {
    await service.createReturn(input());
    await service.createReturn(input({ userId: 'user-999', orderId: 'MUNI-1002' }));

    expect(await service.getUserReturns(USER)).toHaveLength(1);
    expect(await service.getUserReturns('user-999')).toHaveLength(1);
    expect(await service.getSellerReturns(SELLER)).toHaveLength(2);
    expect(await service.getAllReturns()).toHaveLength(2);
  });

  describe('guarantee eligibility', () => {
    it('is active inside the 14-day window', async () => {
      const delivered = new Date(Date.now() - 3 * 86_400_000).toISOString();
      const status = await service.checkGuaranteeEligibility('MUNI-1001', delivered);

      expect(status.isEligible).toBe(true);
      expect(status.windowDaysRemaining).toBe(11);
    });

    it('is expired past the window, with no remaining days', async () => {
      const delivered = new Date(Date.now() - 30 * 86_400_000).toISOString();
      const status = await service.checkGuaranteeEligibility('MUNI-1001', delivered);

      expect(status.isEligible).toBe(false);
      expect(status.windowDaysRemaining).toBe(0);
    });
  });
});
