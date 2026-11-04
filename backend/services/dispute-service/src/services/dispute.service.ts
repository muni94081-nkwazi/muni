import { randomUUID } from 'node:crypto';
import type {
  ClaimType,
  Dispute,
  DisputeDashboardMetrics,
  DisputeEvidence,
  DisputeStatus,
  ResolutionAction,
} from '../models/dispute.model.js';
import { SELLER_RESOLUTION_SLA_HOURS } from '../models/dispute.model.js';
import { publish } from '../../../../shared/kafka/producer.js';
import { Topics } from '../../../../shared/kafka/topics.js';
import { buyerProtectionClient } from '../clients/buyer-protection.client.js';
import { userServiceClient } from '../clients/user-service.client.js';
import {
  orderClient,
  OrderVerificationError,
  type VerifiableOrder,
} from '../clients/order.client.js';
import { prismaDisputeRepository } from '../repositories/prisma-dispute.repository.js';
import type { DisputeUpdate, IDisputeRepository } from '../types/repositories.js';
import { logger } from '../utils/logger.js';

// ─── Dispute service ──────────────────────────────────────────────────────────
//
// State lives in Postgres behind IDisputeRepository. This used to be a
// module-level Map, which meant every open claim vanished on restart and each
// replica had its own private view of who was owed a refund.
//
// The shape of the change: the old code fetched a dispute, mutated the object
// in place, and relied on the Map holding the same reference for that to
// "persist". Nothing persists implicitly against a database, so each mutation
// is now an explicit repository call whose return value is the new state. Every
// public method keeps its original signature.

function slaDeadline(from: Date): string {
  return new Date(from.getTime() + SELLER_RESOLUTION_SLA_HOURS * 60 * 60 * 1000).toISOString();
}

function toEvidence(
  input: { url: string; caption?: string }[],
  uploadedBy: string,
  role: 'buyer' | 'seller',
): DisputeEvidence[] {
  const ts = new Date().toISOString();
  return input.map((e) => ({
    id: randomUUID(),
    url: e.url,
    caption: e.caption,
    uploadedBy,
    uploadedByRole: role,
    uploadedAt: ts,
  }));
}

function hoursBetween(from: string, to: string): number {
  return Math.round(((new Date(to).getTime() - new Date(from).getTime()) / (60 * 60 * 1000)) * 100) / 100;
}

/**
 * The patch that auto-escalation applies, or null when it does not apply.
 *
 * Pure on purpose. The Map-backed version mutated the dispute and returned a
 * boolean, which worked only because the caller happened to hold the stored
 * reference. Returning the patch instead lets each caller decide whether to
 * persist it, and lets the sweep fire its side effects exactly once — the
 * property the old code's idempotency argument depended on.
 */
function slaBreachPatch(dispute: Dispute): DisputeUpdate | null {
  const isBreachable = dispute.status === 'OPENED' || dispute.status === 'SELLER_RESPONDED';
  const isPastDeadline = new Date() > new Date(dispute.resolutionDeadline);

  if (!isBreachable || !isPastDeadline) return null;

  const ts = new Date().toISOString();
  return {
    slaStatus: 'BREACHED',
    status: 'UNDER_MEDIATION',
    autoEscalated: true,
    escalatedAt: ts,
    updatedAt: ts,
  };
}

export class DisputeValidationError extends Error {
  readonly status = 400;
  constructor(message: string) {
    super(message);
    this.name = 'DisputeValidationError';
  }
}

/**
 * The order named on a filing could not be tied to the filer.
 *
 * Separate from DisputeValidationError because it carries its own status: a
 * foreign or missing order is a 404 (see below), a seller who is not on the
 * order is a 422, and an unreachable order-service is a 503.
 */
export class DisputeOrderError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
    this.name = 'DisputeOrderError';
  }
}

