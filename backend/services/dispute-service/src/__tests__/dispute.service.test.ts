import { jest, describe, it, expect, beforeEach } from '@jest/globals';

// The service fires Kafka events and calls buyer-protection / user-service on
// every state change. None of that is under test here — what is under test is
// that moving from a Map to a repository did not change behaviour.
jest.unstable_mockModule('../../../../shared/kafka/producer.js', () => ({
  publish: jest.fn<() => Promise<void>>().mockResolvedValue(),
  connectProducer: jest.fn<() => Promise<void>>().mockResolvedValue(),
  disconnectProducer: jest.fn<() => Promise<void>>().mockResolvedValue(),
  isProducerReady: jest.fn<() => boolean>().mockReturnValue(true),
}));

jest.unstable_mockModule('../clients/buyer-protection.client.js', () => ({
  buyerProtectionClient: {
    holdForDispute: jest.fn<() => Promise<void>>().mockResolvedValue(),
    resolveDisputeHold: jest.fn<() => Promise<void>>().mockResolvedValue(),
  },
}));

// createDispute now verifies the order against order-service before writing
// anything. These tests are about persistence behaviour, not verification, so
// the order resolves as the filer's own with the fixture seller on it.
// disputes.order-validation.test.ts drives the real verification logic.
jest.unstable_mockModule('../clients/order.client.js', () => ({
  orderClient: {
    fetchOrderForBuyer: jest.fn(async (orderId: string, buyerId: string) => ({
      id: orderId,
      userId: buyerId,
      items: [{ sellerId: 'seller-001' }],
      subOrders: [{ id: 'sub-1', sellerId: 'seller-001' }],
    })),
  },
  OrderVerificationError: class OrderVerificationError extends Error {
    constructor(public status: number, message: string, public reason: string) { super(message); }
  },
}));

jest.unstable_mockModule('../clients/user-service.client.js', () => ({
  userServiceClient: {
    recordSellerTrustEvent: jest.fn<() => Promise<void>>().mockResolvedValue(),
  },
}));

const { MemoryDisputeRepository } = await import('../repositories/memory-dispute.repository.js');
const { DisputeService, DisputeValidationError } = await import('../services/dispute.service.js');
const { buyerProtectionClient } = await import('../clients/buyer-protection.client.js');

const BUYER = 'user-123';
const SELLER = 'seller-001';

function newService() {
  const repo = new MemoryDisputeRepository();
  return { repo, service: new DisputeService(repo) };
}

function openInput(overrides: Record<string, unknown> = {}) {
  return {
    orderId: 'MUNI-1001',
    buyerId: BUYER,
    sellerId: SELLER,
    claimType: 'NON_DELIVERY' as const,
    description: 'Marked delivered but never arrived.',
    claimAmountUGX: 250_000,
    evidence: [{ url: 'https://muni.ug/evidence/proof1.jpg', caption: 'Empty doorstep' }],
    ...overrides,
  };
}

