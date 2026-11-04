import { randomUUID } from 'node:crypto';
import { publish } from '../../../../shared/kafka/producer.js';
import {
  AUTO_APPROVE_REASONS,
  GUARANTEE_WINDOW_DAYS,
  type GuaranteeEligibility,
  type ReturnRequest,
  type ReturnStatus,
} from '../models/return.model.js';
import { prismaReturnRepository } from '../repositories/prisma-return.repository.js';
import { fetchOrderForBuyer, type VerifiableOrder } from '../clients/order.client.js';

/** One seller's slice of an order, as order-service reports it. */
type SellerSlice = NonNullable<VerifiableOrder['subOrders']>[number];
import type { IReturnRepository } from '../types/repositories.js';

// ─── Return service ───────────────────────────────────────────────────────────
//
// State lives in Postgres behind IReturnRepository. This was a
// `Map<string, any>`, which meant an approved return — a refund the buyer has
// already been promised — disappeared on the next restart, and each replica
// disagreed about which RMAs existed.
//
// The exported function signatures are unchanged, so no controller changed.
// `repo` is swappable purely so tests can run against the in-memory
// implementation.

let repo: IReturnRepository = prismaReturnRepository;

/** Test seam: point the module at a different repository implementation. */
export function setReturnRepository(next: IReturnRepository): void {
  repo = next;
}

export const checkGuaranteeEligibility = async (
  orderId: string,
  orderDeliveredAt?: string,
): Promise<GuaranteeEligibility> => {
  const deliveredMs = orderDeliveredAt
    ? new Date(orderDeliveredAt).getTime()
    : Date.now() - 5 * 24 * 60 * 60 * 1000;
  const ageDays = (Date.now() - deliveredMs) / (1000 * 60 * 60 * 24);
  const isEligible = ageDays <= GUARANTEE_WINDOW_DAYS;

  return {
    orderId,
    isEligible,
    windowDaysRemaining: Math.max(0, Math.ceil(GUARANTEE_WINDOW_DAYS - ageDays)),
    guaranteeLabel: isEligible ? '14-Day Money Back Guarantee Active' : 'Guarantee Window Expired',
  };
};

export interface CreateReturnInput {
  orderId: string;
  userId: string;
  sellerId: string;
  items: { orderItemId: string; quantity: number; reason: string }[];
  description?: string;
  refundMethod: string;
  /** See the note on ReturnRequest.refundAmount — nothing supplies this today. */
  refundAmount?: number | null;
  currency?: string | null;
  reason?: string;
}


/** A return the order itself does not support. */
export class ReturnNotEligibleError extends Error {
  readonly status = 422;
  constructor(message: string) {
    super(message);
    this.name = 'ReturnNotEligibleError';
  }
}

/**
 * Check a requested return against the order it claims to be for.
 *
 * None of this happened before: `orderId`, `sellerId` and `items[]` came off
 * the request body and were written straight to a return row. A customer could
 * file against an order that does not exist, against somebody else's order,
 * naming a seller who never sold them anything, for items that were never in
 * the basket, in quantities that were never bought — and an auto-approving
 * reason on top of that published `refund.initiated`.
 *
 * Ownership is settled by the client (order-service answers 404 for an order
 * that is not this buyer's). What is left, and what this adds, is whether the
 * claim matches what was actually bought and whether the window is still open.
 *
 * Returns the seller's sub-order so the caller can record what was verified
 * rather than what was asserted.
 */
async function verifyAgainstOrder(data: CreateReturnInput): Promise<SellerSlice> {
  const order = await fetchOrderForBuyer(data.orderId, data.userId);

  const subOrders = order.subOrders ?? [];
  const sellerSlice = subOrders.find((s) => s.sellerId === data.sellerId);
  if (!sellerSlice) {
    // Deliberately the same message as an unknown seller: a buyer must not be
    // able to enumerate which sellers are on an order they part-own.
    throw new ReturnNotEligibleError('That seller has nothing on this order.');
  }

  // Delivery is what starts the clock. An order still in flight cannot be
  // returned — cancelling it is the route, and that is order-service's.
  const deliveredAt = sellerSlice.deliveredAt ?? null;
  if (String(sellerSlice.status).toLowerCase() !== 'delivered' || !deliveredAt) {
    throw new ReturnNotEligibleError(
      'This order has not been delivered yet, so it cannot be returned. Cancel it instead.',
    );
  }

  const ageDays = (Date.now() - new Date(deliveredAt).getTime()) / (1000 * 60 * 60 * 24);
  if (ageDays > GUARANTEE_WINDOW_DAYS) {
    throw new ReturnNotEligibleError(
      `The ${GUARANTEE_WINDOW_DAYS}-day return window for this order closed ${Math.floor(ageDays - GUARANTEE_WINDOW_DAYS)} day(s) ago.`,
    );
  }

  const purchased = new Map((sellerSlice.items ?? []).map((i) => [i.id, i.quantity ?? 0]));

  if (data.items.length === 0) {
    throw new ReturnNotEligibleError('A return has to name at least one item.');
  }

  const seen = new Set<string>();
  for (const line of data.items) {
    const bought = purchased.get(line.orderItemId);
    if (bought === undefined) {
      throw new ReturnNotEligibleError('One of those items is not on this order.');
    }
    if (seen.has(line.orderItemId)) {
      throw new ReturnNotEligibleError('The same item was listed twice.');
    }
    seen.add(line.orderItemId);

    if (!Number.isInteger(line.quantity) || line.quantity < 1) {
      throw new ReturnNotEligibleError('Each line needs a whole quantity of at least 1.');
    }
    if (line.quantity > bought) {
      throw new ReturnNotEligibleError(
        `You bought ${bought} of that item and cannot return ${line.quantity}.`,
      );
    }
  }

  return sellerSlice;
}