/**
 * Prove the filing describes an order the filer actually placed, from a seller
 * actually on it.
 *
 * Until now `orderId` and `sellerId` were whatever the client typed. Nothing
 * checked them, and both flow straight into consequences for a third party:
 * `holdForDispute` freezes the named seller's payout and
 * `recordSellerTrustEvent` records a DISPUTE_OPENED against them. So any
 * authenticated buyer could freeze an unrelated seller's money by filing
 * against an order that seller had never seen.
 *
 * order-service is the authority — it owns the order and already decides
 * ownership on `GET /api/v1/orders/:id`. Anything this service cached or
 * inferred would be a second source of truth, and the drift would surface as a
 * hold against the wrong seller.
 *
 * MUNI orders are multi-seller: an Order carries `subOrders[]`, each with its
 * own `sellerId`, and `items[]` likewise. The seller is checked against the
 * union of both, not against an assumed single seller on the order.
 */
async function verifyOrderForFiling(input: {
  orderId: string;
  subOrderId?: string;
  buyerId: string;
  sellerId: string;
}): Promise<void> {
  let order: VerifiableOrder;
  try {
    order = await orderClient.fetchOrderForBuyer(input.orderId, input.buyerId);
  } catch (err) {
    if (err instanceof OrderVerificationError) {
      throw new DisputeOrderError(err.status, err.message);
    }
    throw err;
  }

  const sellersOnOrder = new Set<string>();
  for (const sub of order.subOrders ?? []) if (sub.sellerId) sellersOnOrder.add(sub.sellerId);
  for (const item of order.items ?? []) if (item.sellerId) sellersOnOrder.add(item.sellerId);

  if (!sellersOnOrder.has(input.sellerId)) {
    // The order is the filer's own, so this says nothing they cannot already
    // see — and it does not enumerate who IS on the order.
    throw new DisputeOrderError(422, 'That seller is not on this order.');
  }

  // A sub-order narrows the claim, and it is what buyer-protection freezes.
  // An unrelated sub-order id would put the hold on the wrong seller's money
  // even though the order and seller both checked out.
  if (input.subOrderId) {
    const sub = (order.subOrders ?? []).find((s) => s.id === input.subOrderId);
    if (!sub || sub.sellerId !== input.sellerId) {
      throw new DisputeOrderError(422, 'That sub-order is not part of this order for that seller.');
    }
  }
}

export class DisputeService {
  constructor(private readonly repo: IDisputeRepository = prismaDisputeRepository) {}

  async createDispute(input: {
    orderId: string;
    subOrderId?: string;
    buyerId: string;
    sellerId: string;
    claimType: ClaimType;
    description: string;
    claimAmountUGX: number;
    evidence: { url: string; caption?: string }[];
  }): Promise<Dispute> {
    // Before anything is written, and before any hold is placed: the filer must
    // own this order and the named seller must be on it. Throws otherwise, so
    // there is no path from an unverified filing to a created dispute.
    await verifyOrderForFiling({
      orderId: input.orderId,
      subOrderId: input.subOrderId,
      buyerId: input.buyerId,
      sellerId: input.sellerId,
    });

    const id = randomUUID();
    const disputeNumber = `DISP-${Math.floor(2000 + Math.random() * 8000)}`;
    const now = new Date();
    const ts = now.toISOString();

    const dispute = await this.repo.create({
      id,
      disputeNumber,
      orderId: input.orderId,
      subOrderId: input.subOrderId ?? null,
      buyerId: input.buyerId,
      sellerId: input.sellerId,
      claimType: input.claimType,
      description: input.description,
      evidence: toEvidence(input.evidence, input.buyerId, 'buyer'),
      claimAmountUGX: input.claimAmountUGX,
      status: 'OPENED',
      resolutionDeadline: slaDeadline(now),
      slaStatus: 'PENDING',
      autoEscalated: false,
      messages: [
        {
          id: randomUUID(),
          senderId: input.buyerId,
          senderRole: 'buyer',
          content: input.description,
          sentAt: ts,
        },
      ],
      createdAt: ts,
      updatedAt: ts,
    });

    void publish(Topics.DISPUTE_EVENTS, { type: 'dispute.opened', data: dispute }, dispute.orderId);

    // Freeze the seller's payout the moment a claim is filed, and record the
    // dispute-rate signal against them — both best-effort (see the clients'
    // own doc comments for why a downstream outage doesn't block filing).
    // Deliberately after the write: a claim that was never recorded must not
    // freeze anyone's money.
    void buyerProtectionClient.holdForDispute(input.orderId, input.subOrderId, id);
    void userServiceClient.recordSellerTrustEvent(input.sellerId, {
      eventType: 'DISPUTE_OPENED',
      orderId: input.orderId,
      disputeId: id,
      occurredAt: ts,
    });

    return dispute;
  }

