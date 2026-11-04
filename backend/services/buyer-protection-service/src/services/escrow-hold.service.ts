import { randomUUID } from 'node:crypto';
import { publish } from '../../../../shared/kafka/producer.js';
import { Topics } from '../../../../shared/kafka/topics.js';
import { env } from '../config/env.js';
import { paymentServiceClient } from '../clients/payment-service.client.js';
import { userServiceClient } from '../clients/user-service.client.js';
import type { CreateEscrowHoldInput, EscrowHold, ReleaseTrigger } from '../models/escrow-hold.model.js';
import {
  holdKeyFor as holdKey,
  prismaEscrowHoldRepository,
} from '../repositories/prisma-buyer-protection.repository.js';
import type { IEscrowHoldRepository } from '../types/repositories.js';

// ─── Escrow Payout Hold Service ─────────────────────────────────────────────
//
// Buyer Protection's side of the escrow story: decides WHEN a seller gets
// paid. payment-service's own escrow ledger (`EscrowHoldEntry`) remains the
// system of record for the money itself — see clients/payment-service.client.ts.
//
// Release conditions (either one triggers payout):
//   1. Buyer explicitly confirms receipt (`confirmReceipt`).
//   2. 7 days pass after verified delivery with no open dispute — enforced
//      by the periodic sweep in workers/escrow-release.worker.ts calling
//      `runAutoReleaseSweep()`.
// A dispute (`holdForDispute`) blocks both until dispute-service resolves it
// one way or the other.

// Holds live in Postgres behind IEscrowHoldRepository. holdKey() moved to the
// repository module so both implementations key by exactly the same string the
// Map did.

export class EscrowHoldNotFoundError extends Error {
  constructor(orderId: string, subOrderId?: string) {
    super(`No escrow hold found for order ${orderId}${subOrderId ? ` / sub-order ${subOrderId}` : ''}`);
    this.name = 'EscrowHoldNotFoundError';
  }
}

export class EscrowHoldStateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EscrowHoldStateError';
  }
}

export class EscrowHoldService {
  constructor(private readonly repo: IEscrowHoldRepository = prismaEscrowHoldRepository) {}

  /**
   * Called at checkout — locks the order's payment in escrow the moment
   * payment succeeds.
   *
   * WARNING: this replaces any existing hold for the same order/sub-order,
   * because `holdStore.set(key, hold)` did. A second call for an order whose
   * hold is already RELEASED resets it to HELD, with the payout record wiped.
   * Preserved deliberately — turning it into a duplicate-key error is a
   * behaviour change that belongs in its own commit, not a persistence swap —
   * but it is a real hazard worth closing.
   */
  async createHold(input: CreateEscrowHoldInput): Promise<EscrowHold> {
    const now = new Date().toISOString();
    const hold: EscrowHold = {
      id: randomUUID(),
      orderId: input.orderId,
      subOrderId: input.subOrderId ?? null,
      buyerId: input.buyerId,
      sellerId: input.sellerId,
      amount: input.amount,
      currency: input.currency ?? 'UGX',
      status: 'HELD',
      deliveredAt: null,
      autoReleaseAt: null,
      expectedDeliveryAt: null,
      activeDisputeId: null,
      createdAt: now,
      updatedAt: now,
    };

    const saved = await this.repo.upsert(hold);

    void publish(Topics.BUYER_PROTECTION_EVENTS, { type: 'escrow_hold.created', data: saved }, input.orderId);

    return saved;
  }

  async getHold(orderId: string, subOrderId?: string): Promise<EscrowHold | null> {
    return this.repo.findByKey(holdKey(orderId, subOrderId));
  }

  async listAll(): Promise<EscrowHold[]> {
    return this.repo.findAll();
  }

  async listBySeller(sellerId: string): Promise<EscrowHold[]> {
    return this.repo.findBySeller(sellerId);
  }

