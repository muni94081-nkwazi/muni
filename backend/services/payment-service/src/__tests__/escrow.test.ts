import { jest, describe, it, expect, beforeEach } from '@jest/globals';

// ─── Multi-vendor escrow ──────────────────────────────────────────────────────
//
// `escrow_holds.order_id` used to be UNIQUE, so a cart spanning several sellers
// could only ever produce ONE hold: it named a single seller and carried the
// entire basket's value. Every other seller was absent from the ledger, and the
// named one appeared owed money that belonged to the others.
//
// These tests are the guard on that. They run against the in-memory Prisma
// double, which now enforces `@@unique([orderId, vendorId])` — so a regression
// that restores the single-hold model fails here rather than in production
// accounting.

// Typed with the real arity so the assertions below can read the published
// payload — `jest.fn<() => Promise<void>>()` would make `call[1]` a type error.
type PublishedEvent = { type: string; data: Record<string, unknown> };

const mockPublish = jest
  .fn<(topic: string, payload: PublishedEvent) => Promise<void>>()
  .mockResolvedValue();

jest.unstable_mockModule('../../../../shared/kafka/producer.js', () => ({
  publish: mockPublish,
  connectProducer: jest.fn<() => Promise<void>>().mockResolvedValue(),
  disconnectProducer: jest.fn<() => Promise<void>>().mockResolvedValue(),
  isProducerReady: jest.fn<() => boolean>().mockReturnValue(true),
}));

const prismaDouble = await import('./helpers/prisma-double.js');

jest.unstable_mockModule('../db/prisma.js', () => ({
  prisma: prismaDouble.prisma,
  connectDB: jest.fn<() => Promise<void>>().mockResolvedValue(),
  disconnectDB: jest.fn<() => Promise<void>>().mockResolvedValue(),
}));

const { escrowService, groupHoldsByVendor, InvalidEscrowBreakdownError } =
  await import('../services/escrow.service.js');

// ─── Fixtures ─────────────────────────────────────────────────────────────────

/** Two sellers, deliberately out of alphabetical order. */
const MULTI_VENDOR_LINES = [
  { sellerId: 'seller-zebra', amountUGX: 5_000 },
  { sellerId: 'seller-alpha', amountUGX: 2_000 },
  { sellerId: 'seller-alpha', amountUGX: 1_500 }, // same seller, second line
];

const buyerId = 'buyer-1';

beforeEach(() => {
  jest.clearAllMocks();
  prismaDouble.resetDatabase();
});

// ─── Grouping ─────────────────────────────────────────────────────────────────

describe('groupHoldsByVendor', () => {
  it('sums a seller’s line items into one entry', () => {
    const grouped = groupHoldsByVendor(MULTI_VENDOR_LINES);

    expect(grouped).toHaveLength(2);
    expect(grouped.find((g) => g.vendorId === 'seller-alpha')?.amountUGX).toBe(3_500);
    expect(grouped.find((g) => g.vendorId === 'seller-zebra')?.amountUGX).toBe(5_000);
  });

  it('returns vendors in a deterministic order', () => {
    // Concurrent upserts take row locks in this order; two retries in opposite
    // orders would otherwise be able to deadlock against each other.
    const ids = groupHoldsByVendor(MULTI_VENDOR_LINES).map((g) => g.vendorId);
    expect(ids).toEqual([...ids].sort());
  });

  it('accepts `vendorId` as an alias for `sellerId`', () => {
    expect(groupHoldsByVendor([{ vendorId: 'v1', amountUGX: 100 }])[0].vendorId).toBe('v1');
  });

  it('refuses a line with no vendor rather than guessing one', () => {
    expect(() => groupHoldsByVendor([{ sellerId: '  ', amountUGX: 100 }]))
      .toThrow(InvalidEscrowBreakdownError);
  });

  it('refuses a negative or non-numeric amount', () => {
    expect(() => groupHoldsByVendor([{ sellerId: 'v1', amountUGX: -5 }]))
      .toThrow(InvalidEscrowBreakdownError);
    expect(() => groupHoldsByVendor([{ sellerId: 'v1', amountUGX: Number.NaN }]))
      .toThrow(InvalidEscrowBreakdownError);
  });

  it('refuses an empty breakdown', () => {
    expect(() => groupHoldsByVendor([])).toThrow(InvalidEscrowBreakdownError);
  });
});

// ─── Creating holds ───────────────────────────────────────────────────────────