  async getDisputeById(id: string): Promise<Dispute | null> {
    const dispute = await this.repo.findById(id);
    if (!dispute) return null;

    const patch = slaBreachPatch(dispute);
    if (!patch) return dispute;

    return (await this.repo.update(id, patch)) ?? dispute;
  }

  /**
   * A dispute, but only for the buyer or seller named on it.
   *
   * `getDisputeById` above answers with whatever it finds, which is right for
   * the admin queue and the SLA worker and wrong for everyone else: the id was
   * the only thing standing between one customer and another's claim — order
   * id, seller, amount, description, evidence and the whole message thread.
   *
   * Returns null rather than throwing, so a dispute belonging to someone else
   * is indistinguishable from one that does not exist. Answering 403 here would
   * confirm the id is real, which is the disclosure the check exists to stop.
   */
  async getDisputeForParticipant(id: string, userId: string): Promise<Dispute | null> {
    const dispute = await this.getDisputeById(id);
    if (!dispute) return null;
    return dispute.buyerId === userId || dispute.sellerId === userId ? dispute : null;
  }

  async getDisputesForUser(userId: string, role: 'buyer' | 'seller'): Promise<Dispute[]> {
    const disputes = await this.repo.findByUser(userId, role);

    return Promise.all(
      disputes.map(async (d) => {
        const patch = slaBreachPatch(d);
        if (!patch) return d;
        return (await this.repo.update(d.id, patch)) ?? d;
      }),
    );
  }

  /**
   * Attach evidence. Only the two parties to the dispute may.
   *
   * The role is derived from which of them the uploader is, not passed in. It
   * used to arrive from `req.body.role`, so an uploader could label their own
   * photo as the other side's — evidence in an arbitration whose attribution
   * the arbitrator has no way to check.
   */
  async addEvidence(
    id: string,
    uploaderId: string,
    items: { url: string; caption?: string }[],
  ): Promise<Dispute | null> {
    const dispute = await this.getDisputeForParticipant(id, uploaderId);
    if (!dispute) return null;

    const role: 'buyer' | 'seller' = dispute.buyerId === uploaderId ? 'buyer' : 'seller';

    if (
      dispute.status === 'RESOLVED_BUYER_FAVOR' ||
      dispute.status === 'RESOLVED_SELLER_FAVOR' ||
      dispute.status === 'CLOSED'
    ) {
      throw new DisputeValidationError('Cannot add evidence to a closed dispute');
    }

    return this.repo.appendEvidence(id, toEvidence(items, uploaderId, role), new Date().toISOString());
  }

