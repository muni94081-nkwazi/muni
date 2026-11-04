import prisma from '../config/prisma.js';
import env from '../config/env.js';
import logger from '../config/logger.js';
import { fetchDeliveredPurchases } from '../clients/order.client.js';
import type { PurchaseRecord } from '../generated/prisma/index.js';

// ─── Verified purchase ──────────────────────────────────────────────────────
//
// The rule this service exists to enforce: you may only review something you
// actually bought, and (by default) only after it arrived.
//
// Evidence comes from two places, in order:
//
//   1. The local PurchaseRecord projection, maintained by the order-events
//      consumer. This is the fast path and covers everything ordered since
//      this service was deployed.
//
//   2. A synchronous read of order-service, used only when the projection has
//      nothing. That covers orders placed before the projection existed, and
//      the window between an order being placed and its event being consumed.
//      Anything it finds is backfilled into the projection so the slow path is
//      taken at most once per purchase.
//
// If order-service is unreachable the fallback fails closed — an unverifiable
// purchase is not a verified one. Failing open here would make the whole
// verified badge meaningless during any order-service outage.

export interface PurchaseEvidence {
  eligible: boolean;
  /** Purchases the buyer could attach a review to, newest first. */
  purchases: PurchaseRecord[];
  reason?: string;
}

const REVIEWABLE_STATUSES = () =>
  env.review.requireDelivery ? (['DELIVERED'] as const) : (['ORDERED', 'DELIVERED'] as const);

async function localPurchases(userId: string, productId: string): Promise<PurchaseRecord[]> {
  return prisma.purchaseRecord.findMany({
    where: {
      userId,
      productId,
      status: { in: [...REVIEWABLE_STATUSES()] },
    },
    orderBy: [{ deliveredAt: 'desc' }, { orderedAt: 'desc' }],
  });
}

/**
 * Backfills the projection from order-service. Returns whatever it managed to
 * persist; a failure to reach order-service surfaces as an empty list, and the
 * caller treats that as "not verified" rather than assuming the best.
 */
async function backfillFromOrderService(userId: string, productId: string): Promise<PurchaseRecord[]> {
  let remote;
  try {
    remote = await fetchDeliveredPurchases(userId, productId);
  } catch (err) {
    logger.warn('order-service lookup failed; treating purchase as unverified', {
      userId,
      productId,
      error: (err as Error).message,
    });
    return [];
  }

  if (remote.length === 0) return [];

  await Promise.all(
    remote.map((purchase) =>
      prisma.purchaseRecord.upsert({
        where: {
          userId_productId_orderId: { userId, productId, orderId: purchase.orderId },
        },
        create: {
          userId,
          productId,
          variantId: purchase.variantId ?? null,
          orderId: purchase.orderId,
          subOrderId: purchase.subOrderId ?? null,
          sellerId: purchase.sellerId ?? null,
          status: purchase.delivered ? 'DELIVERED' : 'ORDERED',
          quantity: purchase.quantity ?? 1,
          orderedAt: purchase.orderedAt ? new Date(purchase.orderedAt) : new Date(),
          deliveredAt: purchase.deliveredAt ? new Date(purchase.deliveredAt) : null,
        },
        // The projection is authoritative once it has a row; a backfill must
        // not downgrade a DELIVERED row that the consumer already promoted.
        update: {},
      }),
    ),
  );

  return localPurchases(userId, productId);
}

/**
 * Which purchases (if any) entitle this buyer to review this product, and why
 * not when they don't. The reason strings are user-facing — they are what the
 * buyer sees when the review form refuses them.
 */
