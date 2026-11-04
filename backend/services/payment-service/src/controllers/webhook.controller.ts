import type { Request, Response } from 'express';
import { paymentGatewayService } from '../services/gateway.service.js';
import { paymentRepository, webhookIdempotencyRepository } from '../repositories/payment.repository.js';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';
import { verifyHmacSignature } from '../security/webhook-signature.js';
import { verifyRsaSignature } from '../security/card-webhook-signature.js';
import { markPaymentSuccessful, markPaymentFailed } from '../services/payment-resolution.service.js';
import { dequeuePendingPayment } from '../workers/pending-payment.worker.js';
import { visaCardPaymentDriver } from '../drivers/visa-card.driver.js';

// Webhook idempotency is durable and cross-replica: webhookIdempotencyRepository
// .claim() INSERTs into processed_webhooks, whose primary key is the event id,
// and treats the P2002 unique collision as "someone else already has it". Two
// concurrent deliveries of the same event therefore cannot both proceed, on one
// replica or twenty.
//
// Deliberately Postgres rather than Redis: a lost claim here means a settlement
// processed twice and a vendor credited twice, so the claim must be as durable
// as the payment it guards. A Redis SET NX can vanish to eviction or a failover
// that drops un-replicated writes; the row cannot.

/**
 * Raw request body captured by the `verify` callback passed to
 * `express.json()` in app.ts. Read via a small typed accessor rather than an
 * ambient `Request` interface augmentation — this monorepo's services pin
 * different `@types/express` major versions, which makes global module
 * augmentation unreliable across workspaces.
 */
function getRawBody(req: Request): Buffer | undefined {
  return (req as unknown as { rawBody?: Buffer }).rawBody;
}

export async function handleFlutterwaveWebhook(req: Request, res: Response): Promise<void> {
  try {
    const signature = req.headers['verif-hash'] as string | undefined;

    // 1. Signature Verification
    if (!paymentGatewayService.verifyFlutterwaveSignature(signature)) {
      res.status(401).json({ success: false, message: 'Invalid webhook signature' });
      return;
    }

    const payload = req.body;
    const eventId = payload.event === 'charge.completed' ? `${payload.data?.id}_${payload.data?.tx_ref}` : payload.id;

    // 2. Idempotency Check
    if (eventId && !(await webhookIdempotencyRepository.claim(eventId))) {
      res.status(200).json({ success: true, message: 'Webhook event already processed (idempotent)' });
      return;
    }

    if (payload.event === 'charge.completed' && payload.data?.status === 'successful') {
      const reference = payload.data.tx_ref;
      const payment = await paymentRepository.findByReference(reference);

      if (!payment) {
        // 200, not 404 — an unknown reference is not a reason for Flutterwave
        // to keep retrying. Matches the MTN/Airtel handlers below.
        logger.warn('[webhook] Flutterwave webhook for unknown payment reference', { reference });
        res.status(200).json({ success: true, message: 'Unknown payment reference — ignored' });
        return;
      }

      // Settlement now goes through the same resolution path as MTN, Airtel
      // and card: markPaymentSuccessful performs the conditional state
      // transition, derives the payee from the escrow hold, and publishes
      // payment.succeeded.
      //
      // What this replaces: a hand-rolled split that fell back to
      // `[{ sellerId: 'seller-001', subtotal: <full amount> }]` whenever
      // `meta.subOrders` was absent from the callback — crediting a
      // fabricated vendor with the entire payment. resolveSubOrders() returns
      // an empty list instead when no hold exists, which skips the split and
      // surfaces the gap in escrow reconciliation rather than misattributing
      // real money.
      await markPaymentSuccessful(
        payment,
        payload.data?.id != null ? String(payload.data.id) : undefined,
      );
    }

    res.status(200).json({ success: true, message: 'Webhook processed successfully' });
  } catch (err) {
    logger.error('[webhook] Flutterwave webhook handler threw', { error: (err as Error).message });
    res.status(500).json({ success: false, message: 'Internal error processing Flutterwave webhook' });
  }
}