  /** Non-resolving message exchange — keeps the SLA clock running (only sellerResolve satisfies it). */
  async sellerRespond(id: string, sellerId: string, responseContent: string): Promise<Dispute | null> {
    const dispute = await this.getDisputeById(id);
    if (!dispute) return null;
    if (dispute.sellerId !== sellerId) {
      throw new DisputeValidationError('Only the seller on this dispute can respond');
    }

    const ts = new Date().toISOString();

    const updated = await this.repo.appendMessage(
      id,
      { senderId: sellerId, senderRole: 'seller', content: responseContent, sentAt: ts },
      dispute.status === 'OPENED'
        ? { status: 'SELLER_RESPONDED', updatedAt: ts }
        : { updatedAt: ts },
    );
    if (!updated) return null;

    void publish(Topics.DISPUTE_EVENTS, { type: 'dispute.seller_responded', data: updated }, updated.orderId);

    return updated;
  }

  /**
   * The seller's actual resolution within the 72h SLA. All three actions are
   * buyer-favorable by definition — a seller who disputes the claim instead
   * of resolving it just lets the clock run (auto-escalating to admin
   * mediation) or waits for the buyer to escalate to arbitration.
   *
   * NB: ACCEPT_RETURN is treated the same as a full refund for escrow
   * purposes in this system — modeling "hold the refund until the returned
   * item is physically received back" would require integrating
   * return-service's own receipt-confirmation flow, which is out of scope
   * here.
   */
  async sellerResolve(
    id: string,
    sellerId: string,
    input: { action: ResolutionAction; refundAmountUGX?: number; note?: string },
  ): Promise<Dispute | null> {
    const dispute = await this.getDisputeById(id);
    if (!dispute) return null;

    if (dispute.sellerId !== sellerId) {
      throw new DisputeValidationError('Only the seller on this dispute can resolve it');
    }
    if (dispute.status === 'UNDER_MEDIATION' || dispute.status === 'ARBITRATION') {
      throw new DisputeValidationError('This dispute has been escalated — only an admin can resolve it now');
    }
    if (dispute.status !== 'OPENED' && dispute.status !== 'SELLER_RESPONDED') {
      throw new DisputeValidationError(`Dispute is already ${dispute.status.toLowerCase()}`);
    }
    if (input.action === 'REFUND_PARTIAL' && (!input.refundAmountUGX || input.refundAmountUGX <= 0)) {
      throw new DisputeValidationError('refundAmountUGX is required for a partial refund');
    }
    if (input.action === 'REFUND_PARTIAL' && input.refundAmountUGX! > dispute.claimAmountUGX) {
      throw new DisputeValidationError('refundAmountUGX cannot exceed the claim amount');
    }

    const ts = new Date().toISOString();
    const withinSla = new Date(ts) <= new Date(dispute.resolutionDeadline);
    const responseTimeHours = hoursBetween(dispute.createdAt, ts);

    const refundAmountUGX =
      input.action === 'REFUND_FULL' || input.action === 'ACCEPT_RETURN'
        ? dispute.claimAmountUGX
        : input.refundAmountUGX;

    // The resolution and the message recording it go in one write, so a
    // resolved dispute always carries the note explaining how.
    const updated = await this.repo.appendMessage(
      id,
      {
        senderId: sellerId,
        senderRole: 'seller',
        content: `Resolved via ${input.action}${input.note ? `: ${input.note}` : ''}`,
        sentAt: ts,
      },
      {
        status: 'RESOLVED_BUYER_FAVOR',
        resolutionAction: input.action,
        refundAmountUGX,
        resolutionNote: input.note,
        slaStatus: withinSla ? 'MET' : 'BREACHED',
        resolvedAt: ts,
        updatedAt: ts,
      },
    );
    if (!updated) return null;

    void buyerProtectionClient.resolveDisputeHold(
      updated.orderId,
      updated.subOrderId ?? undefined,
      id,
      'BUYER_FAVOR',
    );
    void publish(Topics.DISPUTE_EVENTS, { type: 'dispute.resolved', data: updated }, updated.orderId);

    void userServiceClient.recordSellerTrustEvent(sellerId, {
      eventType: 'DISPUTE_RESOLVED_BUYER_FAVOR',
      orderId: updated.orderId,
      disputeId: id,
      responseTimeHours,
      occurredAt: ts,
    });
    if (updated.claimType === 'DEFECTIVE_ITEM') {
      void userServiceClient.recordSellerTrustEvent(sellerId, {
        eventType: 'ITEM_DEFECT_REPORTED',
        orderId: updated.orderId,
        disputeId: id,
        occurredAt: ts,
      });
    }

    return updated;
  }