describe('createEscrowHolds — single vendor', () => {
  it('creates exactly one hold for the full amount', async () => {
    const holds = await escrowService.createEscrowHolds({
      orderId: 'ord-single',
      buyerId,
      holds: groupHoldsByVendor([{ sellerId: 'seller-only', amountUGX: 42_000 }]),
    });

    expect(holds).toHaveLength(1);
    expect(holds[0]).toMatchObject({
      orderId:   'ord-single',
      vendorId:  'seller-only',
      buyerId,
      amountUGX: 42_000,
      status:    'in_escrow',
    });
  });
});

describe('createEscrowHolds — multi vendor', () => {
  it('creates one hold per seller, each with that seller’s own amount', async () => {
    const holds = await escrowService.createEscrowHolds({
      orderId: 'ord-multi',
      buyerId,
      holds: groupHoldsByVendor(MULTI_VENDOR_LINES),
    });

    expect(holds).toHaveLength(2);

    const byVendor = Object.fromEntries(holds.map((h) => [h.vendorId, h.amountUGX]));
    expect(byVendor).toEqual({ 'seller-alpha': 3_500, 'seller-zebra': 5_000 });

    // No hold carries the whole basket — that was the old bug's signature.
    expect(holds.some((h) => h.amountUGX === 8_500)).toBe(false);
  });

  it('holds sum to the basket total, with nothing lost or double-counted', async () => {
    await escrowService.createEscrowHolds({
      orderId: 'ord-multi',
      buyerId,
      holds: groupHoldsByVendor(MULTI_VENDOR_LINES),
    });

    const stored = await escrowService.getEscrowHolds('ord-multi');
    const total  = stored.reduce((sum, h) => sum + h.amountUGX, 0);

    expect(total).toBe(8_500);
  });

  it('carries subOrderId through when the caller knows it', async () => {
    const holds = await escrowService.createEscrowHolds({
      orderId: 'ord-sub',
      buyerId,
      holds: [
        { vendorId: 'v1', subOrderId: 'sub-1', amountUGX: 100 },
        { vendorId: 'v2', subOrderId: 'sub-2', amountUGX: 200 },
      ],
    });

    expect(holds.map((h) => h.subOrderId)).toEqual(['sub-1', 'sub-2']);
  });

  it('leaves subOrderId null when the order does not exist yet', async () => {
    // The checkout saga charges before creating the order, so this is the
    // normal case — (orderId, vendorId) is the identifying key.
    const [hold] = await escrowService.createEscrowHolds({
      orderId: 'ord-nosub',
      buyerId,
      holds: [{ vendorId: 'v1', amountUGX: 100 }],
    });

    expect(hold.subOrderId).toBeNull();
  });
});

describe('createEscrowHolds — idempotency', () => {
  it('a retried payment does not double a vendor’s holdings', async () => {
    const holds = groupHoldsByVendor(MULTI_VENDOR_LINES);

    await escrowService.createEscrowHolds({ orderId: 'ord-retry', buyerId, holds });
    await escrowService.createEscrowHolds({ orderId: 'ord-retry', buyerId, holds });

    const stored = await escrowService.getEscrowHolds('ord-retry');
    expect(stored).toHaveLength(2);
    expect(stored.reduce((sum, h) => sum + h.amountUGX, 0)).toBe(8_500);
  });

  it('keeps different orders’ holds separate', async () => {
    await escrowService.createEscrowHolds({
      orderId: 'ord-a', buyerId, holds: [{ vendorId: 'shared-seller', amountUGX: 100 }],
    });
    await escrowService.createEscrowHolds({
      orderId: 'ord-b', buyerId, holds: [{ vendorId: 'shared-seller', amountUGX: 200 }],
    });

    // orderId is no longer unique, but one seller on two orders is still two
    // distinct holds.
    expect((await escrowService.getEscrowHolds('ord-a'))[0].amountUGX).toBe(100);
    expect((await escrowService.getEscrowHolds('ord-b'))[0].amountUGX).toBe(200);
  });
});

// ─── Reads ────────────────────────────────────────────────────────────────────

describe('getVendorEscrowHold', () => {
  it('addresses one seller’s hold on a shared order', async () => {
    await escrowService.createEscrowHolds({
      orderId: 'ord-multi', buyerId, holds: groupHoldsByVendor(MULTI_VENDOR_LINES),
    });

    const alpha = await escrowService.getVendorEscrowHold('ord-multi', 'seller-alpha');
    expect(alpha?.amountUGX).toBe(3_500);

    await expect(escrowService.getVendorEscrowHold('ord-multi', 'seller-nobody'))
      .resolves.toBeNull();
  });
});

// ─── Release ──────────────────────────────────────────────────────────────────