export async function handlePesapalWebhook(req: Request, res: Response): Promise<void> {
  try {
    const signature = req.headers['x-pesapal-signature'] as string | undefined;
    const rawBody = JSON.stringify(req.body);

    if (!paymentGatewayService.verifyPesapalSignature(rawBody, signature)) {
      res.status(401).json({ success: false, message: 'Invalid Pesapal webhook signature' });
      return;
    }

    const { OrderTrackingId, OrderNotificationType } = req.body;

    if (OrderTrackingId && !(await webhookIdempotencyRepository.claim(OrderTrackingId))) {
      res.status(200).json({ success: true, message: 'Pesapal webhook already processed' });
      return;
    }

    const payment = await paymentRepository.findByReference(OrderTrackingId);

    if (!payment) {
      logger.warn('[webhook] Pesapal webhook for unknown payment reference', {
        reference: OrderTrackingId,
      });
      res.status(200).json({ success: true, message: 'Unknown payment reference — ignored' });
      return;
    }

    if (OrderNotificationType === 'IPN') {
      // As with Flutterwave above, settlement now runs through the shared
      // resolution path. The previous code credited
      // `sellerId: 'seller-001'` unconditionally — Pesapal's IPN carries no
      // sub-order breakdown at all, so there was not even a payload field
      // that could have supplied the real payee. Every Pesapal payment on the
      // platform was attributed to the same fictional vendor.
      await markPaymentSuccessful(payment);
    }

    res.status(200).json({ success: true, message: 'Pesapal webhook processed' });
  } catch (err) {
    logger.error('[webhook] Pesapal webhook handler threw', { error: (err as Error).message });
    res.status(500).json({ success: false, message: 'Internal error processing Pesapal webhook' });
  }
}

// ─── MTN Mobile Money — Collections Callback ───────────────────────────────────
//
// Resolves payments initiated through the real MTN driver (gateway.service.ts
// → drivers/mtn-momo.driver.ts). This is the primary, signature-verified
// replacement for the old unauthenticated `/webhooks/momo` endpoint — both
// routes point here now (see app.ts) so an already-configured MTN callback
// URL keeps working without losing the new signature check.
//
// Expected payload (merchant-side webhook proxy in front of MTN's callback,
// signed with a shared HMAC secret — MTN's raw callback does not itself
// carry a signature header):
//   { externalId, referenceId, status: 'SUCCESSFUL'|'FAILED', financialTransactionId?, reason? }
export async function handleMtnMomoWebhook(req: Request, res: Response): Promise<void> {
  try {
    const signatureHeader = req.headers['x-signature'] ?? req.headers['x-callback-signature'];
    const signature = Array.isArray(signatureHeader) ? signatureHeader[0] : signatureHeader;

    // Fails CLOSED. This was previously guarded by
    // `env.mtn.webhookHmacSecret && !verify(...)`, which short-circuits to
    // false whenever the secret is unset — so an unconfigured deployment
    // skipped verification entirely and processed the webhook as trusted.
    // Since the secret has no default and docker-compose did not set it, that
    // was the state every stack shipped in: anyone who guessed a payment
    // reference could POST `{externalId, status:'SUCCESSFUL'}` and settle it.
    //
    // verifyHmacSignature returns false — never throws — for a missing secret,
    // a missing signature header or a missing raw body, so all three now
    // reject rather than pass. Matches handleVisaCardWebhook below and the
    // Flutterwave/Pesapal verifiers, which already failed closed.
    if (!verifyHmacSignature(getRawBody(req), signature, env.mtn.webhookHmacSecret)) {
      logger.warn('[webhook] Rejected MTN MoMo webhook — invalid or unverifiable HMAC signature', {
        // Distinguishes "operator has not configured the secret" from "someone
        // sent us a bad signature"; both reject, but only one is a deploy bug.
        secretConfigured: Boolean(env.mtn.webhookHmacSecret),
        signaturePresent: Boolean(signature),
      });
      res.status(401).json({ success: false, message: 'Invalid MTN MoMo webhook signature' });
      return;
    }

    const payload = req.body as {
      externalId?: string;
      referenceId?: string;
      status?: string;
      financialTransactionId?: string;
      reason?: { code?: string; message?: string } | string;
    };

    const externalId = payload.externalId;
    if (!externalId || !payload.status) {
      res.status(400).json({ success: false, message: 'Missing externalId or status in MTN MoMo webhook payload' });
      return;
    }

    const eventId = `mtn:${payload.referenceId ?? externalId}:${payload.status}`;
    if (!(await webhookIdempotencyRepository.claim(eventId))) {
      res.status(200).json({ success: true, message: 'MTN MoMo webhook already processed (idempotent)' });
      return;
    }

    const payment = await paymentRepository.findByReference(externalId);
    if (!payment) {
      // 200, not 404 — an unknown reference is not a reason for MTN to keep retrying.
      logger.warn('[webhook] MTN MoMo webhook for unknown payment reference', { externalId });
      res.status(200).json({ success: true, message: 'Unknown payment reference — ignored' });
      return;
    }

    if (payment.providerStatus !== 'PENDING_USER_PIN_PROMPT') {
      // Already resolved (e.g. the polling worker got there first) — ack idempotently.
      res.status(200).json({ success: true, message: 'Payment already resolved' });
      return;
    }

    if (payload.status === 'SUCCESSFUL') {
      await markPaymentSuccessful(payment, payload.financialTransactionId);
    } else if (payload.status === 'FAILED') {
      const reason = typeof payload.reason === 'string' ? payload.reason : payload.reason?.message ?? payload.reason?.code;
      await markPaymentFailed(payment, reason ?? 'MTN MoMo declined the payment');
    } else {
      // Unrecognised intermediate status — leave pending, let the worker keep polling.
      res.status(200).json({ success: true, message: 'MTN MoMo webhook acknowledged (no terminal status yet)' });
      return;
    }

    await dequeuePendingPayment(payment.reference);

    res.status(200).json({ success: true, message: 'MTN MoMo webhook processed' });
  } catch (err) {
    logger.error('[webhook] MTN MoMo webhook handler threw', { error: (err as Error).message });
    res.status(500).json({ success: false, message: 'Internal error processing MTN MoMo webhook' });
  }
}

