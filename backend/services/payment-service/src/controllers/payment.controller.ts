import type { Request, Response } from 'express';
import { paymentGatewayService } from '../services/gateway.service.js';
import { paymentSplitService } from '../services/split.service.js';
import { vendorPayoutService } from '../services/payout.service.js';
import { escrowService, groupHoldsByVendor } from '../services/escrow.service.js';
import { paymentRepository } from '../repositories/payment.repository.js';
import { enqueuePendingPayment } from '../workers/pending-payment.worker.js';
import { logger } from '../utils/logger.js';

export async function initiatePayment(req: Request, res: Response): Promise<void> {
  try {
    const {
      orderId, amount, currency, method, phoneNumber, email, customerName,
      idempotencyKey: bodyIdempotencyKey, sellerId, buyerId, cardToken,
      // Per-vendor split for a multi-vendor basket:
      //   [{ sellerId, subOrderId?, amountUGX }, …]
      // Optional — a single-vendor order can still just send `sellerId`.
      vendorBreakdown,
    } = req.body;

    // The header is the primary source, the body a fallback.
    //
    // checkout-service's saga sends its key as the standard `Idempotency-Key`
    // HTTP header (clients/service.client.ts sets it from CallOptions), and
    // this handler used to read `req.body.idempotencyKey` exclusively — so the
    // key never arrived, `if (idempotencyKey)` was always false, and the dedup
    // below was dead code for every saga-driven charge. A re-driven checkout
    // therefore created a second real payment against the same session.
    //
    // Body-first callers still work: the fallback keeps any direct API client
    // that sends it in the payload behaving exactly as before.
    const headerIdempotencyKey = req.header('idempotency-key') ?? undefined;
    const idempotencyKey = headerIdempotencyKey ?? bodyIdempotencyKey;

    if (!orderId || !amount || !method) {
      res.status(400).json({ success: false, message: 'orderId, amount, and method are required' });
      return;
    }

    // sellerId and buyerId used to fall back to the literals 'seller-001' and
    // 'user-123' when the caller omitted them. That silently attributed real
    // escrow holds to a vendor that does not exist, so the funds could never be
    // released to whoever actually made the sale. Require them instead.
    //
    // `vendorBreakdown` satisfies the seller requirement on its own: it names
    // every vendor explicitly, which is strictly more information than a
    // single sellerId.
    const hasBreakdown = Array.isArray(vendorBreakdown) && vendorBreakdown.length > 0;
    if ((!sellerId && !hasBreakdown) || !buyerId) {
      res.status(400).json({
        success: false,
        message: 'buyerId and either sellerId or a non-empty vendorBreakdown are required',
      });
      return;
    }

    // A retried request must not charge the customer twice. The unique index on
    // idempotency_key is the backstop; this check avoids the provider round-trip.
    if (idempotencyKey) {
      const existing = await paymentRepository.findByIdempotencyKey(idempotencyKey);
      if (existing) {
        res.status(200).json({ success: true, data: existing });
        return;
      }
    }

    const transaction = await paymentGatewayService.initiatePayment({
      orderId,
      amount,
      currency,
      method,
      phoneNumber,
      email,
      customerName,
      idempotencyKey,
      cardToken,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });

    await paymentRepository.create(transaction);

    // MTN/Airtel collections sit at PENDING_USER_PIN_PROMPT until the customer
    // approves/declines on their phone — hand off to the Redis polling worker
    // as a safety net in case the provider webhook never arrives.
    if (transaction.providerStatus === 'PENDING_USER_PIN_PROMPT') {
      await enqueuePendingPayment(transaction.reference);
    }

    // ── Escrow: one hold per vendor in the basket ───────────────────────────
    //
    // `vendorBreakdown` is how a multi-vendor cart says who is owed what. When
    // it is absent the order is single-vendor and `sellerId` carries the whole
    // charge, which is the shape every existing caller already sends.
    //
    // Note the amounts differ by design: a breakdown holds each seller's goods
    // subtotal, so the escrowed total is the value of the goods rather than
    // the gross charge. Shipping and tax are not a vendor's money to be paid
    // out, and holding them against one seller is what the single-hold model
    // got wrong.
    await escrowService.createEscrowHolds({
      orderId,
      buyerId,
      holds: Array.isArray(vendorBreakdown) && vendorBreakdown.length > 0
        ? groupHoldsByVendor(vendorBreakdown)
        : [{ vendorId: sellerId, amountUGX: transaction.amountUGX ?? amount }],
    });

    res.status(201).json({ success: true, data: transaction });
  } catch (err) {
    const status = (err as { status?: number }).status ?? 500;
    res.status(status).json({ success: false, message: (err as Error).message });
  }
}