  /**
   * Records verified delivery and starts the 7-day auto-release clock.
   * `expectedDeliveryAt`, when supplied by the caller (shipping/fulfillment),
   * is stored purely as a trust-score signal (on-time vs. late) — it has no
   * effect on the escrow timer itself, which always counts from actual delivery.
   */
  async markDelivered(orderId: string, subOrderId: string | undefined, deliveredAt: string, expectedDeliveryAt?: string): Promise<EscrowHold> {
    const key = holdKey(orderId, subOrderId);
    const hold = await this.repo.findByKey(key);
    if (!hold) throw new EscrowHoldNotFoundError(orderId, subOrderId);
    if (hold.status === 'RELEASED' || hold.status === 'REFUNDED') {
      throw new EscrowHoldStateError(`Cannot record delivery — escrow for order ${orderId} is already ${hold.status.toLowerCase()}`);
    }

    const autoReleaseAt = new Date(
      new Date(deliveredAt).getTime() + env.escrow.autoReleaseDays * 24 * 60 * 60 * 1000,
    ).toISOString();

    const updated = await this.repo.update(key, {
      deliveredAt,
      autoReleaseAt,
      expectedDeliveryAt: expectedDeliveryAt ?? null,
      updatedAt: new Date().toISOString(),
    });
    if (!updated) throw new EscrowHoldNotFoundError(orderId, subOrderId);

    void publish(Topics.BUYER_PROTECTION_EVENTS, { type: 'escrow_hold.delivered', data: updated }, orderId);

    if (expectedDeliveryAt) {
      const onTime = new Date(deliveredAt).getTime() <= new Date(expectedDeliveryAt).getTime();
      void userServiceClient.recordDeliveryEvent(updated.sellerId, onTime ? 'ORDER_DELIVERED_ON_TIME' : 'ORDER_DELIVERED_LATE', orderId, deliveredAt);
    }

    return updated;
  }

  /** Buyer-initiated: release immediately, skipping the rest of the 7-day window. */
  async confirmReceipt(orderId: string, subOrderId: string | undefined, buyerId: string): Promise<EscrowHold> {
    const hold = await this.repo.findByKey(holdKey(orderId, subOrderId));
    if (!hold) throw new EscrowHoldNotFoundError(orderId, subOrderId);
    if (hold.buyerId !== buyerId) {
      throw new EscrowHoldStateError('Only the buyer on this order can confirm receipt');
    }
    if (hold.status === 'DISPUTE_HELD') {
      throw new EscrowHoldStateError('Cannot confirm receipt while a dispute is open on this order');
    }
    if (hold.status !== 'HELD') {
      throw new EscrowHoldStateError(`Escrow for order ${orderId} is already ${hold.status.toLowerCase()}`);
    }

    return this.release(hold, 'BUYER_CONFIRMED');
  }

  /** Called by dispute-service the moment a claim is opened — freezes payout until it's resolved. */
  async holdForDispute(orderId: string, subOrderId: string | undefined, disputeId: string): Promise<EscrowHold> {
    const key = holdKey(orderId, subOrderId);
    const existing = await this.repo.findByKey(key);
    if (!existing) throw new EscrowHoldNotFoundError(orderId, subOrderId);
    if (existing.status === 'RELEASED' || existing.status === 'REFUNDED') {
      throw new EscrowHoldStateError(`Cannot freeze escrow — order ${orderId} is already ${existing.status.toLowerCase()}`);
    }

    // Freeze locally first. The remote call below is best-effort, and the
    // freeze must not depend on it landing.
    const hold = await this.repo.update(key, {
      status: 'DISPUTE_HELD',
      activeDisputeId: disputeId,
      updatedAt: new Date().toISOString(),
    });
    if (!hold) throw new EscrowHoldNotFoundError(orderId, subOrderId);

    // Best-effort: mirrors the rest of this codebase's cross-service calls
    // (see currency.client.ts's doc comment for the one deliberate
    // exception). The local hold is already frozen regardless of whether
    // this call lands — payment-service's own ledger freeze is a
    // belt-and-suspenders extra, not the source of truth for the freeze.
    try {
      // Scoped to the seller on this hold, for the same reason release is: a
      // dispute is with one seller, and freezing the whole basket punishes the
      // others in it. payment-service has always accepted `vendorId` here
      // (HoldEscrowSchema) — this client simply never sent it.
      await paymentServiceClient.holdEscrowForDispute(orderId, disputeId, hold.sellerId);
    } catch (err) {
      console.warn(`[escrow-hold] payment-service escrow freeze call failed for order ${orderId} (hold is still frozen locally):`, err);
    }

    void publish(Topics.BUYER_PROTECTION_EVENTS, { type: 'escrow_hold.dispute_frozen', data: hold }, orderId);

    return hold;
  }

  /** Dispute resolved in the seller's favor (or dropped) — unfreeze and pay out. */
  async resolveDisputeSellerFavor(orderId: string, subOrderId: string | undefined): Promise<EscrowHold> {
    const hold = await this.repo.findByKey(holdKey(orderId, subOrderId));
    if (!hold) throw new EscrowHoldNotFoundError(orderId, subOrderId);
    // release() clears activeDisputeId as part of its write, so there is no
    // separate mutation to make here.
    return this.release(hold, 'DISPUTE_RESOLVED_SELLER_FAVOR');
  }

