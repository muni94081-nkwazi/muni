import { beforeEach, describe, expect, it } from '@jest/globals';
import { FulfillmentService, FulfillmentAccessError, riderActor } from '../services/fulfillment.service.js';
import { MemoryFulfillmentRepository } from '../repositories/memory-fulfillment.repository.js';
import { CreateFulfillmentSchema, UpdateStatusSchema } from '../models/fulfillment.model.js';

// ─── Who may touch a parcel, and where it may go ──────────────────────────────
//
// fulfillment-service was the one service on the money path still reading
// identity from raw `x-user-id` / `x-user-roles` headers, and its controller
// asked no further questions. Verified live against the running service before
// these were written:
//
//   • a caller claiming ROLE_CUSTOMER created a fulfillment for an order that
//     does not exist, attributed to a seller they invented, for 9,999 units;
//   • a caller claiming to be seller B PATCHed seller A's parcel to DELIVERED
//     and got a 200 — that is the state a seller's escrow release keys off;
//   • an invented status reached Prisma and came back as a 400 quoting the
//     repository's absolute path and source lines;
//   • order-service answered 401 to the identical forged admin header, which
//     is what made this service's local middleware the outlier rather than
//     the platform norm.
//
// Identity is now the shared signed-assertion middleware. These cover the half
// identity cannot: ownership, and whether the move is one the lifecycle allows.

let repo: MemoryFulfillmentRepository;
let service: FulfillmentService;

const sellerA = { id: 'seller-A', roles: ['ROLE_SELLER'], isStaff: false };
const sellerB = { id: 'seller-B', roles: ['ROLE_SELLER'], isStaff: false };
const customer = { id: 'cust-1', roles: ['ROLE_CUSTOMER'], isStaff: false };
const staff = { id: 'ops-1', roles: ['ROLE_OPS'], isStaff: true };

beforeEach(() => {
  repo = new MemoryFulfillmentRepository();
  service = new FulfillmentService(repo);
});

/** A parcel belonging to seller A. */
async function parcelForA(over: Record<string, unknown> = {}) {
  return service.createFulfillment({
    orderId: 'order-1',
    sellerId: 'seller-A',
    items: [{ productId: 'p-1', quantity: 1 }],
    shippingAddress: { address: 'Plot 1', city: 'Kampala' },
    ...over,
  } as never);
}

describe('a parcel belongs to one seller', () => {
  it('lets its own seller read it', async () => {
    const f = await parcelForA();
    expect(await service.getOwnedFulfillment(f.id, sellerA)).not.toBeNull();
  });

  it('hides it from another seller behind a 404, not a 403', async () => {
    // A 403 would confirm the id exists and turn this into an oracle for
    // enumerating other sellers' consignments.
    const f = await parcelForA();
    expect(await service.getOwnedFulfillment(f.id, sellerB)).toBeNull();
  });

  it('hides it from a customer', async () => {
    const f = await parcelForA();
    expect(await service.getOwnedFulfillment(f.id, customer)).toBeNull();
  });

  it('shows it to staff', async () => {
    const f = await parcelForA();
    expect(await service.getOwnedFulfillment(f.id, staff)).not.toBeNull();
  });

  it('narrows an order to the asking seller only', async () => {
    await parcelForA();
    await service.createFulfillment({
      orderId: 'order-1', sellerId: 'seller-B',
      items: [{ productId: 'p-2', quantity: 1 }],
    } as never);

    const forA = await service.getOrderFulfillmentFor('order-1', sellerA);
    expect(forA).toHaveLength(1);
    expect(forA[0].sellerId).toBe('seller-A');

    // Staff see the whole order, which is what an ops console needs.
    expect(await service.getOrderFulfillmentFor('order-1', staff)).toHaveLength(2);
  });
});