export async function getPaymentStatus(req: Request, res: Response): Promise<void> {
  const payment = await paymentRepository.findByReference(req.params.reference as string);
  if (!payment) {
    res.status(404).json({ success: false, message: 'Payment not found' });
    return;
  }

  // This endpoint used to settle a payment as a side effect: polling it twice
  // flipped a pending non-mobile-money transaction to 'completed' and ran the
  // vendor split. That is a read endpoint marking money as received on the
  // strength of nothing but being called, and it is reachable in production.
  //
  // It is kept only as an explicitly opted-in local development affordance so
  // the checkout flow can be exercised without a provider sandbox. Real
  // settlement comes from the provider webhook or the pending-payment worker.
  if (process.env.PAYMENT_SIMULATE_SETTLEMENT === 'true' && payment.status === 'pending') {
    const isLiveMobileMoneyCollection = payment.method === 'mtn_momo' || payment.method === 'airtel';
    if (!isLiveMobileMoneyCollection) {
      // Deliberately no processPaymentSplit here. The split needs real
      // sub-order and seller ids; the previous code invented them with a
      // hardcoded 'seller-001', which credited a fictional vendor's balance.
      const settled = await paymentRepository.markCompleted(payment.reference, new Date().toISOString());
      if (settled) {
        res.json({ success: true, data: settled });
        return;
      }
    }
  }

  res.json({ success: true, data: payment });
}

/**
 * Take back whatever this order credited its sellers.
 *
 * A refund used to hand the buyer their money back and leave the vendor
 * ledger untouched, so a refunded order still paid the seller — out of the
 * platform's pocket. Runs after the refund has already succeeded and never
 * throws: a bookkeeping failure must not turn a completed refund into an
 * error response, so it is logged for reconciliation instead.
 */
async function reverseVendorSettlement(orderId: string, reference: string): Promise<void> {
  try {
    const { reversed, amount } = await paymentSplitService.reverseSettlement(orderId);
    if (reversed > 0) {
      logger.info('[payment] refund reversed vendor settlement', {
        detail: { reference, orderId, entries: reversed, amount },
      });
    }
  } catch (err) {
    logger.error('[payment] refund succeeded but vendor settlement could not be reversed', {
      detail: { reference, orderId, error: (err as Error).message },
    });
  }
}

/**
 * POST /payments/:reference/sub-orders — internal, from the checkout saga.
 *
 * Escrow and the ledger are written when the payment clears, which happens
 * before order-service has created anything, so the ledger row is keyed on a
 * synthetic id derived from the checkout session. This is where it adopts the
 * real sub-order ids, and with them order-service's authoritative vendorShare
 * and platformCommission — so the two services stop computing one seller's
 * payout independently.
 *
 * Without this call the delivery event can never find the ledger row, and the
 * seller's money stays in pendingBalance for good.
 */
export async function linkSubOrders(req: Request, res: Response): Promise<void> {
  const payment = await paymentRepository.findByReference(req.params.reference as string);
  if (!payment) {
    res.status(404).json({ success: false, message: 'Payment not found' });
    return;
  }

  try {
    const { orderId, subOrders } = req.body;
    const result = await paymentSplitService.linkSubOrders({
      paymentOrderId: payment.orderId,
      orderId,
      subOrders,
    });
    res.json({ success: true, data: result });
  } catch (err) {
    res.status(500).json({ success: false, message: (err as Error).message });
  }
}