describe('releaseEscrow', () => {
  it('releases every vendor on the order, not just one', async () => {
    await escrowService.createEscrowHolds({
      orderId: 'ord-multi', buyerId, holds: groupHoldsByVendor(MULTI_VENDOR_LINES),
    });

    const result = await escrowService.releaseEscrow('ord-multi', 'buyer');

    expect(result).toHaveLength(2);
    expect(result.every((h) => h.status === 'released_to_vendor')).toBe(true);
    expect(result.every((h) => h.releasedAt !== null)).toBe(true);
  });

  it('emits one escrow.released event per vendor, carrying that vendor’s amount', async () => {
    await escrowService.createEscrowHolds({
      orderId: 'ord-multi', buyerId, holds: groupHoldsByVendor(MULTI_VENDOR_LINES),
    });
    mockPublish.mockClear();

    await escrowService.releaseEscrow('ord-multi', 'buyer');

    const released = mockPublish.mock.calls
      .map((call) => call[1])
      .filter((event) => event.type === 'escrow.released');

    expect(released).toHaveLength(2);
    expect(
      Object.fromEntries(released.map((e) => [e.data.vendorId as string, e.data.amountUGX])),
    ).toEqual({ 'seller-alpha': 3_500, 'seller-zebra': 5_000 });
  });

  it('is idempotent — a second release does not re-emit or re-credit', async () => {
    await escrowService.createEscrowHolds({
      orderId: 'ord-multi', buyerId, holds: groupHoldsByVendor(MULTI_VENDOR_LINES),
    });
    await escrowService.releaseEscrow('ord-multi', 'buyer');
    mockPublish.mockClear();

    const second = await escrowService.releaseEscrow('ord-multi', 'buyer');

    expect(second.every((h) => h.status === 'released_to_vendor')).toBe(true);
    expect(
      mockPublish.mock.calls.filter(
        (call) => call[1].type === 'escrow.released',
      ),
    ).toHaveLength(0);
  });

  it('returns an empty list for an order with no holds', async () => {
    await expect(escrowService.releaseEscrow('ord-unknown')).resolves.toEqual([]);
  });

  it('pays the undisputed sellers even when one is frozen', async () => {
    await escrowService.createEscrowHolds({
      orderId: 'ord-multi', buyerId, holds: groupHoldsByVendor(MULTI_VENDOR_LINES),
    });
    await escrowService.freezeEscrowForDispute('ord-multi', 'D-1', 'seller-zebra');

    const result = await escrowService.releaseEscrow('ord-multi', 'buyer');

    // One seller's dispute must not hold the whole basket's payouts hostage.
    const byVendor = Object.fromEntries(result.map((h) => [h.vendorId, h.status]));
    expect(byVendor['seller-alpha']).toBe('released_to_vendor');
    expect(byVendor['seller-zebra']).toBe('dispute_hold');
  });

  it('refuses when every hold on the order is under dispute', async () => {
    await escrowService.createEscrowHolds({
      orderId: 'ord-multi', buyerId, holds: groupHoldsByVendor(MULTI_VENDOR_LINES),
    });
    await escrowService.freezeEscrowForDispute('ord-multi', 'D-2');

    await expect(escrowService.releaseEscrow('ord-multi', 'buyer'))
      .rejects.toThrow(/dispute hold/i);
  });
});

// ─── Release, scoped to one vendor ────────────────────────────────────────────
//
// The over-release bug. buyer-protection calls this when a buyer confirms
// receipt, and a buyer confirms receipt of ONE seller's parcel. Called with
// only an orderId it released every seller on the basket — including sellers
// who had not shipped — and `released_to_vendor` is terminal, so the buyer's
// protection against the others went with the money.

