import { beforeEach, describe, expect, it } from '@jest/globals';
import { FulfillmentService } from '../services/fulfillment.service.js';
import { RiderService, RiderError } from '../services/rider.service.js';
import { CodService, CodError } from '../services/cod.service.js';
import {
  MemoryCodRepository,
  MemoryFulfillmentRepository,
  MemoryRiderRepository,
} from '../repositories/memory-fulfillment.repository.js';

// Mirrors CodService's internal EAT (UTC+3) day boundary so ledger lookups hit the same calendar day.
function eatDateString(): string {
  return new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

let fulfillmentRepo: MemoryFulfillmentRepository;
let fulfillmentService: FulfillmentService;
let rider: RiderService;
let cod: CodService;

beforeEach(() => {
  fulfillmentRepo = new MemoryFulfillmentRepository();
  fulfillmentService = new FulfillmentService(fulfillmentRepo);
  // Signatures are one table in Prisma; share the array so the fulfillment's
  // derived list sees what the rider repository writes.
  rider = new RiderService(new MemoryRiderRepository(fulfillmentRepo.signatures), fulfillmentService);
  cod = new CodService(new MemoryCodRepository(), fulfillmentService);
});

async function makeFulfillment(overrides: Record<string, unknown> = {}) {
  return fulfillmentService.createFulfillment({
    orderId: 'ORD-1',
    sellerId: 'seller-1',
    items: [{ productId: 'p1', quantity: 1 }],
    shippingAddress: { city: 'Kampala' },
    ...overrides,
  });
}

/**
 * Who is flagging a parcel COD.
 *
 * `flagAsCod` now takes the acting identity: the route only proved somebody was
 * logged in, so any authenticated caller could set any seller's parcel to COD
 * for an amount of their choosing. `makeFulfillment` builds parcels for
 * seller-1, so this is their own.
 */
const sellerActor = { id: 'seller-1', roles: ['ROLE_SELLER'], isStaff: false };

describe('Delivery Rider App API', () => {
  it('lets a rider claim a package that is still claimable', async () => {
    const f = await makeFulfillment();

    const claimed = await rider.claimPackage('rider-1', f.id);
    expect(claimed.riderId).toBe('rider-1');
    expect((await rider.getRider('rider-1')).status).toBe('ON_DELIVERY');
  });

  it('persists the claim, not just the returned object', async () => {
    const f = await makeFulfillment();
    await rider.claimPackage('rider-1', f.id);

    // The old code assigned fulfillment.riderId on a shared array element;
    // this asserts the assignment actually reached the store.
    expect((await fulfillmentService.getFulfillment(f.id))!.riderId).toBe('rider-1');
  });

  it('rejects a claim by a second rider once a package is already claimed', async () => {
    const f = await makeFulfillment();
    await rider.claimPackage('rider-1', f.id);

    await expect(rider.claimPackage('rider-2', f.id)).rejects.toThrow(RiderError);
  });

  it('walks a prepaid package through PICKED_UP -> IN_TRANSIT -> DELIVERED and frees up the rider', async () => {
    const f = await makeFulfillment();
    await rider.claimPackage('rider-1', f.id);

    await rider.updateDeliveryStatus('rider-1', f.id, 'PICKED_UP');
    await rider.updateDeliveryStatus('rider-1', f.id, 'IN_TRANSIT');
    const delivered = await rider.updateDeliveryStatus('rider-1', f.id, 'DELIVERED');

    expect(delivered.status).toBe('DELIVERED');
    expect((await rider.getRider('rider-1')).activeFulfillmentIds).not.toContain(f.id);
    expect((await rider.getRider('rider-1')).status).toBe('AVAILABLE');
  });

  it('records every status change on the timeline', async () => {
    const f = await makeFulfillment();
    await rider.claimPackage('rider-1', f.id);
    await rider.updateDeliveryStatus('rider-1', f.id, 'PICKED_UP');

    const reloaded = await fulfillmentService.getFulfillment(f.id);
    expect(reloaded!.timeline.map((t) => t.status)).toEqual(['PENDING', 'PENDING', 'PICKED_UP']);
  });

  it('blocks DELIVERED_COD until cash has been verified via the COD collection endpoint', async () => {
    const f = await makeFulfillment();
    await cod.flagAsCod(f.id, 50000, 'UGX', sellerActor);
    await rider.claimPackage('rider-1', f.id);

    await expect(rider.updateDeliveryStatus('rider-1', f.id, 'DELIVERED_COD')).rejects.toThrow(RiderError);

    await cod.collectCash(f.id, 'rider-1', 50000);
    const delivered = await rider.updateDeliveryStatus('rider-1', f.id, 'DELIVERED_COD');
    expect(delivered.status).toBe('DELIVERED_COD');
  });

  it('requires a returnReason when marking a package RETURNED', async () => {
    const f = await makeFulfillment();
    await rider.claimPackage('rider-1', f.id);

    await expect(rider.updateDeliveryStatus('rider-1', f.id, 'RETURNED')).rejects.toThrow(RiderError);
    const returned = await rider.updateDeliveryStatus('rider-1', f.id, 'RETURNED', { returnReason: 'Recipient unreachable' });
    expect(returned.status).toBe('RETURNED');
  });

  it('writes the return reason onto the last timeline entry', async () => {
    const f = await makeFulfillment();
    await rider.claimPackage('rider-1', f.id);
    await rider.updateDeliveryStatus('rider-1', f.id, 'RETURNED', { returnReason: 'Recipient unreachable' });

    const reloaded = await fulfillmentService.getFulfillment(f.id);
    expect(reloaded!.timeline.at(-1)!.note).toBe('Recipient unreachable');
  });

  it('logs a digital signature against the fulfillment record', async () => {
    const f = await makeFulfillment();
    await rider.claimPackage('rider-1', f.id);

    const signature = await rider.logSignature('rider-1', f.id, 'data:image/png;base64,AAA', 'Jane Doe');
    expect(signature.recipientName).toBe('Jane Doe');

    // Re-fetched rather than reading `f`. The old code mutated the shared
    // object so the caller's stale copy appeared to update itself; the
    // fulfillment's signature list is now derived from the signature table.
    const reloaded = await fulfillmentService.getFulfillment(f.id);
    expect(reloaded!.signatures?.[0]?.id).toBe(signature.id);
  });

  it('refuses a signature from a rider the package is not assigned to', async () => {
    const f = await makeFulfillment();
    await rider.claimPackage('rider-1', f.id);

    await expect(
      rider.logSignature('rider-2', f.id, 'data:image/png;base64,AAA', 'Jane Doe'),
    ).rejects.toThrow(RiderError);
  });
});

describe('Cash-on-Delivery Workflow', () => {
  it('flags a fulfillment as COD with an amount due', async () => {
    const f = await makeFulfillment();

    const flagged = await cod.flagAsCod(f.id, 35000, 'UGX', sellerActor);
    expect(flagged.paymentMethod).toBe('COD');
    expect(flagged.codAmountDue).toBe(35000);
    expect(flagged.codStatus).toBe('PENDING');

    // flagAsCod used to mutate the object fulfillmentService handed it.
    expect((await fulfillmentService.getFulfillment(f.id))!.paymentMethod).toBe('COD');
  });

  it('verifies an exact cash collection and records it on the daily ledger', async () => {
    const f = await makeFulfillment();
    await cod.flagAsCod(f.id, 20000, 'UGX', sellerActor);

    const collection = await cod.collectCash(f.id, 'rider-1', 20000);
    expect(collection.verificationStatus).toBe('VERIFIED');

    const today = eatDateString();
    const ledger = await cod.getRiderLedger('rider-1', today);
    expect(ledger.totalCollected).toBeGreaterThanOrEqual(20000);
  });

  it('accumulates several collections onto one rider-day', async () => {
    const f1 = await makeFulfillment();
    const f2 = await makeFulfillment({ orderId: 'ORD-2' });
    await cod.flagAsCod(f1.id, 10000, 'UGX', sellerActor);
    await cod.flagAsCod(f2.id, 7000, 'UGX', sellerActor);
    await cod.collectCash(f1.id, 'rider-3', 10000);
    await cod.collectCash(f2.id, 'rider-3', 7000);

    const ledger = await cod.getRiderLedger('rider-3', eatDateString());
    expect(ledger.totalDue).toBe(17000);
    expect(ledger.totalCollected).toBe(17000);
    expect(ledger.collectionIds).toHaveLength(2);
  });

  it('returns a zeroed ledger for a rider-day with no collections', async () => {
    const ledger = await cod.getRiderLedger('rider-none', '2026-01-01');
    expect(ledger.totalCollected).toBe(0);
    expect(ledger.status).toBe('OPEN');
  });

  it('flags a short collection', async () => {
    const f = await makeFulfillment();
    await cod.flagAsCod(f.id, 20000, 'UGX', sellerActor);

    const collection = await cod.collectCash(f.id, 'rider-1', 15000);
    expect(collection.verificationStatus).toBe('SHORT');
  });

  it('tolerates variance inside the rounding allowance', async () => {
    const f = await makeFulfillment();
    await cod.flagAsCod(f.id, 20000, 'UGX', sellerActor);

    const collection = await cod.collectCash(f.id, 'rider-1', 19950);
    expect(collection.verificationStatus).toBe('VERIFIED');
  });

  it('disputes an overpayment beyond the allowance', async () => {
    const f = await makeFulfillment();
    await cod.flagAsCod(f.id, 20000, 'UGX', sellerActor);

    const collection = await cod.collectCash(f.id, 'rider-1', 25000);
    expect(collection.verificationStatus).toBe('DISPUTED');
  });

  it('rejects cash collection for a fulfillment that is not flagged COD', async () => {
    const f = await makeFulfillment();

    await expect(cod.collectCash(f.id, 'rider-1', 1000)).rejects.toThrow(CodError);
  });

  it('reconciles a rider daily ledger and flags a variance', async () => {
    const f1 = await makeFulfillment();
    const f2 = await makeFulfillment({ orderId: 'ORD-2' });
    await cod.flagAsCod(f1.id, 10000, 'UGX', sellerActor);
    await cod.flagAsCod(f2.id, 10000, 'UGX', sellerActor);
    await cod.collectCash(f1.id, 'rider-9', 10000);
    await cod.collectCash(f2.id, 'rider-9', 10000);

    const today = eatDateString();
    const shortRemit = await cod.reconcileLedger('rider-9', today, 15000, 'ops-1');
    expect(shortRemit.status).toBe('FLAGGED');
    expect(shortRemit.variance).toBe(5000);

    const pending = await cod.listPendingReconciliations();
    expect(pending.some((e) => e.riderId === 'rider-9')).toBe(true);
  });

  it('marks a fully remitted day RECONCILED and drops it from the pending list', async () => {
    const f = await makeFulfillment();
    await cod.flagAsCod(f.id, 10000, 'UGX', sellerActor);
    await cod.collectCash(f.id, 'rider-8', 10000);

    const settled = await cod.reconcileLedger('rider-8', eatDateString(), 10000, 'ops-1');
    expect(settled.status).toBe('RECONCILED');
    expect(settled.variance).toBe(0);

    const pending = await cod.listPendingReconciliations();
    expect(pending.some((e) => e.riderId === 'rider-8')).toBe(false);
  });

  it('throws when reconciling a rider/date with no recorded collections', async () => {
    await expect(cod.reconcileLedger('rider-none', '2026-01-01', 0, 'ops-1')).rejects.toThrow(CodError);
  });
});

// ─── Who may flag a parcel COD ────────────────────────────────────────────────
//
// PATCH /fulfillment/:id/cod carried `requireAuth` and nothing else, so being
// logged in as anyone was the whole check. The amount set here is what
// `collectCash` measures a rider's cash against, so whoever sets it decides
// whether a short collection reads as VERIFIED.

describe('flagging a parcel COD is the seller’s call, not any caller’s', () => {
  const otherSeller = { id: 'seller-2', roles: ['ROLE_SELLER'], isStaff: false };
  const customer    = { id: 'cust-1',   roles: ['ROLE_CUSTOMER'], isStaff: false };
  const rider1      = { id: 'rider-1',  roles: ['ROLE_RIDER'], isStaff: false };
  const ops         = { id: 'ops-1',    roles: ['ROLE_OPS'], isStaff: true };

  it('lets the parcel’s own seller flag it', async () => {
    const f = await makeFulfillment();

    const flagged = await cod.flagAsCod(f.id, 35000, 'UGX', sellerActor);
    expect(flagged.codAmountDue).toBe(35000);
  });

  it('lets staff flag it, which is what an ops-side booking needs', async () => {
    const f = await makeFulfillment();

    await expect(cod.flagAsCod(f.id, 35000, 'UGX', ops)).resolves.toMatchObject({
      paymentMethod: 'COD',
    });
  });

  it('refuses another seller, and leaves the parcel prepaid', async () => {
    const f = await makeFulfillment();

    await expect(cod.flagAsCod(f.id, 35000, 'UGX', otherSeller))
      .rejects.toMatchObject({ status: 404 });
    expect((await fulfillmentService.getFulfillment(f.id))!.paymentMethod).not.toBe('COD');
  });

  it('refuses a customer', async () => {
    const f = await makeFulfillment();

    await expect(cod.flagAsCod(f.id, 1, 'UGX', customer))
      .rejects.toMatchObject({ status: 404 });
    expect((await fulfillmentService.getFulfillment(f.id))!.codAmountDue).toBeUndefined();
  });

  it('refuses the assigned rider, who would otherwise set their own amount due', async () => {
    // `mayTouch` lets the carrying rider move the parcel, but the figure their
    // cash is checked against is not theirs to choose: setting it to 1 makes
    // pocketing the rest come back VERIFIED.
    const f = await makeFulfillment();
    await rider.claimPackage('rider-1', f.id);

    await expect(cod.flagAsCod(f.id, 1, 'UGX', rider1))
      .rejects.toMatchObject({ status: 404 });
  });

  it('answers a parcel you may not touch exactly like one that does not exist', async () => {
    const f = await makeFulfillment();

    const notYours = await cod.flagAsCod(f.id, 5000, 'UGX', otherSeller).catch((e) => e);
    const missing = await cod.flagAsCod('no-such-parcel', 5000, 'UGX', otherSeller).catch((e) => e);

    expect(notYours.status).toBe(missing.status);
    expect(notYours.message).toBe(missing.message);
  });
});