export async function refundPayment(req: Request, res: Response): Promise<void> {
  const payment = await paymentRepository.findByReference(req.params.reference as string);
  if (!payment) {
    res.status(404).json({ success: false, message: 'Payment not found' });
    return;
  }

  // Capped at what was actually collected. A caller naming a larger figure
  // would otherwise refund money this payment never took.
  const requested = Number(req.body.amount ?? payment.amount);
  const amount = Math.min(Number.isFinite(requested) ? requested : payment.amount, payment.amount);
  const reason = req.body.reason || 'Customer request';

  // Visa/Mastercard is the only method with a real refund API wired up.
  //
  // Every other method used to fall through to a block that marked the payment
  // `refunded`, reversed the vendor settlement, and answered 200 with a
  // refundId built from `Math.random()`. No provider was called and no money
  // moved. The customer's record said refunded, the seller had been debited,
  // and the id in the response referred to nothing — there is no refund
  // anywhere to reconcile it against.
  //
  // For COD there was never a payment API to refund through at all: the money
  // was cash handed to a rider, and it comes back the same way.
  if (payment.method === 'visa_card') {
    try {
      const result = await paymentGatewayService.refundCardPayment(payment, amount, reason);
      await paymentRepository.update(payment.reference, { status: 'refunded' });
      await reverseVendorSettlement(payment.orderId, payment.reference);
      res.json({
        success: true,
        data: { reference: payment.reference, refundId: result.refundId, status: 'refunded', amount, reason },
      });
    } catch (err) {
      const status = (err as { status?: number }).status ?? 500;
      res.status(status).json({ success: false, message: (err as Error).message });
    }
    return;
  }

  // The commercial decision stands, so the seller's settlement is reversed:
  // MUNI is going to be out of pocket for this order either way, and leaving
  // the vendor credited would mean paying them for goods being refunded.
  //
  // What does NOT happen is marking the payment `refunded`. Nothing has
  // returned the customer's money, so the payment stays as it is until a human
  // makes the transfer and records it. 202, not 200: accepted for settlement,
  // not settled.
  await reverseVendorSettlement(payment.orderId, payment.reference);

  logger.warn('[payment] refund requires manual settlement — no provider API for this method', {
    reference: payment.reference,
    orderId:   payment.orderId,
    method:    payment.method,
    amount,
    reason,
  });

  res.status(202).json({
    success: true,
    data: {
      reference: req.params.reference as string,
      // No fabricated id. There is no refund at a provider to point one at.
      refundId:  null,
      status:    'refund_pending_manual',
      message:   `No automated refund exists for ${payment.method}. The seller settlement has been reversed and the customer must be refunded out of band.`,
      amount,
      reason,
    },
  });
}

// ─── Escrow Fund Holding Handlers (Phase 16 Feature 4) ─────────────────────────

/**
 * GET /api/v1/payments/escrow/:orderId
 *
 * Returns every hold on the order. `data` is an array now rather than a single
 * object — a multi-vendor order genuinely has several holds, and the old shape
 * could only ever show one of them.
 */