  /** Dispute resolved in the buyer's favor — funds go back to the buyer, never to the seller. */
  async refundToBuyer(orderId: string, subOrderId: string | undefined, disputeId: string): Promise<EscrowHold> {
    const key = holdKey(orderId, subOrderId);
    const existing = await this.repo.findByKey(key);
    if (!existing) throw new EscrowHoldNotFoundError(orderId, subOrderId);
    if (existing.status === 'RELEASED' || existing.status === 'REFUNDED') {
      throw new EscrowHoldStateError(`Cannot refund — order ${orderId} is already ${existing.status.toLowerCase()}`);
    }

    // Money first, state second — the same ordering `release` uses, and for the
    // same reason: if the remote call throws, nothing is written locally and a
    // retry simply tries again rather than leaving this service claiming a
    // refund that payment-service's ledger never made.
    //
    // That divergence is exactly what happened before. This wrote REFUNDED
    // locally and published `escrow.refund_requested`, which NOTHING consumed —
    // it was the only reference to that event name in the repository, and it
    // used `type` where every payment-events consumer filters on `eventType`,
    // so even a consumer written for it could not have matched. payment-service
    // kept the hold at `dispute_hold` forever and `refundedUGX` stayed zero.
    //
    // Scoped to this hold's seller, like release: a dispute with one seller must
    // not claw back the whole basket.
    await paymentServiceClient.refundEscrow(orderId, existing.sellerId, existing.subOrderId, disputeId);

    const refundedAt = new Date().toISOString();
    const hold = await this.repo.update(key, {
      status: 'REFUNDED',
      refundedAt,
      refundTrigger: 'DISPUTE_RESOLVED_BUYER_FAVOR',
      activeDisputeId: null,
      updatedAt: refundedAt,
    });
    if (!hold) throw new EscrowHoldNotFoundError(orderId, subOrderId);

    // Kept for notification-service (the buyer's refund email), now with the
    // envelope key the platform's consumers actually read. The authoritative
    // signal for the ledger is payment-service's own `escrow.refunded`, emitted
    // by the call above — not this one.
    void publish(
      Topics.PAYMENT_EVENTS,
      {
        eventType: 'escrow.refund_requested',
        data: { orderId, subOrderId, disputeId, amount: hold.amount, currency: hold.currency },
      },
      orderId,
    );
    void publish(Topics.BUYER_PROTECTION_EVENTS, { type: 'escrow_hold.refunded', data: hold }, orderId);

    return hold;
  }

  /**
   * Scans every HELD hold whose 7-day auto-release clock has expired and
   * pays it out. Individual failures are logged and skipped so one bad
   * order doesn't block the rest of the sweep — payment-service's own
   * transient failure just leaves the hold HELD for the next sweep tick.
   */
  async runAutoReleaseSweep(): Promise<{ checked: number; released: number; failed: number }> {
    // A narrow query rather than findAll() + filter: this runs on a timer
    // forever, and the [status, autoReleaseAt] index answers it directly.
    const dueHolds = await this.repo.findDueForAutoRelease(new Date().toISOString());

    let released = 0;
    let failed = 0;

    for (const hold of dueHolds) {
      try {
        await this.release(hold, 'AUTO_7_DAY');
        released++;
      } catch (err) {
        failed++;
        console.error(`[escrow-hold] Auto-release failed for order ${hold.orderId} — will retry next sweep:`, err);
      }
    }

    return { checked: dueHolds.length, released, failed };
  }

  /**
   * Calls payment-service to actually move the money, then — only on
   * success — flips local state to RELEASED. If the remote call fails this
   * throws and the hold is left exactly as it was, so both a buyer retrying
   * `confirmReceipt` and the next auto-release sweep tick will simply try
   * again rather than silently drifting out of sync with the real ledger.
   */
  private async release(hold: EscrowHold, trigger: ReleaseTrigger): Promise<EscrowHold> {
    // Money first, state second — unchanged, and the ordering is the whole
    // point of this method. If the remote call throws, nothing is written and
    // the hold stays exactly as it was, so a buyer retrying confirmReceipt and
    // the next sweep tick both simply try again rather than drifting out of
    // sync with the real ledger.
    // Scoped to the seller on THIS hold. Passing only the order id released
    // every vendor on it: a buyer confirming receipt from Seller A paid Seller
    // B unconditionally, before B had shipped anything, and
    // `released_to_vendor` is terminal — the buyer's protection against B went
    // with the money.
    await paymentServiceClient.releaseEscrow(hold.orderId, hold.sellerId, hold.subOrderId);

    const releasedAt = new Date().toISOString();
    const released = await this.repo.update(holdKey(hold.orderId, hold.subOrderId), {
      status: 'RELEASED',
      releasedAt,
      releaseTrigger: trigger,
      activeDisputeId: null,
      updatedAt: releasedAt,
    });
    if (!released) throw new EscrowHoldNotFoundError(hold.orderId, hold.subOrderId ?? undefined);

    void publish(Topics.BUYER_PROTECTION_EVENTS, { type: 'escrow_hold.released', data: released }, released.orderId);

    return released;
  }
}

export const escrowHoldService = new EscrowHoldService();