describe('releaseEscrow — scoped to one vendor', () => {
  beforeEach(async () => {
    await escrowService.createEscrowHolds({
      orderId: 'ord-multi', buyerId, holds: groupHoldsByVendor(MULTI_VENDOR_LINES),
    });
  });

  it('pays only the named seller', async () => {
    const result = await escrowService.releaseEscrow('ord-multi', 'buyer', { vendorId: 'seller-alpha' });

    expect(result).toHaveLength(1);
    expect(result[0].vendorId).toBe('seller-alpha');
    expect(result[0].status).toBe('released_to_vendor');
  });

  it('leaves the other seller’s money in escrow', async () => {
    await escrowService.releaseEscrow('ord-multi', 'buyer', { vendorId: 'seller-alpha' });

    // The whole point: seller-zebra has not delivered, and is not paid.
    const zebra = await escrowService.getVendorEscrowHold('ord-multi', 'seller-zebra');
    expect(zebra!.status).toBe('in_escrow');
    expect(zebra!.releasedAt).toBeNull();
  });

  it('emits an escrow.released event for that seller only', async () => {
    mockPublish.mockClear();

    await escrowService.releaseEscrow('ord-multi', 'buyer', { vendorId: 'seller-alpha' });

    const released = mockPublish.mock.calls
      .map((call) => call[1])
      .filter((event) => event.type === 'escrow.released');

    expect(released).toHaveLength(1);
    expect(released[0].data.vendorId).toBe('seller-alpha');
    expect(released[0].data.amountUGX).toBe(3_500);
  });

  it('releases each seller independently as their parcels arrive', async () => {
    await escrowService.releaseEscrow('ord-multi', 'buyer', { vendorId: 'seller-alpha' });
    await escrowService.releaseEscrow('ord-multi', 'buyer', { vendorId: 'seller-zebra' });

    const all = await escrowService.getEscrowHolds('ord-multi');
    expect(all.every((h) => h.status === 'released_to_vendor')).toBe(true);
  });

  it('returns an empty list for a seller with no hold on the order', async () => {
    await expect(
      escrowService.releaseEscrow('ord-multi', 'buyer', { vendorId: 'seller-nobody' }),
    ).resolves.toEqual([]);

    // And nothing else was touched on the way past.
    const all = await escrowService.getEscrowHolds('ord-multi');
    expect(all.every((h) => h.status === 'in_escrow')).toBe(true);
  });

  it('refuses when the named seller’s own hold is frozen, without touching the others', async () => {
    await escrowService.freezeEscrowForDispute('ord-multi', 'D-9', 'seller-alpha');

    await expect(
      escrowService.releaseEscrow('ord-multi', 'buyer', { vendorId: 'seller-alpha' }),
    ).rejects.toThrow(/dispute hold/i);

    const zebra = await escrowService.getVendorEscrowHold('ord-multi', 'seller-zebra');
    expect(zebra!.status).toBe('in_escrow');
  });

  it('still releases the whole order when no vendor is named — single-vendor callers are unchanged', async () => {
    const result = await escrowService.releaseEscrow('ord-multi', 'buyer');

    expect(result).toHaveLength(2);
    expect(result.every((h) => h.status === 'released_to_vendor')).toBe(true);
  });
});

// ─── Refund ───────────────────────────────────────────────────────────────────
//
// The third transition, and the one that did not exist. `refunded_to_buyer` was
// in the status enum and summed by reconcileEscrowLedger, but nothing wrote it:
// buyer-protection flipped its own hold and published `escrow.refund_requested`,
// which no service subscribed to. After a buyer-favour dispute the two ledgers
// disagreed permanently.