  /**
   * Escalate to binding admin arbitration. Parties only.
   *
   * Unscoped, this moved any dispute in the system to ARBITRATION on nothing
   * but its id — pulling a claim out of the seller's SLA window and in front of
   * an arbitrator on a stranger's say-so.
   */
  async escalateToArbitration(id: string, userId: string, reason: string): Promise<Dispute | null> {
    const dispute = await this.getDisputeForParticipant(id, userId);
    if (!dispute) return null;

    const ts = new Date().toISOString();

    const updated = await this.repo.appendMessage(
      id,
      {
        senderId: userId,
        senderRole: 'buyer',
        content: `ESCALATED TO BINDING ARBITRATION: ${reason}`,
        sentAt: ts,
      },
      { status: 'ARBITRATION', escalatedAt: ts, updatedAt: ts },
    );
    if (!updated) return null;

    void publish(Topics.DISPUTE_EVENTS, { type: 'dispute.escalated', data: updated }, updated.orderId);

    return updated;
  }

  /** Admin arbitration — the terminal path for disputes that escalated past the seller's SLA window. */
  async resolveDispute(
    id: string,
    adminId: string,
    resolution: 'RESOLVED_BUYER_FAVOR' | 'RESOLVED_SELLER_FAVOR',
    note: string,
  ): Promise<Dispute | null> {
    const dispute = await this.getDisputeById(id);
    if (!dispute) return null;

    const ts = new Date().toISOString();
    const responseTimeHours = hoursBetween(dispute.createdAt, ts);

    const updated = await this.repo.update(id, {
      status: resolution,
      adminId,
      resolutionNote: note,
      resolvedAt: ts,
      updatedAt: ts,
    });
    if (!updated) return null;

    const outcome = resolution === 'RESOLVED_BUYER_FAVOR' ? 'BUYER_FAVOR' : 'SELLER_FAVOR';
    void buyerProtectionClient.resolveDisputeHold(
      updated.orderId,
      updated.subOrderId ?? undefined,
      id,
      outcome,
    );

    void userServiceClient.recordSellerTrustEvent(updated.sellerId, {
      eventType:
        resolution === 'RESOLVED_BUYER_FAVOR'
          ? 'DISPUTE_RESOLVED_BUYER_FAVOR'
          : 'DISPUTE_RESOLVED_SELLER_FAVOR',
      orderId: updated.orderId,
      disputeId: id,
      responseTimeHours,
      occurredAt: ts,
    });
    if (resolution === 'RESOLVED_BUYER_FAVOR' && updated.claimType === 'DEFECTIVE_ITEM') {
      void userServiceClient.recordSellerTrustEvent(updated.sellerId, {
        eventType: 'ITEM_DEFECT_REPORTED',
        orderId: updated.orderId,
        disputeId: id,
        occurredAt: ts,
      });
    }

    void publish(Topics.DISPUTE_EVENTS, { type: 'dispute.resolved', data: updated }, updated.orderId);

    return updated;
  }

