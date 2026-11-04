import { jest, beforeEach, afterAll, describe, expect, it } from '@jest/globals';

// ─── A delivery has to reach the order ────────────────────────────────────────
//
// Stage 8 settled which service owns the fulfillment lifecycle: order-service
// does. Its sub-order is what the customer and the seller read, what
// payment-service settles vendor shares against, and what return-service reads
// `deliveredAt` from to decide the 14-day window.
//
// fulfillment-service owns the delivery JOB — the rider, the signature, the
// cash. When a rider moves that job, the outcome has to be projected onto the
// order, or a parcel is delivered in one service and still in transit in the
// three places that matter.
//
// These cover the projection: which states carry a meaning worth sending, which
// deliberately do not, who the call is made as, and what happens when
// order-service cannot be reached.

const mockFetch = jest.fn<typeof fetch>();
const realFetch = globalThis.fetch;

// Set before the import: the client reads ORDER_SERVICE_URL once, at module
// load, so a beforeEach would be too late to redirect it.
process.env.ORDER_SERVICE_URL = 'http://order-under-test';

const { projectStatusToOrder, projectedStatusFor } = await import('../clients/order.client.js');

beforeEach(() => {
  mockFetch.mockReset().mockResolvedValue(new Response(JSON.stringify({ data: {} }), { status: 200 }));
  globalThis.fetch = mockFetch as unknown as typeof fetch;
});

/** A delivery job as the repository stores it. */
const job = (over: Record<string, unknown> = {}) => ({
  id: 'ful-1',
  orderId: 'ord-1',
  subOrderId: 'sub-1',
  sellerId: 'seller-A',
  type: 'SELLER_FULFILLED' as const,
  status: 'DELIVERED' as const,
  items: [],
  timeline: [],
  paymentMethod: 'PREPAID' as const,
  createdAt: '2026-09-11T00:00:00.000Z',
  updatedAt: '2026-09-11T00:00:00.000Z',
  ...over,
}) as never;

/** The single PATCH the projection makes. */
function lastCall() {
  const [url, init] = mockFetch.mock.calls.at(-1) as [string, RequestInit];
  return { url: String(url), init, body: JSON.parse(String(init.body)) };
}

describe('which states are worth telling the order about', () => {
  it('maps the states a customer would recognise', () => {
    expect(projectedStatusFor('PICKED_UP')).toBe('picked_up');
    expect(projectedStatusFor('IN_TRANSIT')).toBe('in_transit');
    expect(projectedStatusFor('DELIVERED')).toBe('delivered');
    expect(projectedStatusFor('DELIVERED_COD')).toBe('delivered');
  });

  it('maps nothing for operational states the order has no word for', () => {
    // A parcel coming back is return-service's lifecycle, and a failed delivery
    // attempt does not change what the customer bought. Inventing a sub-order
    // status for either would be making up a commercial meaning.
    expect(projectedStatusFor('RETURNED')).toBeUndefined();
    expect(projectedStatusFor('FAILED')).toBeUndefined();
    expect(projectedStatusFor('PACKED')).toBeUndefined();
    expect(projectedStatusFor('PENDING')).toBeUndefined();
  });

  it('sends nothing at all for an unmapped state', async () => {
    await projectStatusToOrder(job({ status: 'RETURNED' }));
    expect(mockFetch).not.toHaveBeenCalled();
  });
});

describe('the call it makes', () => {
  it('patches the sub-order through the existing seller route', async () => {
    await projectStatusToOrder(job());

    const { url, init } = lastCall();
    expect(url).toBe('http://order-under-test/api/v1/seller/orders/sub-1/status');
    expect(init.method).toBe('PATCH');
  });

  it('asks for the projected status, not the fulfillment one', async () => {
    await projectStatusToOrder(job({ status: 'DELIVERED_COD' }));
    expect(lastCall().body.status).toBe('delivered');
  });

  it('acts as the seller whose consignment it is', async () => {
    // Taken from the stored record, never from anything a caller supplied —
    // and with an empty roles list, so this grants no admin bypass.
    await projectStatusToOrder(job({ sellerId: 'seller-B' }));

    const headers = lastCall().init.headers as Record<string, string>;
    expect(headers['x-user-id']).toBe('seller-B');
  });

  it('carries a tracking number when the job has one', async () => {
    await projectStatusToOrder(job({ trackingNumber: 'TRK-77' }));
    expect(lastCall().body.trackingNumber).toBe('TRK-77');
  });

  it('omits tracking rather than sending an empty one', async () => {
    await projectStatusToOrder(job());
    expect(lastCall().body).not.toHaveProperty('trackingNumber');
  });
});

describe('when the order cannot be told', () => {
  it('does not throw when order-service refuses the transition', async () => {
    // Usually the sub-order has already made this move — a rider re-confirming
    // a delivery. The rider's request must not fail because of it.
    mockFetch.mockResolvedValue(new Response('{}', { status: 400 }));
    await expect(projectStatusToOrder(job())).resolves.toBe(false);
  });

  it('does not throw when order-service is unreachable', async () => {
    mockFetch.mockRejectedValue(new Error('ECONNREFUSED'));
    await expect(projectStatusToOrder(job())).resolves.toBe(false);
  });

  it('reports failure rather than claiming the order was updated', async () => {
    mockFetch.mockResolvedValue(new Response('{}', { status: 503 }));
    expect(await projectStatusToOrder(job())).toBe(false);
  });

  it('refuses to guess when the job names no sub-order', async () => {
    // Without a sub-order there is nothing to project onto, and picking one
    // would be inventing an association.
    expect(await projectStatusToOrder(job({ subOrderId: undefined }))).toBe(false);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('reports success when the order accepted it', async () => {
    expect(await projectStatusToOrder(job())).toBe(true);
  });
});

afterAll(() => { globalThis.fetch = realFetch; });
