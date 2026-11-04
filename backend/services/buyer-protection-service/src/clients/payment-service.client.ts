import { env } from '../config/env.js';

// ─── payment-service Client ─────────────────────────────────────────────────
//
// payment-service owns the actual money-movement ledger (`EscrowHoldEntry`).
// This service only decides *when* a hold should move — it calls straight
// through to payment-service's existing escrow endpoints to make it happen,
// the same direct-HTTP style payment-service itself uses for currency-service
// (see payment-service/src/services/currency.client.ts).
//
// NOTE: payment-service's `/escrow/release` endpoint currently always
// records the release as buyer-initiated regardless of what actually
// triggered it (see its controller) — out of scope to change here since
// payment-service isn't one of the services this system targets. The real
// trigger (buyer confirmation vs. 7-day auto-release vs. dispute
// resolution) is still recorded accurately on this service's own
// `EscrowHold` record.

export class PaymentServiceClientError extends Error {
  constructor(message: string, public readonly status: number) {
    super(message);
    this.name = 'PaymentServiceClientError';
  }
}

async function call(path: string, body: Record<string, unknown>): Promise<void> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), env.paymentService.timeoutMs);

  try {
    const res = await fetch(`${env.paymentService.baseUrl}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new PaymentServiceClientError(`payment-service ${path} returned ${res.status}: ${text}`, res.status);
    }
  } catch (err) {
    if (err instanceof PaymentServiceClientError) throw err;
    if (err instanceof Error && err.name === 'AbortError') {
      throw new PaymentServiceClientError(`payment-service ${path} timed out after ${env.paymentService.timeoutMs}ms`, 504);
    }
    throw new PaymentServiceClientError(`payment-service ${path} request failed: ${(err as Error).message}`, 502);
  } finally {
    clearTimeout(timer);
  }
}

// ─── Scope ────────────────────────────────────────────────────────────────────
//
// Both calls carry the vendor, and both used to send only `orderId`.
//
// payment-service keeps one escrow row per (order, vendor). Told just the
// order, it acted on all of them: a buyer confirming receipt of one seller's
// parcel released every seller on the basket — including sellers who had not
// shipped — and a dispute with one seller froze everyone else's money.
//
// `vendorId` is this service's `sellerId`: the two services name the same party
// differently, and the translation belongs here at the boundary rather than in
// the caller.

export const paymentServiceClient = {
  /** Tells payment-service's escrow ledger to pay ONE seller out now. */
  releaseEscrow(orderId: string, sellerId?: string, subOrderId?: string | null): Promise<void> {
    return call('/api/v1/payments/escrow/release', {
      orderId,
      ...(sellerId   ? { vendorId:   sellerId }   : {}),
      ...(subOrderId ? { subOrderId }             : {}),
    });
  },

  /**
   * Returns ONE seller's escrowed funds to the buyer.
   *
   * New: there was no synchronous refund endpoint, so `refundToBuyer` flipped
   * the local hold and published an event nothing consumed. payment-service's
   * ledger never learned the refund happened.
   */
  refundEscrow(
    orderId: string,
    sellerId?: string,
    subOrderId?: string | null,
    disputeId?: string,
  ): Promise<void> {
    return call('/api/v1/payments/escrow/refund', {
      orderId,
      ...(sellerId   ? { vendorId: sellerId } : {}),
      ...(subOrderId ? { subOrderId }         : {}),
      ...(disputeId  ? { disputeId }          : {}),
    });
  },

  /** Freezes ONE seller's escrow ledger entry while a dispute is open. */
  holdEscrowForDispute(orderId: string, disputeId: string, sellerId?: string): Promise<void> {
    return call('/api/v1/payments/escrow/hold', {
      orderId,
      disputeId,
      ...(sellerId ? { vendorId: sellerId } : {}),
    });
  },
};