export const createReturn = async (data: CreateReturnInput): Promise<ReturnRequest> => {
  // Before anything is written and before any refund event is published.
  const sellerSlice = await verifyAgainstOrder(data);

  const id = randomUUID();
  const ts = new Date().toISOString();

  // 14-day auto-approval check. Unchanged: the reason is read off the payload's
  // top-level `reason`, which the request schema does not define either — so in
  // practice submitted returns land as REQUESTED and wait for a seller.
  const isAutoApproved = (AUTO_APPROVE_REASONS as readonly string[]).includes(
    (data.reason ?? '').toUpperCase(),
  );

  const ret = await repo.create({
    id,
    orderId: data.orderId,
    userId: data.userId,
    // The seller as the ORDER records them, not as the request asserted them.
    sellerId: sellerSlice.sellerId ?? data.sellerId,
    items: data.items,
    description: data.description,
    refundMethod: data.refundMethod,
    refundAmount: data.refundAmount ?? null,
    currency: data.currency ?? null,
    status: isAutoApproved ? 'APPROVED' : 'REQUESTED',
    isAutoApproved,
    guaranteeBadge: '14-Day Money Back Guarantee Applied',
    requestedAt: ts,
    approvedAt: isAutoApproved ? ts : null,
    updatedAt: ts,
  });

  // Published after the write: a refund event for a return that was never
  // recorded would have payment-service moving money against nothing.
  void publish('return-events' as never, {
    type: isAutoApproved ? 'return.approved' : 'return.requested',
    data: ret,
  });

  if (isAutoApproved) {
    void publish('payment-events' as never, {
      type: 'refund.initiated',
      data: { orderId: ret.orderId, returnId: id, refundAmount: ret.refundAmount },
    });
  }

  return ret;
};

export const getUserReturns = async (userId: string): Promise<ReturnRequest[]> =>
  repo.findByUser(userId);

export const getSellerReturns = async (sellerId: string): Promise<ReturnRequest[]> =>
  repo.findBySeller(sellerId);

export const getAllReturns = async (): Promise<ReturnRequest[]> => repo.findAll();

/**
 * One return, scoped to the customer who raised it.
 *
 * This took only an id and handed back whatever it found, so any authenticated
 * customer could read any return — order id, seller, items, reasons and refund
 * details — by guessing or observing an identifier. Verified: customer B read
 * customer A's return and got a 200.
 *
 * A return belonging to someone else is reported as absent rather than
 * forbidden, so the endpoint does not confirm that an id exists.
 */
export const getOwnReturn = async (id: string, userId: string): Promise<ReturnRequest | null> => {
  const found = await repo.findById(id);
  return found && found.userId === userId ? found : null;
};

/** Unscoped read. Seller and admin handlers only — never a customer route. */
export const getReturn = async (id: string): Promise<ReturnRequest | null> => repo.findById(id);

/** The only transition a customer may make, and only from REQUESTED. */
const CUSTOMER_CANCELLABLE: readonly string[] = ['REQUESTED'];

/**
 * Cancel a return the customer raised.
 *
 * `updateStatus` took an id and a status with no ownership check and no state
 * validation, so any caller could cancel any return from any state — including
 * one already REFUNDED, which would have contradicted a completed refund.
 */
export const cancelOwnReturn = async (
  id: string,
  userId: string,
): Promise<{ ok: true; data: ReturnRequest } | { ok: false; reason: 'not_found' | 'invalid_state' }> => {
  const found = await repo.findById(id);
  if (!found || found.userId !== userId) return { ok: false, reason: 'not_found' };

  if (!CUSTOMER_CANCELLABLE.includes(found.status)) {
    return { ok: false, reason: 'invalid_state' };
  }

  return { ok: true, data: await updateStatus(id, 'CANCELLED') };
};

export const updateStatus = async (id: string, status: string): Promise<ReturnRequest> => {
  const ret = await repo.updateStatus(id, status as ReturnStatus, new Date().toISOString());
  // Same error the Map version threw when the id was unknown.
  if (!ret) throw new Error('Not found');

  if (status === 'APPROVED' || status === 'REFUNDED') {
    void publish('payment-events' as never, {
      type: 'refund.initiated',
      data: { orderId: ret.orderId, returnId: id, refundAmount: ret.refundAmount },
    });
  }

  return ret;
};