export async function getPurchaseEvidence(userId: string, productId: string): Promise<PurchaseEvidence> {
  if (!env.review.requireVerifiedPurchase) {
    const purchases = await localPurchases(userId, productId);
    return { eligible: true, purchases };
  }

  let purchases = await localPurchases(userId, productId);

  if (purchases.length === 0) {
    purchases = await backfillFromOrderService(userId, productId);
  }

  if (purchases.length > 0) return { eligible: true, purchases };

  // Distinguish "never bought it" from "bought it, hasn't arrived" — the
  // second is a wait, not a refusal, and saying so avoids a support ticket.
  if (env.review.requireDelivery) {
    const undelivered = await prisma.purchaseRecord.count({
      where: { userId, productId, status: 'ORDERED' },
    });
    if (undelivered > 0) {
      return {
        eligible: false,
        purchases: [],
        reason: 'You can review this item once your order has been delivered.',
      };
    }
  }

  return {
    eligible: false,
    purchases: [],
    reason: 'Only buyers who purchased this item can review it.',
  };
}

/** True when the buyer has a delivered purchase — drives the "Verified Purchase" badge. */
export async function hasVerifiedPurchase(userId: string, productId: string): Promise<boolean> {
  const count = await prisma.purchaseRecord.count({
    where: { userId, productId, status: 'DELIVERED' },
  });
  if (count > 0) return true;

  const backfilled = await backfillFromOrderService(userId, productId);
  return backfilled.some((p) => p.status === 'DELIVERED');
}

// ─── Projection maintenance (called by the order-events consumer) ────────────

export interface OrderedLine {
  userId: string;
  productId: string;
  variantId?: string | null;
  orderId: string;
  subOrderId?: string | null;
  sellerId?: string | null;
  quantity?: number;
  orderedAt?: string | Date;
}

/** Idempotent: replaying order.created must not duplicate or reset rows. */
export async function recordOrdered(line: OrderedLine): Promise<void> {
  await prisma.purchaseRecord.upsert({
    where: {
      userId_productId_orderId: {
        userId: line.userId,
        productId: line.productId,
        orderId: line.orderId,
      },
    },
    create: {
      userId: line.userId,
      productId: line.productId,
      variantId: line.variantId ?? null,
      orderId: line.orderId,
      subOrderId: line.subOrderId ?? null,
      sellerId: line.sellerId ?? null,
      quantity: line.quantity ?? 1,
      orderedAt: line.orderedAt ? new Date(line.orderedAt) : new Date(),
      status: 'ORDERED',
    },
    // Only fill in identifiers that were unknown at creation. Never move the
    // status backwards: order.created can be redelivered after a delivery has
    // already been recorded.
    update: {
      subOrderId: line.subOrderId ?? undefined,
      sellerId: line.sellerId ?? undefined,
    },
  });
}

/**
 * Promotes an order's lines to DELIVERED. order.delivered identifies a
 * sub-order by (orderId, sellerId) and carries neither userId nor product ids,
 * so the match is made against rows the create event already wrote.
 */
export async function recordDelivered(params: {
  orderId: string;
  subOrderId?: string | null;
  sellerId?: string | null;
  deliveredAt?: string | Date;
}): Promise<number> {
  const deliveredAt = params.deliveredAt ? new Date(params.deliveredAt) : new Date();

  // Prefer the sub-order id when present: a multi-seller order delivers one
  // sub-order at a time, and promoting the whole order would mark items that
  // are still in transit as reviewable.
  const where = params.subOrderId
    ? { orderId: params.orderId, subOrderId: params.subOrderId }
    : params.sellerId
      ? { orderId: params.orderId, sellerId: params.sellerId }
      : { orderId: params.orderId };

  const result = await prisma.purchaseRecord.updateMany({
    where: { ...where, status: 'ORDERED' },
    data: { status: 'DELIVERED', deliveredAt },
  });

  return result.count;
}

export async function recordCancelled(orderId: string, subOrderId?: string | null): Promise<number> {
  const where = subOrderId ? { orderId, subOrderId } : { orderId };
  // A delivered item that is later returned is handled by return-service, not
  // here; only a cancellation before delivery revokes review eligibility.
  const result = await prisma.purchaseRecord.updateMany({
    where: { ...where, status: 'ORDERED' },
    data: { status: 'CANCELLED' },
  });
  return result.count;
}