describe('only the owner moves a parcel', () => {
  it('refuses a status change from another seller', async () => {
    const f = await parcelForA();
    await expect(service.updateStatus(f.id, 'PICKING', sellerB))
      .rejects.toMatchObject({ status: 404 });
  });

  it('refuses a status change from a customer', async () => {
    const f = await parcelForA();
    await expect(service.updateStatus(f.id, 'DELIVERED', customer))
      .rejects.toMatchObject({ status: 404 });
  });

  it('leaves the parcel untouched when the change is refused', async () => {
    const f = await parcelForA();
    await service.updateStatus(f.id, 'DELIVERED', sellerB).catch(() => undefined);

    expect((await repo.findById(f.id))!.status).toBe('PENDING');
  });

  it('refuses a tracking number from another seller', async () => {
    const f = await parcelForA();
    await expect(service.addTrackingNumber(f.id, 'TRK-FORGED', sellerB))
      .rejects.toMatchObject({ status: 404 });
    expect((await repo.findById(f.id))!.trackingNumber).toBeUndefined();
  });

  it('lets the owning seller set tracking', async () => {
    const f = await parcelForA();
    const updated = await service.addTrackingNumber(f.id, 'TRK-001', sellerA);
    expect(updated.trackingNumber).toBe('TRK-001');
  });

  it('lets the assigned rider move it, without making them its owner', async () => {
    const f = await parcelForA();
    await repo.update(f.id, { riderId: 'rider-9' } as never);

    await expect(service.updateStatus(f.id, 'PICKED_UP', riderActor('rider-9')))
      .resolves.toMatchObject({ status: 'PICKED_UP' });
    // A different rider has no claim on it.
    await expect(service.updateStatus(f.id, 'IN_TRANSIT', riderActor('rider-8')))
      .rejects.toMatchObject({ status: 404 });
  });
});

describe('the delivered state has to be earned', () => {
  it('refuses a jump from PENDING straight to DELIVERED', async () => {
    // The transition that made a seller's escrow payable for a parcel still on
    // a shelf. It was a single PATCH.
    const f = await parcelForA();
    await expect(service.updateStatus(f.id, 'DELIVERED', sellerA))
      .rejects.toMatchObject({ status: 409 });
  });

  it('allows DELIVERED once the parcel has actually moved', async () => {
    const f = await parcelForA();
    await service.updateStatus(f.id, 'PACKED', sellerA);
    await service.updateStatus(f.id, 'HANDED_TO_CARRIER', sellerA);
    await service.updateStatus(f.id, 'IN_TRANSIT', sellerA);

    await expect(service.updateStatus(f.id, 'DELIVERED', sellerA))
      .resolves.toMatchObject({ status: 'DELIVERED' });
  });

  it('refuses to move a delivered parcel again', async () => {
    const f = await parcelForA();
    for (const s of ['PICKED_UP', 'IN_TRANSIT', 'DELIVERED'] as const) {
      await service.updateStatus(f.id, s, sellerA);
    }
    await expect(service.updateStatus(f.id, 'PENDING', sellerA))
      .rejects.toMatchObject({ status: 409 });
    await expect(service.updateStatus(f.id, 'IN_TRANSIT', sellerA))
      .rejects.toMatchObject({ status: 409 });
  });

  it('refuses a status this service has never heard of', async () => {
    const f = await parcelForA();
    await expect(service.updateStatus(f.id, 'TOTALLY_INVENTED' as never, sellerA))
      .rejects.toMatchObject({ status: 422 });
  });

  it('treats re-sending the current status as a no-op', async () => {
    const f = await parcelForA();
    await service.updateStatus(f.id, 'PICKING', sellerA);
    await expect(service.updateStatus(f.id, 'PICKING', sellerA))
      .resolves.toMatchObject({ status: 'PICKING' });
  });
});

describe('what the request body may say', () => {
  it('rejects a body with no order, seller or items', () => {
    expect(CreateFulfillmentSchema.safeParse({}).success).toBe(false);
  });

  it('refuses a caller-supplied status, id or timeline', () => {
    // `.strict()`: these are the server's to decide, and a caller pre-setting
    // status to DELIVERED would have walked straight past the lifecycle.
    const body = {
      orderId: 'o', sellerId: 's', items: [{ productId: 'p', quantity: 1 }],
      status: 'DELIVERED', id: 'chosen-by-me', timeline: [],
    };
    expect(CreateFulfillmentSchema.safeParse(body).success).toBe(false);
  });

  it('accepts the shape a real booking sends', () => {
    const body = {
      orderId: 'o', sellerId: 's',
      items: [{ productId: 'p', variantId: 'v', quantity: 2 }],
      shippingAddress: { address: 'Plot 1', city: 'Kampala' },
      paymentMethod: 'COD', codAmountDue: 50000, codCurrency: 'UGX',
    };
    expect(CreateFulfillmentSchema.safeParse(body).success).toBe(true);
  });

  it('refuses an invented status at the edge, before it reaches the database', () => {
    // This is what used to come back as a 400 quoting a Prisma file path.
    expect(UpdateStatusSchema.safeParse({ status: 'NOT_A_STATUS' }).success).toBe(false);
    expect(UpdateStatusSchema.safeParse({ status: 'PACKED' }).success).toBe(true);
  });
});