// ─── Airtel Money — C2B Callback ────────────────────────────────────────────────
//
// Expected payload shape (per Airtel Africa Open API C2B callback spec —
// confirm exact field names against your specific merchant integration
// contract, Airtel's callback formats have historically varied by market):
//   { transaction: { id, status_code: 'TS'|'TF', message?, airtel_money_id? } }
export async function handleAirtelMoneyWebhook(req: Request, res: Response): Promise<void> {
  try {
    const signatureHeader = req.headers['x-signature'] ?? req.headers['x-hub-signature-256'];
    const signature = Array.isArray(signatureHeader) ? signatureHeader[0] : signatureHeader;

    // Fails CLOSED — see the equivalent note on handleMtnMomoWebhook above.
    // The `secret && !verify(...)` form this replaces skipped verification
    // outright on any deployment that had not set the secret.
    if (!verifyHmacSignature(getRawBody(req), signature, env.airtel.webhookHmacSecret)) {
      logger.warn('[webhook] Rejected Airtel Money webhook — invalid or unverifiable HMAC signature', {
        secretConfigured: Boolean(env.airtel.webhookHmacSecret),
        signaturePresent: Boolean(signature),
      });
      res.status(401).json({ success: false, message: 'Invalid Airtel Money webhook signature' });
      return;
    }

    const payload = req.body as {
      transaction?: { id?: string; status_code?: string; message?: string; airtel_money_id?: string };
    };

    const txn = payload.transaction;
    const externalId = txn?.id;
    if (!externalId || !txn?.status_code) {
      res.status(400).json({ success: false, message: 'Missing transaction.id or status_code in Airtel Money webhook payload' });
      return;
    }

    const eventId = `airtel:${externalId}:${txn.status_code}`;
    if (!(await webhookIdempotencyRepository.claim(eventId))) {
      res.status(200).json({ success: true, message: 'Airtel Money webhook already processed (idempotent)' });
      return;
    }

    const payment = await paymentRepository.findByReference(externalId);
    if (!payment) {
      logger.warn('[webhook] Airtel Money webhook for unknown payment reference', { externalId });
      res.status(200).json({ success: true, message: 'Unknown payment reference — ignored' });
      return;
    }

    if (payment.providerStatus !== 'PENDING_USER_PIN_PROMPT') {
      res.status(200).json({ success: true, message: 'Payment already resolved' });
      return;
    }

    if (txn.status_code === 'TS') {
      await markPaymentSuccessful(payment, txn.airtel_money_id);
    } else if (txn.status_code === 'TF') {
      await markPaymentFailed(payment, txn.message ?? 'Airtel Money declined the payment');
    } else {
      res.status(200).json({ success: true, message: 'Airtel Money webhook acknowledged (no terminal status yet)' });
      return;
    }

    await dequeuePendingPayment(payment.reference);

    res.status(200).json({ success: true, message: 'Airtel Money webhook processed' });
  } catch (err) {
    logger.error('[webhook] Airtel Money webhook handler threw', { error: (err as Error).message });
    res.status(500).json({ success: false, message: 'Internal error processing Airtel Money webhook' });
  }
}

