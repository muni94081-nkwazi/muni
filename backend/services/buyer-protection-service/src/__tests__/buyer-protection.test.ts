import { jest, describe, it, expect, beforeEach } from '@jest/globals';

const mockPublish = jest.fn<() => Promise<void>>().mockResolvedValue();

jest.unstable_mockModule('../../../../shared/kafka/producer.js', () => ({
  publish: mockPublish,
  connectProducer: jest.fn<() => Promise<void>>().mockResolvedValue(),
  disconnectProducer: jest.fn<() => Promise<void>>().mockResolvedValue(),
  isProducerReady: jest.fn<() => boolean>().mockReturnValue(true),
}));

// payment-service actually moves the money; release() is defined by calling it
// before any local state changes, so the test needs to control it.
const mockReleaseEscrow = jest.fn<() => Promise<void>>().mockResolvedValue();
const mockHoldEscrowForDispute = jest.fn<() => Promise<void>>().mockResolvedValue();
const mockRefundEscrow = jest.fn<() => Promise<void>>().mockResolvedValue();

jest.unstable_mockModule('../clients/payment-service.client.js', () => ({
  paymentServiceClient: {
    releaseEscrow: mockReleaseEscrow,
    holdEscrowForDispute: mockHoldEscrowForDispute,
    refundEscrow: mockRefundEscrow,
  },
}));

jest.unstable_mockModule('../clients/user-service.client.js', () => ({
  userServiceClient: {
    recordDeliveryEvent: jest.fn<() => Promise<void>>().mockResolvedValue(),
  },
}));

// Filing a claim now verifies with order-service that the order is the filer's
// own — see clients/order.client.ts. These cases are about what a claim record
// looks like once filed, so the order resolves as the filer's; the refusal
// paths (another buyer's order, an order that does not exist, order-service
// unreachable) are covered in buyer-protection.authz.test.ts.
jest.unstable_mockModule('../clients/order.client.js', () => ({
  OrderVerificationError: class OrderVerificationError extends Error {
    constructor(public status: number, message: string, public reason: string) { super(message); }
  },
  orderClient: {
    fetchOrderForBuyer: jest.fn(async (orderId: string, buyerId: string) => ({
      id: orderId,
      userId: buyerId,
      items: [{ sellerId: 'seller-001' }],
    })),
  },
  fetchOrderForBuyer: jest.fn(),
}));

const { BuyerProtectionService } = await import('../services/buyer-protection.service.js');
const { EscrowHoldService, EscrowHoldNotFoundError, EscrowHoldStateError } = await import(
  '../services/escrow-hold.service.js'
);
const { MemoryClaimRepository, MemoryEscrowHoldRepository } = await import(
  '../repositories/memory-buyer-protection.repository.js'
);

const BUYER = 'user-123';
const SELLER = 'seller-001';

describe('Phase 16 — Buyer Protection Service Unit Tests', () => {
  let claims: InstanceType<typeof MemoryClaimRepository>;
  let buyerProtectionService: InstanceType<typeof BuyerProtectionService>;

  beforeEach(() => {
    claims = new MemoryClaimRepository();
    buyerProtectionService = new BuyerProtectionService(claims);
    jest.clearAllMocks();
  });

  it('returns active buyer protection policy terms', () => {
    const policy = buyerProtectionService.getPolicy();
    expect(policy.protectionWindowDays).toBe(30);
    expect(policy.maxCoverageLimitUGX).toBe(10_000_000);
  });

  it('checks order eligibility and accepts covered categories within 30 days', () => {
    const result = buyerProtectionService.checkEligibility({
      productId: 'phone-001',
      category: 'electronics',
      orderAmountUGX: 4_200_000,
    });

    expect(result.isEligible).toBe(true);
    expect(result.maxCoverageAmountUGX).toBe(4_200_000);
  });

  it('rejects eligibility for excluded categories (e.g. gift_cards)', () => {
    const result = buyerProtectionService.checkEligibility({
      productId: 'gc-001',
      category: 'gift_cards',
      orderAmountUGX: 100_000,
    });

    expect(result.isEligible).toBe(false);
    expect(result.reason).toContain('excluded');
  });

  it('files buyer protection claims and returns claim number', async () => {
    const claim = await buyerProtectionService.fileClaim({
      orderId: 'MUNI-1001',
      userId: BUYER,
      productId: 'phone-001',
      reason: 'NOT_AS_DESCRIBED',
      claimAmountUGX: 4_200_000,
    });

    expect(claim.id).toBeDefined();
    expect(claim.claimNumber).toContain('CLAIM-');
    expect(claim.status).toBe('FILED');
  });

  it('persists a filed claim so it can be read back', async () => {
    const claim = await buyerProtectionService.fileClaim({
      orderId: 'MUNI-1001',
      userId: BUYER,
      productId: 'phone-001',
      reason: 'COUNTERFEIT',
      claimAmountUGX: 900_000,
    });

    expect(await claims.findById(claim.id)).not.toBeNull();
    expect(await buyerProtectionService.getClaimsForUser(BUYER)).toHaveLength(1);
    expect(await buyerProtectionService.getAllClaims()).toHaveLength(1);
  });

  it('resolves a claim and keeps the resolution notes', async () => {
    const claim = await buyerProtectionService.fileClaim({
      orderId: 'MUNI-1001',
      userId: BUYER,
      productId: 'phone-001',
      reason: 'DAMAGED',
      claimAmountUGX: 500_000,
    });

    const resolved = await buyerProtectionService.resolveClaim(claim.id, 'APPROVED', 'Photos confirm damage.');

    expect(resolved.status).toBe('APPROVED');
    expect(resolved.resolutionNotes).toBe('Photos confirm damage.');
    expect((await claims.findById(claim.id))!.status).toBe('APPROVED');
  });

  it('throws for an unknown claim id, as the Map version did', async () => {
    await expect(buyerProtectionService.resolveClaim('nope', 'REJECTED')).rejects.toThrow('not found');
  });
});

