import { logger } from '../utils/logger.js';
import { publishEvent, ROUTING_KEYS } from '../../../../shared/rabbitmq/index.js';
import { orderRepository } from '../repositories/order.repository.js';
import type { IOrderRepository } from '../repositories/order.repository.js';
import type { Order } from '../models/order.model.js';
import {
  deductStock,
  refundPayment,
  StockSettlementError,
} from '../clients/catalog.client.js';

// ─── Settling a paid order's inventory ────────────────────────────────────────
//
// Orders created through the checkout saga are settled by the saga itself: it
// reserves, charges, creates the order, then deducts. Orders created through
// `POST /orders` had no such step. They reserved stock and stopped there, so
// the hold expired on its TTL and the stock silently returned to the shelf
// after the customer had paid for it — a slow, invisible drift between the
// ledger and the warehouse.
//
// This closes that gap. It runs when payment is confirmed, which is the first
// moment the goods are genuinely sold.
//
// Saga-path orders are skipped, not re-deducted. Both paths raise
// `payment.completed`, and deducting twice would take the stock off the shelf a
// second time. The distinguishing mark is the order's own `settlement` state,
// set at creation.

export interface SettlementOutcome {
  orderId: string;
  status: 'settled' | 'skipped' | 'failed';
  reason?: string;
  /** Lines that were successfully deducted before any failure. */
  deducted: Array<{ variantId: string; quantity: number }>;
  refunded: boolean;
}

/** Orders whose stock the checkout saga already settled. */
function wasSettledBySaga(order: Order): boolean {
  // The saga passes its own reservation ids through to order creation and
  // deducts them itself in its final step. A direct-path order's holds were
  // taken by order-service and belong to it.
  return order.settlementPath === 'saga';
}

function isPaid(order: Order): boolean {
  return order.status === 'paid' || order.status === 'payment_confirmed';
}

/**
 * Deduct the stock a paid order is holding.
 *
 * On failure — an expired reservation, or stock that moved underneath us —
 * the money is handed back, the order is marked failed, and `order.failed` is
 * emitted. Leaving a paid order un-fulfillable and silent is the one outcome
 * that is never acceptable here.
 */
export async function settlePaidOrder(
  orderId: string,
  paymentReference?: string,
  repo: IOrderRepository = orderRepository,
): Promise<SettlementOutcome> {
  const order = await repo.findById(orderId);

  if (!order) {
    return { orderId, status: 'skipped', reason: 'order_not_found', deducted: [], refunded: false };
  }

  if (wasSettledBySaga(order)) {
    return { orderId, status: 'skipped', reason: 'settled_by_saga', deducted: [], refunded: false };
  }

  if (order.inventorySettledAt) {
    // Already done. `payment.completed` can arrive more than once — a provider
    // webhook and the polling worker both resolve the same collection — and
    // deducting twice would take the stock off the shelf a second time.
    return { orderId, status: 'skipped', reason: 'already_settled', deducted: [], refunded: false };
  }

  const deducted: Array<{ variantId: string; quantity: number }> = [];

  try {
    for (const item of order.items) {
      if (!item.variantId) {
        // Nothing addressable to deduct against. Stock lives on the variant
        // row, so a line without one cannot be settled — surface it rather
        // than pretend the order is fully accounted for.
        throw new StockSettlementError(item.productId, 'line has no variantId');
      }

      await deductStock(item.variantId, item.quantity, item.reservationId, order.userId);
      deducted.push({ variantId: item.variantId, quantity: item.quantity });
    }
  } catch (err) {
    const detail = (err as Error).message;
    const refunded = await compensate(order, paymentReference, detail, repo);

    return { orderId, status: 'failed', reason: detail, deducted, refunded };
  }

  order.inventorySettledAt = new Date().toISOString();
  order.updatedAt = order.inventorySettledAt;
  await repo.replace(order);

  return { orderId, status: 'settled', deducted, refunded: false };
}

/**
 * Unwind a paid order that cannot be fulfilled.
 *
 * Order of operations matters: refund first, then mark the order, then
 * announce it. If the refund fails we still mark and announce — a customer
 * charged for goods they will not receive must never be invisible, and the
 * event is what reaches support and notifications.
 */
async function compensate(
  order: Order,
  paymentReference: string | undefined,
  detail: string,
  repo: IOrderRepository,
): Promise<boolean> {
  let refunded = false;

  if (paymentReference) {
    try {
      await refundPayment(paymentReference, 'inventory_settlement_failed', order.userId);
      refunded = true;
    } catch (refundErr) {
      logger.error(
        '[order-service] refund failed for an unfulfillable paid order — needs manual intervention:',
        { orderId: order.id, paymentReference, error: (refundErr as Error).message },
      );
    }
  } else {
    logger.error(
      '[order-service] no payment reference for an unfulfillable paid order — cannot auto-refund:',
      { orderId: order.id },
    );
  }

  try {
    order.status             = refunded ? 'refunded' : 'payment_failed';
    order.statusLabel        = refunded ? 'Refunded' : 'Payment Failed';
    order.cancellationReason = `Could not be fulfilled: ${detail}`;
    order.updatedAt          = new Date().toISOString();
    await repo.replace(order);
  } catch (statusErr) {
    logger.error('could not mark order failed', { detail: {
      orderId: order.id,
      error: (statusErr as Error).message,
    } });
  }

  void publishEvent(
    ROUTING_KEYS.ORDER_FAILED,
    {
      orderId:  order.id,
      userId:   order.userId,
      reason:   'inventory_settlement_failed',
      detail,
      refunded,
      failedAt: new Date().toISOString(),
    },
    { correlationId: order.id, service: 'order-service' },
  );

  return refunded;
}
