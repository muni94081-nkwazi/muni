import { randomUUID } from 'node:crypto';
import { publish } from '../../../../shared/kafka/producer.js';
import { Topics } from '../../../../shared/kafka/topics.js';
import { publishEvent, ROUTING_KEYS } from '../../../../shared/rabbitmq/index.js';
import { logger } from '../utils/logger.js';
import { paymentSplitService } from './split.service.js';
import { escrowService } from './escrow.service.js';
import { paymentRepository } from '../repositories/payment.repository.js';
import type { PaymentTransaction } from '../models/payment.model.js';

// ─── Shared Payment Outcome Resolution ─────────────────────────────────────────
//
// A payment can be resolved as successful/failed from two independent
// triggers: an inbound provider webhook, or the Redis pending-payment worker
// polling status directly. Both paths converge here so the state transition,
// vendor-split accounting, and Kafka event publication only live in one
// place.
//
// Event envelope/topic match the shape analytics-service's Kafka consumer
// (`analytics-service/src/consumers/payment.consumer.ts`) already expects:
// `{ eventType: 'payment.succeeded' | 'payment.failed', data: {...} }` on the
// `payment-events` topic — this is the platform's actual canonical naming
// (see `infrastructure/kafka/topics.ts` EVENTS.PAYMENT_SUCCEEDED /
// PAYMENT_FAILED), one word off from "payment.successful" as literally
// written in the upgrade spec.

/**
 * Work out who to credit for a settled payment.
 *
 * This used to be the literal `[{ subOrderId: 'sub_<orderId>_A', sellerId:
 * 'seller-001', subtotal: <full amount> }]` — every payment on the platform
 * credited the same fictional vendor. The escrow hold created at initiate time
 * is the authoritative record of which vendor the buyer's funds are being held
 * for, so it is the right source.
 *
 * Returns an empty list if no hold exists, which skips the split rather than
 * inventing a payee. The payment itself still settles; the gap surfaces in the
 * escrow reconciliation report instead of as a silent misattribution.
 */
async function resolveSubOrders(
  payment: PaymentTransaction,
): Promise<Array<{ subOrderId: string; sellerId: string; subtotal: number }>> {
  const holds = await escrowService.getEscrowHolds(payment.orderId);
  if (holds.length === 0) {
    logger.error('[payment-resolution] No escrow hold for settled payment — vendor split skipped', {
      reference: payment.reference,
      orderId: payment.orderId,
    });
    return [];
  }

  // One entry per vendor, each credited its own hold amount.
  //
  // This previously took the first (and only possible) hold and credited it
  // `payment.amount` — the entire basket. On a multi-vendor order that paid
  // one seller for everyone else's goods and left the others with nothing.
  // The hold amounts are the authoritative per-vendor figures, so they are
  // what the split uses.
  return holds.map((hold) => ({
    // The sub-order is often unknown at payment time (escrow is created before
    // the order exists in the checkout saga), so fall back to a stable
    // per-vendor key. It has to be stable: split.service upserts the ledger on
    // `@@unique([subOrderId, vendorId])`, and a key that changed between
    // retries would credit a vendor twice.
    subOrderId: hold.subOrderId ?? `sub_${payment.orderId}_${hold.vendorId}`,
    sellerId: hold.vendorId,
    subtotal: hold.amountUGX,
  }));
}

export async function markPaymentSuccessful(
  payment: PaymentTransaction,
  providerTransactionId?: string,
): Promise<void> {
  const now = new Date().toISOString();

  // Conditional transition: markCompleted only updates a payment still in
  // pending/processing, so if the webhook and the polling worker both resolve
  // the same collection, exactly one of them proceeds past this point. Without
  // it, both would run processPaymentSplit and credit the vendor twice.
  const settled = await paymentRepository.markCompleted(payment.reference, now);
  if (!settled) {
    logger.info('[payment-resolution] Payment already resolved by another path — skipping', {
      reference: payment.reference,
    });
    return;
  }

  await paymentRepository.update(payment.reference, {
    providerStatus: 'SUCCESSFUL',
    providerTransactionId: providerTransactionId ?? payment.providerTransactionId ?? null,
  });

  // Keep the caller's in-memory copy consistent with what was just persisted.
  payment.status = 'completed';
  payment.providerStatus = 'SUCCESSFUL';
  payment.providerTransactionId = providerTransactionId ?? payment.providerTransactionId ?? null;
  payment.paidAt = now;
  payment.updatedAt = now;

  try {
    await paymentSplitService.processPaymentSplit({
      transactionId: payment.paymentId,
      orderId: payment.orderId,
      subOrders: await resolveSubOrders(payment),
    });
  } catch (err) {
    // Vendor-split accounting failing must not roll back a confirmed payment —
    // log loudly for reconciliation instead of losing the payment confirmation.
    logger.error('[payment-resolution] processPaymentSplit failed after payment success', {
      reference: payment.reference,
      error: (err as Error).message,
    });
  }

  await publish(
    Topics.PAYMENT_EVENTS,
    {
      eventId: randomUUID(),
      eventType: 'payment.succeeded',
      service: 'payment-service',
      occurredAt: now,
      data: {
        paymentId: payment.paymentId,
        orderId: payment.orderId,
        reference: payment.reference,
        method: payment.method,
        provider: payment.provider ?? null,
        providerTransactionId: payment.providerTransactionId ?? null,
        amount: payment.amount,
        currency: payment.currency,
        amountUGX: payment.amountUGX ?? payment.amount,
        exchangeRate: payment.exchangeRate ?? 1,
        paidAt: now,
      },
    },
    payment.orderId,
  );

  void publishEvent(
    ROUTING_KEYS.PAYMENT_COMPLETED,
    {
      paymentId:             payment.paymentId,
      orderId:               payment.orderId,
      amount:                payment.amount,
      currency:              payment.currency,
      provider:              payment.provider ?? null,
      providerTransactionId: payment.providerTransactionId ?? null,
      paidAt:                now,
    },
    { correlationId: payment.orderId, service: 'payment-service' },
  );

  logger.info('[payment-resolution] Payment marked successful', {
    reference: payment.reference,
    provider: payment.provider,
  });
}

export async function markPaymentFailed(payment: PaymentTransaction, reason: string): Promise<void> {
  const now = new Date().toISOString();

  // Conditional, exactly as markPaymentSuccessful is. This used to be an
  // unconditional write, so a settled payment could be marked failed after the
  // fact — by the polling worker running out of attempts, by a provider poll
  // that raced a successful webhook, or by a late duplicate failure callback.
  // The vendor had already been credited and the order already confirmed, so
  // what it produced was a payment row reading "failed" against money that had
  // genuinely moved.
  const failed = await paymentRepository.markFailed(payment.reference, reason);
  if (!failed) {
    logger.info('[payment-resolution] Payment already resolved — not overwriting with failure', {
      reference: payment.reference,
      attemptedReason: reason,
    });
    return;
  }

  payment.status = 'failed';
  payment.providerStatus = 'FAILED';
  payment.failureReason = reason;
  payment.updatedAt = now;

  await publish(
    Topics.PAYMENT_EVENTS,
    {
      eventId: randomUUID(),
      eventType: 'payment.failed',
      service: 'payment-service',
      occurredAt: now,
      data: {
        paymentId: payment.paymentId,
        orderId: payment.orderId,
        reference: payment.reference,
        method: payment.method,
        provider: payment.provider ?? null,
        amount: payment.amount,
        currency: payment.currency,
        reason,
        failedAt: now,
      },
    },
    payment.orderId,
  );

  logger.warn('[payment-resolution] Payment marked failed', { reference: payment.reference, reason });
}