describe('refundEscrow', () => {
  beforeEach(async () => {
    await escrowService.createEscrowHolds({
      orderId: 'ord-multi', buyerId, holds: groupHoldsByVendor(MULTI_VENDOR_LINES),
    });
  });

  it('returns one seller’s hold to the buyer', async () => {
    const result = await escrowService.refundEscrow('ord-multi', 'dispute', { vendorId: 'seller-alpha' });

    expect(result).toHaveLength(1);
    expect(result[0].status).toBe('refunded_to_buyer');
  });

  it('leaves the other seller’s hold alone', async () => {
    await escrowService.refundEscrow('ord-multi', 'dispute', { vendorId: 'seller-alpha' });

    const zebra = await escrowService.getVendorEscrowHold('ord-multi', 'seller-zebra');
    expect(zebra!.status).toBe('in_escrow');
  });

  it('refunds a hold that is frozen for the dispute — the case it exists for', async () => {
    await escrowService.freezeEscrowForDispute('ord-multi', 'D-7', 'seller-alpha');

    const result = await escrowService.refundEscrow('ord-multi', 'dispute', {
      vendorId: 'seller-alpha', disputeId: 'D-7',
    });

    // Release refuses a frozen hold; refund must not, or the endpoint is
    // useless for the only situation that produces one.
    expect(result[0].status).toBe('refunded_to_buyer');
  });

  it('records the dispute on the hold', async () => {
    await escrowService.refundEscrow('ord-multi', 'dispute', {
      vendorId: 'seller-alpha', disputeId: 'D-7',
    });

    const alpha = await escrowService.getVendorEscrowHold('ord-multi', 'seller-alpha');
    expect(alpha!.holdReason).toContain('D-7');
  });

  it('emits escrow.refunded under eventType, which is what consumers read', async () => {
    mockPublish.mockClear();

    await escrowService.refundEscrow('ord-multi', 'dispute', { vendorId: 'seller-alpha' });

    const events = mockPublish.mock.calls.map((call) => call[1] as Record<string, unknown>);
    const refunded = events.filter((e) => e.eventType === 'escrow.refunded');

    expect(refunded).toHaveLength(1);
    expect((refunded[0].data as Record<string, unknown>).vendorId).toBe('seller-alpha');
    expect((refunded[0].data as Record<string, unknown>).amountUGX).toBe(3_500);
  });

  it('refuses to refund money already paid out to the vendor', async () => {
    await escrowService.releaseEscrow('ord-multi', 'buyer', { vendorId: 'seller-alpha' });

    await expect(
      escrowService.refundEscrow('ord-multi', 'dispute', { vendorId: 'seller-alpha' }),
    ).rejects.toThrow(/already been released/i);
  });

  it('is idempotent — a second refund does not re-emit', async () => {
    await escrowService.refundEscrow('ord-multi', 'dispute', { vendorId: 'seller-alpha' });
    mockPublish.mockClear();

    await escrowService.refundEscrow('ord-multi', 'dispute', { vendorId: 'seller-alpha' });

    expect(
      mockPublish.mock.calls.filter((c) => (c[1] as Record<string, unknown>).eventType === 'escrow.refunded'),
    ).toHaveLength(0);
  });

  it('counts toward refundedUGX, which was permanently zero before', async () => {
    await escrowService.refundEscrow('ord-multi', 'dispute', { vendorId: 'seller-alpha' });

    const report = await escrowService.reconcileEscrowLedger();
    expect(report.refundedUGX).toBe(3_500);
  });

  it('returns an empty list for a seller with no hold', async () => {
    await expect(
      escrowService.refundEscrow('ord-multi', 'dispute', { vendorId: 'seller-nobody' }),
    ).resolves.toEqual([]);
  });
});

// ─── Freeze ───────────────────────────────────────────────────────────────────

describe('freezeEscrowForDispute', () => {
  it('freezes only the disputed seller when one is named', async () => {
    await escrowService.createEscrowHolds({
      orderId: 'ord-multi', buyerId, holds: groupHoldsByVendor(MULTI_VENDOR_LINES),
    });

    const frozen = await escrowService.freezeEscrowForDispute('ord-multi', 'D-3', 'seller-alpha');

    expect(frozen).toHaveLength(1);
    expect(frozen[0].vendorId).toBe('seller-alpha');

    const all = await escrowService.getEscrowHolds('ord-multi');
    expect(all.find((h) => h.vendorId === 'seller-zebra')?.status).toBe('in_escrow');
  });

  it('freezes the whole order when no seller is named', async () => {
    await escrowService.createEscrowHolds({
      orderId: 'ord-multi', buyerId, holds: groupHoldsByVendor(MULTI_VENDOR_LINES),
    });

    const frozen = await escrowService.freezeEscrowForDispute('ord-multi', 'D-4');
    expect(frozen).toHaveLength(2);
  });

  it('cannot freeze money that has already left', async () => {
    await escrowService.createEscrowHolds({
      orderId: 'ord-multi', buyerId, holds: groupHoldsByVendor(MULTI_VENDOR_LINES),
    });
    await escrowService.releaseEscrow('ord-multi', 'buyer');

    await expect(escrowService.freezeEscrowForDispute('ord-multi', 'D-5'))
      .resolves.toEqual([]);
  });
});

// ─── Reconciliation ───────────────────────────────────────────────────────────

describe('reconcileEscrowLedger', () => {
  it('counts every vendor hold, not every order', async () => {
    await escrowService.createEscrowHolds({
      orderId: 'ord-multi', buyerId, holds: groupHoldsByVendor(MULTI_VENDOR_LINES),
    });

    const report = await escrowService.reconcileEscrowLedger();

    expect(report.totalEscrowEntries).toBe(2);
    expect(report.activeEscrowHoldUGX).toBe(8_500);
  });

  it('moves value from active to released as holds settle', async () => {
    await escrowService.createEscrowHolds({
      orderId: 'ord-multi', buyerId, holds: groupHoldsByVendor(MULTI_VENDOR_LINES),
    });
    await escrowService.releaseEscrow('ord-multi', 'buyer');

    const report = await escrowService.reconcileEscrowLedger();

    expect(report.activeEscrowHoldUGX).toBe(0);
    expect(report.releasedUGX).toBe(8_500);
  });
});