  /**
   * Active SLA sweep — see workers/sla-escalation.worker.ts. Unlike the lazy
   * check in getDisputeById, this fires the escalation side effects (admin
   * notification event, seller trust-score ding) exactly once per dispute, at
   * the moment it crosses the deadline, rather than waiting for someone to
   * happen to read it.
   *
   * The once-only guarantee now comes from the write rather than from object
   * identity: repo.update() moves the row out of OPENED/SELLER_RESPONDED, so
   * the next sweep's findSlaCandidates() does not return it.
   */
  async runSlaEscalationSweep(): Promise<{ checked: number; escalated: number }> {
    const candidates = await this.repo.findSlaCandidates();
    let escalated = 0;

    for (const dispute of candidates) {
      const patch = slaBreachPatch(dispute);
      if (!patch) continue;

      const updated = await this.repo.update(dispute.id, patch);
      if (!updated) continue;
      escalated++;

      logger.warn('[dispute-service] Dispute auto-escalated to admin panel — SLA expired', {
        disputeId: updated.id,
        disputeNumber: updated.disputeNumber,
        orderId: updated.orderId,
      });

      void publish(
        Topics.DISPUTE_EVENTS,
        { type: 'dispute.auto_escalated', data: updated },
        updated.orderId,
      );
      void userServiceClient.recordSellerTrustEvent(updated.sellerId, {
        eventType: 'SLA_BREACHED',
        orderId: updated.orderId,
        disputeId: updated.id,
        responseTimeHours: hoursBetween(updated.createdAt, updated.updatedAt),
        occurredAt: updated.updatedAt,
      });
    }

    return { checked: candidates.length, escalated };
  }

  /**
   * Every dispute, newest first, optionally narrowed. Backs the admin queue.
   *
   * Applies the same SLA settle-on-read as getDashboardMetrics: a queue that
   * showed OPENED for a dispute whose deadline has passed would disagree with
   * the metrics tile sitting directly above it.
   */
  async listDisputes(filter: { status?: DisputeStatus; sellerId?: string } = {}): Promise<Dispute[]> {
    const raw = await this.repo.findAll();

    const settled = await Promise.all(
      raw.map(async (d) => {
        const patch = slaBreachPatch(d);
        if (!patch) return d;
        return (await this.repo.update(d.id, patch)) ?? d;
      }),
    );

    return settled
      .filter((d) => (filter.status ? d.status === filter.status : true))
      .filter((d) => (filter.sellerId ? d.sellerId === filter.sellerId : true))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async getDashboardMetrics(): Promise<DisputeDashboardMetrics> {
    // Reading the dashboard also settles any dispute whose deadline has passed,
    // which is what the Map-backed version did. Kept deliberately: the metrics
    // would otherwise report a stale OPENED count that the next sweep silently
    // contradicts.
    const raw = await this.repo.findAll();
    const list = await Promise.all(
      raw.map(async (d) => {
        const patch = slaBreachPatch(d);
        if (!patch) return d;
        return (await this.repo.update(d.id, patch)) ?? d;
      }),
    );

    const totalDisputes = list.length;
    const openDisputes = list.filter((d) => d.status === 'OPENED' || d.status === 'SELLER_RESPONDED').length;
    const underMediation = list.filter((d) => d.status === 'UNDER_MEDIATION').length;
    const inArbitration = list.filter((d) => d.status === 'ARBITRATION').length;
    const slaBreachesCount = list.filter((d) => d.slaStatus === 'BREACHED').length;
    const autoEscalatedCount = list.filter((d) => d.autoEscalated).length;
    const resolvedBuyerFavor = list.filter((d) => d.status === 'RESOLVED_BUYER_FAVOR').length;
    const resolvedSellerFavor = list.filter((d) => d.status === 'RESOLVED_SELLER_FAVOR').length;

    const resolved = list.filter((d) => d.resolvedAt);
    const averageResolutionHours = resolved.length
      ? Math.round(
          (resolved.reduce((sum, d) => sum + hoursBetween(d.createdAt, d.resolvedAt!), 0) /
            resolved.length) *
            100,
        ) / 100
      : 0;

    return {
      totalDisputes,
      openDisputes,
      underMediation,
      inArbitration,
      slaBreachesCount,
      autoEscalatedCount,
      resolvedBuyerFavor,
      resolvedSellerFavor,
      averageResolutionHours,
    };
  }
}

export const disputeService = new DisputeService();