describe('DisputeService against a repository', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('createDispute', () => {
    it('persists the dispute, its evidence and its opening message', async () => {
      const { repo, service } = newService();

      const created = await service.createDispute(openInput());

      expect(created.status).toBe('OPENED');
      expect(created.slaStatus).toBe('PENDING');
      expect(created.autoEscalated).toBe(false);
      expect(created.evidence).toHaveLength(1);
      expect(created.messages).toHaveLength(1);
      expect(created.messages[0]!.content).toBe('Marked delivered but never arrived.');

      // The point of the whole change: it is readable back out of the store,
      // not just present on the object the caller happens to be holding.
      const reloaded = await repo.findById(created.id);
      expect(reloaded).not.toBeNull();
      expect(reloaded!.disputeNumber).toBe(created.disputeNumber);
      expect(reloaded!.messages).toHaveLength(1);
    });

    it('sets a resolution deadline 72 hours out', async () => {
      const { service } = newService();

      const created = await service.createDispute(openInput());
      const hours =
        (new Date(created.resolutionDeadline).getTime() - new Date(created.createdAt).getTime()) /
        3_600_000;

      expect(Math.round(hours)).toBe(72);
    });

    it('freezes the seller payout only after the claim is durably recorded', async () => {
      const { service } = newService();
      const created = await service.createDispute(openInput());

      expect(buyerProtectionClient.holdForDispute).toHaveBeenCalledWith(
        'MUNI-1001',
        undefined,
        created.id,
      );
    });
  });

  describe('mutations survive a re-read', () => {
    it('records a seller response and moves OPENED to SELLER_RESPONDED', async () => {
      const { repo, service } = newService();
      const created = await service.createDispute(openInput());

      const updated = await service.sellerRespond(created.id, SELLER, 'Courier says it was left with security.');

      expect(updated!.status).toBe('SELLER_RESPONDED');
      expect(updated!.messages).toHaveLength(2);

      const reloaded = await repo.findById(created.id);
      expect(reloaded!.status).toBe('SELLER_RESPONDED');
      expect(reloaded!.messages).toHaveLength(2);
    });

    it('appends evidence without dropping what was already there', async () => {
      const { repo, service } = newService();
      const created = await service.createDispute(openInput());

      await service.addEvidence(created.id, BUYER, [{ url: 'https://muni.ug/e/2.jpg' }]);
      await service.addEvidence(created.id, SELLER, [{ url: 'https://muni.ug/e/3.jpg' }]);

      const reloaded = await repo.findById(created.id);
      expect(reloaded!.evidence).toHaveLength(3);
      expect(reloaded!.evidence.map((e) => e.uploadedByRole)).toEqual(['buyer', 'buyer', 'seller']);
    });

    it('refuses evidence on a closed dispute', async () => {
      const { service } = newService();
      const created = await service.createDispute(openInput());
      await service.sellerResolve(created.id, SELLER, { action: 'REFUND_FULL' });

      await expect(
        service.addEvidence(created.id, BUYER, [{ url: 'https://muni.ug/e/late.jpg' }]),
      ).rejects.toBeInstanceOf(DisputeValidationError);
    });
  });

  describe('sellerResolve', () => {
    it('refunds the full claim amount for REFUND_FULL and marks the SLA met', async () => {
      const { repo, service } = newService();
      const created = await service.createDispute(openInput());

      const resolved = await service.sellerResolve(created.id, SELLER, {
        action: 'REFUND_FULL',
        note: 'Reshipping declined, refunding.',
      });

      expect(resolved!.status).toBe('RESOLVED_BUYER_FAVOR');
      expect(resolved!.refundAmountUGX).toBe(250_000);
      expect(resolved!.slaStatus).toBe('MET');
      expect(resolved!.resolvedAt).toBeDefined();

      const reloaded = await repo.findById(created.id);
      expect(reloaded!.refundAmountUGX).toBe(250_000);
      expect(reloaded!.resolutionAction).toBe('REFUND_FULL');
    });

    it('treats ACCEPT_RETURN as a full refund, as the escrow flow assumes', async () => {
      const { service } = newService();
      const created = await service.createDispute(openInput());

      const resolved = await service.sellerResolve(created.id, SELLER, { action: 'ACCEPT_RETURN' });

      expect(resolved!.refundAmountUGX).toBe(250_000);
    });

    it('rejects a partial refund above the claim amount', async () => {
      const { service } = newService();
      const created = await service.createDispute(openInput());

      await expect(
        service.sellerResolve(created.id, SELLER, { action: 'REFUND_PARTIAL', refundAmountUGX: 999_999 }),
      ).rejects.toThrow(/cannot exceed the claim amount/);
    });

    it('rejects a resolution from anyone but the seller on the dispute', async () => {
      const { service } = newService();
      const created = await service.createDispute(openInput());

      await expect(
        service.sellerResolve(created.id, 'seller-999', { action: 'REFUND_FULL' }),
      ).rejects.toThrow(/Only the seller/);
    });

    it('releases the escrow hold in the buyer’s favour', async () => {
      const { service } = newService();
      const created = await service.createDispute(openInput());

      await service.sellerResolve(created.id, SELLER, { action: 'REFUND_FULL' });

      expect(buyerProtectionClient.resolveDisputeHold).toHaveBeenCalledWith(
        'MUNI-1001',
        undefined,
        created.id,
        'BUYER_FAVOR',
      );
    });
  });

  describe('SLA auto-escalation', () => {
    /** Rewinds a dispute's deadline into the past, as if 72h had elapsed. */
    async function expireDeadline(repo: InstanceType<typeof MemoryDisputeRepository>, id: string) {
      const d = await repo.findById(id);
      repo.seed({ ...d!, resolutionDeadline: new Date(Date.now() - 60_000).toISOString() });
    }

    it('escalates a lapsed dispute on read, and persists that escalation', async () => {
      const { repo, service } = newService();
      const created = await service.createDispute(openInput());
      await expireDeadline(repo, created.id);

      const read = await service.getDisputeById(created.id);

      expect(read!.status).toBe('UNDER_MEDIATION');
      expect(read!.slaStatus).toBe('BREACHED');
      expect(read!.autoEscalated).toBe(true);

      // The Map version mutated the object it returned; here the escalation
      // has to have been written, or the next reader sees OPENED again.
      const reloaded = await repo.findById(created.id);
      expect(reloaded!.status).toBe('UNDER_MEDIATION');
      expect(reloaded!.autoEscalated).toBe(true);
    });

    it('escalates via the sweep and counts it once', async () => {
      const { repo, service } = newService();
      const created = await service.createDispute(openInput());
      await expireDeadline(repo, created.id);

      const first = await service.runSlaEscalationSweep();
      expect(first).toEqual({ checked: 1, escalated: 1 });

      // Second sweep must find nothing: the write moved the row out of the
      // candidate statuses. This is what stops the trust-score ding and the
      // admin notification firing on every tick.
      const second = await service.runSlaEscalationSweep();
      expect(second).toEqual({ checked: 0, escalated: 0 });
    });

    it('leaves a dispute inside its window alone', async () => {
      const { service } = newService();
      await service.createDispute(openInput());

      expect(await service.runSlaEscalationSweep()).toEqual({ checked: 1, escalated: 0 });
    });

    it('blocks the seller from resolving once escalated', async () => {
      const { repo, service } = newService();
      const created = await service.createDispute(openInput());
      await expireDeadline(repo, created.id);
      await service.runSlaEscalationSweep();

      await expect(
        service.sellerResolve(created.id, SELLER, { action: 'REFUND_FULL' }),
      ).rejects.toThrow(/only an admin can resolve it now/);
    });
  });

  describe('admin arbitration', () => {
    it('records the admin, the outcome and the note', async () => {
      const { repo, service } = newService();
      const created = await service.createDispute(openInput());
      await service.escalateToArbitration(created.id, BUYER, 'Seller unresponsive');

      const resolved = await service.resolveDispute(
        created.id,
        'admin-007',
        'RESOLVED_SELLER_FAVOR',
        'Tracking shows signature on delivery.',
      );

      expect(resolved!.status).toBe('RESOLVED_SELLER_FAVOR');
      expect(resolved!.adminId).toBe('admin-007');

      const reloaded = await repo.findById(created.id);
      expect(reloaded!.adminId).toBe('admin-007');
      expect(reloaded!.resolutionNote).toBe('Tracking shows signature on delivery.');
    });

    it('releases the hold in the seller’s favour on a seller-favour ruling', async () => {
      const { service } = newService();
      const created = await service.createDispute(openInput());

      await service.resolveDispute(created.id, 'admin-007', 'RESOLVED_SELLER_FAVOR', 'note');

      expect(buyerProtectionClient.resolveDisputeHold).toHaveBeenCalledWith(
        'MUNI-1001',
        undefined,
        created.id,
        'SELLER_FAVOR',
      );
    });
  });

  describe('lookups and metrics', () => {
    it('scopes disputes to the requesting party', async () => {
      const { service } = newService();
      await service.createDispute(openInput());
      await service.createDispute(openInput({ buyerId: 'user-999', orderId: 'MUNI-1002' }));

      expect(await service.getDisputesForUser(BUYER, 'buyer')).toHaveLength(1);
      expect(await service.getDisputesForUser('user-999', 'buyer')).toHaveLength(1);
      // Both claims name the same seller.
      expect(await service.getDisputesForUser(SELLER, 'seller')).toHaveLength(2);
    });

    it('returns null for a dispute that does not exist', async () => {
      const { service } = newService();
      expect(await service.getDisputeById('nope')).toBeNull();
      expect(await service.sellerRespond('nope', SELLER, 'hi')).toBeNull();
    });

    it('aggregates dashboard counts across statuses', async () => {
      const { repo, service } = newService();
      const a = await service.createDispute(openInput());
      const b = await service.createDispute(openInput({ orderId: 'MUNI-1002' }));
      await service.createDispute(openInput({ orderId: 'MUNI-1003' }));

      await service.sellerResolve(a.id, SELLER, { action: 'REFUND_FULL' });
      await expireDeadlineFor(repo, b.id);

      const metrics = await service.getDashboardMetrics();

      expect(metrics.totalDisputes).toBe(3);
      expect(metrics.resolvedBuyerFavor).toBe(1);
      // Reading the dashboard settles b's lapsed deadline, as it always did.
      expect(metrics.underMediation).toBe(1);
      expect(metrics.autoEscalatedCount).toBe(1);
      expect(metrics.openDisputes).toBe(1);
      expect(metrics.averageResolutionHours).toBeGreaterThanOrEqual(0);
    });

    async function expireDeadlineFor(
      repo: InstanceType<typeof MemoryDisputeRepository>,
      id: string,
    ) {
      const d = await repo.findById(id);
      repo.seed({ ...d!, resolutionDeadline: new Date(Date.now() - 60_000).toISOString() });
    }
  });
});