describe('Escrow holds', () => {
  let holds: InstanceType<typeof MemoryEscrowHoldRepository>;
  let escrow: InstanceType<typeof EscrowHoldService>;

  beforeEach(() => {
    holds = new MemoryEscrowHoldRepository();
    escrow = new EscrowHoldService(holds);
    jest.clearAllMocks();
  });

  const input = { orderId: 'MUNI-1001', buyerId: BUYER, sellerId: SELLER, amount: 250_000 };

  it('creates a hold in HELD and reads it back by order id', async () => {
    const hold = await escrow.createHold(input);

    expect(hold.status).toBe('HELD');
    expect(hold.currency).toBe('UGX');
    expect(await escrow.getHold('MUNI-1001')).not.toBeNull();
  });

  it('keys holds by order and sub-order separately', async () => {
    await escrow.createHold(input);
    await escrow.createHold({ ...input, subOrderId: 'sub-A' });

    expect(await escrow.getHold('MUNI-1001')).not.toBeNull();
    expect(await escrow.getHold('MUNI-1001', 'sub-A')).not.toBeNull();
    expect(await escrow.listAll()).toHaveLength(2);
  });

  it('starts the auto-release clock on delivery and persists it', async () => {
    await escrow.createHold(input);
    const delivered = new Date().toISOString();

    const updated = await escrow.markDelivered('MUNI-1001', undefined, delivered);

    expect(updated.deliveredAt).toBe(delivered);
    expect(updated.autoReleaseAt).not.toBeNull();
    expect((await escrow.getHold('MUNI-1001'))!.autoReleaseAt).toBe(updated.autoReleaseAt);
  });

  it('releases on buyer confirmation, calling payment-service first', async () => {
    await escrow.createHold(input);

    const released = await escrow.confirmReceipt('MUNI-1001', undefined, BUYER);

    // Scoped to the seller on this hold. Called with the order id alone,
    // payment-service released every vendor on the basket — so a buyer
    // confirming Seller A's parcel paid Seller B before B had shipped.
    expect(mockReleaseEscrow).toHaveBeenCalledWith('MUNI-1001', SELLER, null);
    expect(released.status).toBe('RELEASED');
    expect(released.releaseTrigger).toBe('BUYER_CONFIRMED');
    expect((await escrow.getHold('MUNI-1001'))!.status).toBe('RELEASED');
  });

  it('leaves the hold untouched when payment-service fails to release', async () => {
    await escrow.createHold(input);
    mockReleaseEscrow.mockRejectedValueOnce(new Error('gateway down') as never);

    await expect(escrow.confirmReceipt('MUNI-1001', undefined, BUYER)).rejects.toThrow('gateway down');

    // The whole point of calling payment-service before writing: a failed
    // payout must not leave the hold reading as RELEASED.
    expect((await escrow.getHold('MUNI-1001'))!.status).toBe('HELD');
  });

  it('refuses receipt confirmation from anyone but the buyer', async () => {
    await escrow.createHold(input);

    await expect(escrow.confirmReceipt('MUNI-1001', undefined, 'someone-else')).rejects.toBeInstanceOf(
      EscrowHoldStateError,
    );
  });

  it('freezes on dispute and blocks confirmation while frozen', async () => {
    await escrow.createHold(input);

    const frozen = await escrow.holdForDispute('MUNI-1001', undefined, 'disp-1');
    expect(frozen.status).toBe('DISPUTE_HELD');
    expect(frozen.activeDisputeId).toBe('disp-1');

    await expect(escrow.confirmReceipt('MUNI-1001', undefined, BUYER)).rejects.toThrow(/dispute is open/);
  });

  it('freezes only the disputed seller in payment-service, not the whole basket', async () => {
    await escrow.createHold(input);
    mockHoldEscrowForDispute.mockClear();

    await escrow.holdForDispute('MUNI-1001', undefined, 'disp-1');

    // Sent with only (orderId, disputeId), payment-service froze every vendor
    // on the order — a dispute with one seller held the others' money too.
    // HoldEscrowSchema has always accepted vendorId; this client never sent it.
    expect(mockHoldEscrowForDispute).toHaveBeenCalledWith('MUNI-1001', 'disp-1', SELLER);
  });

  it('freezes locally even when payment-service rejects the freeze', async () => {
    await escrow.createHold(input);
    mockHoldEscrowForDispute.mockRejectedValueOnce(new Error('unreachable') as never);

    const frozen = await escrow.holdForDispute('MUNI-1001', undefined, 'disp-1');

    expect(frozen.status).toBe('DISPUTE_HELD');
    expect((await escrow.getHold('MUNI-1001'))!.status).toBe('DISPUTE_HELD');
  });

  it('refunds to the buyer and never pays the seller', async () => {
    await escrow.createHold(input);
    await escrow.holdForDispute('MUNI-1001', undefined, 'disp-1');

    const refunded = await escrow.refundToBuyer('MUNI-1001', undefined, 'disp-1');

    expect(refunded.status).toBe('REFUNDED');
    expect(refunded.refundTrigger).toBe('DISPUTE_RESOLVED_BUYER_FAVOR');
    expect(mockReleaseEscrow).not.toHaveBeenCalled();
  });

  it('tells payment-service to refund, scoped to this hold’s seller', async () => {
    await escrow.createHold(input);
    await escrow.holdForDispute('MUNI-1001', undefined, 'disp-1');
    mockRefundEscrow.mockClear();

    await escrow.refundToBuyer('MUNI-1001', undefined, 'disp-1');

    // Before this existed, the ledger never learned the refund happened: the
    // only signal was an `escrow.refund_requested` event nothing subscribed to.
    expect(mockRefundEscrow).toHaveBeenCalledWith('MUNI-1001', SELLER, null, 'disp-1');
  });

  it('does not mark the hold REFUNDED when payment-service refuses', async () => {
    await escrow.createHold(input);
    await escrow.holdForDispute('MUNI-1001', undefined, 'disp-1');
    mockRefundEscrow.mockRejectedValueOnce(new Error('ledger unavailable') as never);

    await expect(escrow.refundToBuyer('MUNI-1001', undefined, 'disp-1')).rejects.toThrow();

    // Money first, state second — the same ordering release uses. Writing
    // REFUNDED here would claim a refund the ledger never made.
    expect((await escrow.getHold('MUNI-1001'))!.status).toBe('DISPUTE_HELD');
  });

  it('releases on a seller-favour resolution and clears the dispute id', async () => {
    await escrow.createHold(input);
    await escrow.holdForDispute('MUNI-1001', undefined, 'disp-1');

    const released = await escrow.resolveDisputeSellerFavor('MUNI-1001', undefined);

    expect(released.status).toBe('RELEASED');
    expect(released.activeDisputeId).toBeNull();
    expect(released.releaseTrigger).toBe('DISPUTE_RESOLVED_SELLER_FAVOR');
  });

  it('refuses to refund a hold already paid out', async () => {
    await escrow.createHold(input);
    await escrow.confirmReceipt('MUNI-1001', undefined, BUYER);

    await expect(escrow.refundToBuyer('MUNI-1001', undefined, 'disp-1')).rejects.toBeInstanceOf(
      EscrowHoldStateError,
    );
  });

  it('throws NotFound for an order with no hold', async () => {
    await expect(escrow.markDelivered('NOPE', undefined, new Date().toISOString())).rejects.toBeInstanceOf(
      EscrowHoldNotFoundError,
    );
  });

  describe('auto-release sweep', () => {
    async function makeDueHold() {
      const hold = await escrow.createHold(input);
      holds.seed({
        ...hold,
        deliveredAt: new Date(Date.now() - 8 * 86_400_000).toISOString(),
        autoReleaseAt: new Date(Date.now() - 60_000).toISOString(),
      });
    }

    it('pays out a hold whose clock has expired, once', async () => {
      await makeDueHold();

      expect(await escrow.runAutoReleaseSweep()).toEqual({ checked: 1, released: 1, failed: 0 });
      // Second sweep finds nothing: the write moved it out of HELD.
      expect(await escrow.runAutoReleaseSweep()).toEqual({ checked: 0, released: 0, failed: 0 });
    });

    it('leaves a hold whose clock has not expired', async () => {
      await escrow.createHold(input);
      await escrow.markDelivered('MUNI-1001', undefined, new Date().toISOString());

      expect(await escrow.runAutoReleaseSweep()).toEqual({ checked: 0, released: 0, failed: 0 });
    });

    it('counts a failed payout and leaves the hold for the next tick', async () => {
      await makeDueHold();
      mockReleaseEscrow.mockRejectedValueOnce(new Error('gateway down') as never);

      expect(await escrow.runAutoReleaseSweep()).toEqual({ checked: 1, released: 0, failed: 1 });
      expect((await escrow.getHold('MUNI-1001'))!.status).toBe('HELD');
    });

    it('never auto-releases a hold frozen by a dispute', async () => {
      await makeDueHold();
      await escrow.holdForDispute('MUNI-1001', undefined, 'disp-1');

      expect(await escrow.runAutoReleaseSweep()).toEqual({ checked: 0, released: 0, failed: 0 });
    });
  });
});