// ─── Visa/Mastercard Card Gateway — Webhook + 3DS2 Return ──────────────────────
//
// Two separate entry points cover the card flow:
//   - POST /webhooks/visa: the gateway's async server-to-server notification
//     (authorization/capture/refund outcomes), signed RSA or HMAC.
//   - GET /callbacks/visa/3ds-return: the customer's browser/webview is
//     redirected here by the issuer's ACS after a 3DS2 challenge completes;
//     we re-query the gateway for the authoritative outcome (never trust the
//     redirect's own query params for the actual decision) and bounce the
//     browser back to customer-web.
export async function handleVisaCardWebhook(req: Request, res: Response): Promise<void> {
  try {
    const rsaSignature = req.headers['x-visa-signature'] as string | undefined;
    const hmacSignatureHeader = req.headers['x-visa-hmac-signature'] ?? req.headers['x-signature'];
    const hmacSignature = Array.isArray(hmacSignatureHeader) ? hmacSignatureHeader[0] : hmacSignatureHeader;
    const rawBody = getRawBody(req);

    // Prefer RSA when the gateway sent it; fall back to HMAC. Reject outright
    // if neither a configured key/secret nor a matching header is present —
    // an unsigned or unverifiable webhook is never trusted.
    const verified = rsaSignature
      ? verifyRsaSignature(rawBody, rsaSignature, env.visaCard.webhookRsaPublicKey)
      : verifyHmacSignature(rawBody, hmacSignature, env.visaCard.webhookHmacSecret);

    if (!verified) {
      logger.warn('[webhook] Rejected Visa/Mastercard card webhook — invalid or missing signature');
      res.status(401).json({ success: false, message: 'Invalid card gateway webhook signature' });
      return;
    }

    const payload = req.body as {
      eventId?: string;
      eventType?: 'authorization.succeeded' | 'authorization.declined' | 'capture.succeeded' | 'refund.succeeded' | string;
      reference?: string;
      providerTransactionId?: string;
      declineReason?: string;
    };

    const reference = payload.reference;
    if (!reference || !payload.eventType) {
      res.status(400).json({ success: false, message: 'Missing reference or eventType in card webhook payload' });
      return;
    }

    const eventId = payload.eventId ?? `visa:${reference}:${payload.eventType}`;
    if (!(await webhookIdempotencyRepository.claim(eventId))) {
      res.status(200).json({ success: true, message: 'Card webhook already processed (idempotent)' });
      return;
    }

    const payment = await paymentRepository.findByReference(reference);
    if (!payment) {
      // 200, not 404 — an unknown reference is not a reason for the gateway to keep retrying.
      logger.warn('[webhook] Card webhook for unknown payment reference', { reference });
      res.status(200).json({ success: true, message: 'Unknown payment reference — ignored' });
      return;
    }

    if (payload.eventType === 'authorization.succeeded' || payload.eventType === 'capture.succeeded') {
      if (payment.card) {
        payment.card.threeDSecureStatus = 'AUTHENTICATED';
        await paymentRepository.update(payment.reference, { card: payment.card });
      }
      await markPaymentSuccessful(payment, payload.providerTransactionId);
    } else if (payload.eventType === 'authorization.declined') {
      if (payment.card) {
        payment.card.threeDSecureStatus = 'REJECTED';
        await paymentRepository.update(payment.reference, { card: payment.card });
      }
      await markPaymentFailed(payment, payload.declineReason ?? 'Card gateway declined the authorization');
    } else if (payload.eventType === 'refund.succeeded') {
      await paymentRepository.update(payment.reference, { status: 'refunded' });
    } else {
      res.status(200).json({ success: true, message: 'Card webhook acknowledged (no terminal status yet)' });
      return;
    }

    res.status(200).json({ success: true, message: 'Card webhook processed' });
  } catch (err) {
    logger.error('[webhook] Visa/Mastercard card webhook handler threw', { error: (err as Error).message });
    res.status(500).json({ success: false, message: 'Internal error processing card webhook' });
  }
}

export async function handleVisaCard3dsReturn(req: Request, res: Response): Promise<void> {
  const frontendBase = env.visaCard.checkoutFrontendUrl;
  const reference = req.query.reference as string | undefined;

  try {
    if (!reference) {
      res.redirect(`${frontendBase}/checkout?payment_error=missing_reference`);
      return;
    }

    const payment = await paymentRepository.findByReference(reference);
    if (!payment) {
      res.redirect(`${frontendBase}/checkout?payment_error=unknown_reference`);
      return;
    }

    if (!payment.card?.authorizationId) {
      res.redirect(`${frontendBase}/orders/${payment.orderId}?payment=error`);
      return;
    }

    // Re-query the gateway rather than trusting the ACS redirect's own query
    // params — those are for UX only and are not a signed statement of outcome.
    const status = await visaCardPaymentDriver.getAuthorizationStatus(payment.card.authorizationId);
    payment.card.threeDSecureStatus = status.threeDSecureStatus;
    await paymentRepository.update(payment.reference, { card: payment.card });

    if (status.status === 'AUTHORIZED' && status.threeDSecureStatus === 'AUTHENTICATED') {
      await markPaymentSuccessful(payment, status.providerTransactionId);
      res.redirect(`${frontendBase}/orders/${payment.orderId}?payment=success`);
    } else {
      await markPaymentFailed(payment, status.declineReason ?? 'Card authentication was not completed');
      res.redirect(`${frontendBase}/orders/${payment.orderId}?payment=failed`);
    }
  } catch (err) {
    logger.error('[webhook] Visa/Mastercard 3DS return handler threw', { reference, error: (err as Error).message });
    res.redirect(`${frontendBase}/checkout?payment_error=server_error`);
  }
}