export async function getEscrowStatus(req: Request, res: Response): Promise<void> {
  const orderId = req.params.orderId as string;
  try {
    const holds = await escrowService.getEscrowHolds(orderId);
    if (holds.length === 0) {
      res.status(404).json({ success: false, message: 'Escrow hold entry not found' });
      return;
    }

    res.json({
      success: true,
      data: holds,
      meta: {
        orderId,
        vendorCount: holds.length,
        totalAmountUGX: Math.round(holds.reduce((sum, h) => sum + h.amountUGX, 0) * 100) / 100,
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: (err as Error).message });
  }
}

export async function releaseEscrow(req: Request, res: Response): Promise<void> {
  // `vendorId` scopes the release to one seller. A buyer confirming receipt
  // from one seller in a multi-vendor basket used to pay every seller on the
  // order, delivered or not — see releaseEscrow in escrow.service.ts.
  const { orderId, vendorId, subOrderId } = req.body;
  if (!orderId) {
    res.status(400).json({ success: false, message: 'orderId is required' });
    return;
  }

  try {
    const holds = await escrowService.releaseEscrow(orderId, 'buyer', { vendorId, subOrderId });
    const released = holds.filter((h) => h.status === 'released_to_vendor');

    res.json({
      success: true,
      data: holds,
      message: released.length === 0
        ? 'No escrow funds were eligible for release'
        : `Escrow funds released to ${released.length} vendor(s)`,
    });
  } catch (err) {
    res.status(400).json({ success: false, message: (err as Error).message });
  }
}

/**
 * Return a buyer's escrowed funds after a dispute goes their way.
 *
 * `vendorId` scopes it to one seller, exactly as release does — without it a
 * dispute with one seller would claw back every seller's hold on the order.
 */
export async function refundEscrow(req: Request, res: Response): Promise<void> {
  const { orderId, vendorId, subOrderId, disputeId } = req.body;
  if (!orderId) {
    res.status(400).json({ success: false, message: 'orderId is required' });
    return;
  }

  try {
    const holds = await escrowService.refundEscrow(orderId, 'dispute', { vendorId, subOrderId, disputeId });
    const refunded = holds.filter((h) => h.status === 'refunded_to_buyer');

    res.json({
      success: true,
      data: holds,
      message: refunded.length === 0
        ? 'No escrow funds were eligible for refund'
        : `Escrow funds returned to the buyer for ${refunded.length} vendor(s)`,
    });
  } catch (err) {
    res.status(400).json({ success: false, message: (err as Error).message });
  }
}

export async function holdEscrowForDispute(req: Request, res: Response): Promise<void> {
  // `vendorId` is optional and narrows the freeze to one seller — a dispute is
  // usually with one vendor in a basket, and freezing everyone else's money
  // over it would punish sellers who did nothing wrong.
  const { orderId, disputeId, vendorId } = req.body;
  if (!orderId || !disputeId) {
    res.status(400).json({ success: false, message: 'orderId and disputeId are required' });
    return;
  }

  try {
    const frozen = await escrowService.freezeEscrowForDispute(orderId, disputeId, vendorId);
    res.json({
      success: true,
      data: frozen,
      message: frozen.length === 0
        ? 'No escrow funds were eligible to freeze'
        : `Escrow funds frozen for ${frozen.length} vendor(s) due to active dispute`,
    });
  } catch (err) {
    res.status(500).json({ success: false, message: (err as Error).message });
  }
}

export async function getEscrowReconciliation(_req: Request, res: Response): Promise<void> {
  try {
    const reconciliation = await escrowService.reconcileEscrowLedger();
    res.json({ success: true, data: reconciliation });
  } catch (err) {
    res.status(500).json({ success: false, message: (err as Error).message });
  }
}

// ─── Vendor Balance & Payout Endpoints ────────────────────────────────────────

// The vendor id is whatever the gateway stamped from the verified JWT. The
// previous `|| req.query.vendorId || 'seller-001'` fallbacks let any caller
// read another seller's balance by passing a query param, and served a
// hardcoded seller's ledger to unauthenticated callers.
function vendorIdOf(req: Request, res: Response): string | null {
  const vendorId = res.locals.userId as string | undefined;
  if (!vendorId) {
    res.status(401).json({ success: false, message: 'Authentication required' });
    return null;
  }
  return vendorId;
}

export async function getVendorBalance(req: Request, res: Response): Promise<void> {
  const vendorId = vendorIdOf(req, res);
  if (!vendorId) return;

  const balance = await paymentSplitService.getVendorBalance(vendorId);
  res.json({ success: true, data: balance });
}

export async function getVendorLedger(req: Request, res: Response): Promise<void> {
  const vendorId = vendorIdOf(req, res);
  if (!vendorId) return;

  const page = Math.max(1, parseInt((req.query.page as string) ?? '1', 10) || 1);
  const perPage = Math.min(100, Math.max(1, parseInt((req.query.per_page as string) ?? '20', 10) || 20));

  const { data, total } = await paymentSplitService.getVendorLedger(vendorId, { page, perPage });
  res.json({ data, meta: { total, page, perPage } });
}

export async function requestVendorPayout(req: Request, res: Response): Promise<void> {
  const vendorId = (res.locals.userId as string) || req.body.vendorId;
  if (!vendorId) {
    res.status(401).json({ success: false, message: 'Authentication / Vendor ID required' });
    return;
  }

  const { amount, method, destinationAccount } = req.body;
  if (!amount || !method || !destinationAccount || !destinationAccount.accountNumber) {
    res.status(400).json({ success: false, message: 'amount, method, and destinationAccount are required' });
    return;
  }

  try {
    const payout = await vendorPayoutService.requestPayout({
      vendorId,
      amount: Number(amount),
      method,
      destinationAccount,
      requestedBy: 'seller',
    });

    res.status(201).json({ success: true, data: payout });
  } catch (err) {
    const status = (err as { status?: number }).status || 500;
    res.status(status).json({ success: false, message: (err as Error).message });
  }
}

export async function listVendorPayouts(req: Request, res: Response): Promise<void> {
  const vendorId = vendorIdOf(req, res);
  if (!vendorId) return;

  const payouts = await vendorPayoutService.getPayoutsByVendor(vendorId);
  res.json({ success: true, data: payouts });
}

export async function triggerWeeklyPayouts(_req: Request, res: Response): Promise<void> {
  try {
    const result = await vendorPayoutService.processWeeklyPayouts();
    res.json({ success: true, data: result });
  } catch (err) {
    res.status(500).json({ success: false, message: (err as Error).message });
  }
}

export async function listPlatformCommissions(req: Request, res: Response): Promise<void> {
  const page = Math.max(1, parseInt((req.query.page as string) ?? '1', 10) || 1);
  const perPage = Math.min(100, Math.max(1, parseInt((req.query.per_page as string) ?? '20', 10) || 20));

  // totalCommission is summed in the database over every entry, not over the
  // current page — a page-local sum would shrink as the admin paged forward.
  const { data, total, totalCommission } = await paymentSplitService.getPlatformCommissions({ page, perPage });
  res.json({ data, meta: { total, page, perPage, totalCommission } });
}

/**
 * GET /api/v1/payments?orderId=…
 *
 * Look a payment up by the order it was raised for, and return it with its
 * `reference`.
 *
 * That reference is the only key that identifies a payment to a provider
 * webhook (`findByReference(externalId)`), and until this route existed there
 * was no way to obtain it: the checkout session exposes `paymentIntentId` —
 * the `paymentId` column, a different value — and order-service writes
 * `paymentReference: null` when it creates the order. Confirming or
 * reconciling a payment meant reading the database.
 *
 * Note which id this takes. checkout-service charges with
 * `orderId: session.id`, so a saga-created payment is stored against the
 * CHECKOUT SESSION id, not the order id. Both are accepted — the session id is
 * what actually matches today, and the order id is what a caller naturally
 * reaches for — so the lookup tries the given value as-is and the caller does
 * not have to know which one the saga happened to use.
 */
export async function findPaymentsByOrder(req: Request, res: Response): Promise<void> {
  const orderId = String(req.query.orderId ?? '').trim();

  if (!orderId) {
    res.status(400).json({ success: false, message: 'orderId query parameter is required' });
    return;
  }

  const payments = await paymentRepository.findByOrderId(orderId);

  if (payments.length === 0) {
    res.status(404).json({ success: false, message: 'No payment found for that order' });
    return;
  }

  // Newest first — findByOrderId orders by createdAt desc — so a retried
  // checkout surfaces the live payment rather than an abandoned first attempt.
  res.json({ success: true, data: payments });
}
