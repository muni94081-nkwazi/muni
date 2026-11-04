import { apiClient, type ApiEnvelope } from './client';
import type { CheckoutSession, InitiateCheckoutPayload } from '@/types';

/**
 * checkout-service — the only supported way to turn a cart into an order.
 *
 * `POST /orders` still exists and is still reachable, but it creates an order
 * without running the saga: no payment is taken and nothing coordinates the
 * inventory hold with it. Everything customer-facing goes through here, where
 * one call runs price → reserve → charge → create order → deduct, unwinding
 * every completed step if a later one fails.
 *
 * Mirrors frontend/customer-web/src/api/checkout.api.ts deliberately — that is
 * the working reference against these routes.
 */

/**
 * One key per checkout *attempt*, reused across every retry of that attempt.
 *
 * `crypto.randomUUID` is not guaranteed in the React Native runtime (Hermes
 * exposes no WebCrypto by default), so this falls back rather than throwing at
 * the worst possible moment — mid-purchase.
 */
function newIdempotencyKey(): string {
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (typeof c?.randomUUID === 'function') return c.randomUUID();
  return `checkout-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

export const checkoutApi = {
  /**
   * Run a checkout to completion.
   *
   * The Idempotency-Key is REQUIRED by the route — `idempotency.middleware.ts`
   * defaults to `required: true` and rejects a request without one with a 400,
   * so this is not an optimisation. It is also what makes a double-tapped
   * "Place order" safe: the first call's response is replayed instead of the
   * saga running a second time and taking a second payment.
   *
   * The key is a parameter, not minted inside this call, precisely so a retry
   * reuses it. Minting one per call would defeat the entire mechanism — every
   * retry would look like a fresh purchase. Generate it once when the attempt
   * begins (`newIdempotencyKey()`), hold it for the duration of that attempt,
   * and only mint a new one when the customer starts over.
   *
   * Returns the session rather than throwing on a business outcome: a FAILED
   * session with a `failureReason` is a 200 the caller has to render, not an
   * exception. Transport and 4xx/5xx errors still reject.
   */
  initiate: async (
    payload: InitiateCheckoutPayload,
    idempotencyKey: string,
  ): Promise<CheckoutSession> => {
    const { data } = await apiClient.post<ApiEnvelope<CheckoutSession>>(
      '/api/v1/checkout/initiate',
      payload,
      { headers: { 'Idempotency-Key': idempotencyKey } },
    );
    return data.data;
  },

  /**
   * Re-drive a session that stopped at PAYMENT_PENDING — e.g. a mobile money
   * collection the customer approved on their handset after the initial
   * request had already returned.
   *
   * Replaces the previous `processPayment`, which posted to
   * `/checkout/:id/pay`. That route does not exist on checkout-service and
   * never has; the router serves `POST /checkout/:sessionId/confirm`.
   *
   * Idempotent server-side: a COMPLETED session is returned unchanged rather
   * than re-charged.
   */
  confirm: async (sessionId: string, idempotencyKey: string): Promise<CheckoutSession> => {
    const { data } = await apiClient.post<ApiEnvelope<CheckoutSession>>(
      `/api/v1/checkout/${sessionId}/confirm`,
      {},
      { headers: { 'Idempotency-Key': idempotencyKey } },
    );
    return data.data;
  },

  getSession: async (sessionId: string): Promise<CheckoutSession> => {
    const { data } = await apiClient.get<ApiEnvelope<CheckoutSession>>(
      `/api/v1/checkout/${sessionId}`,
    );
    return data.data;
  },

  cancel: async (sessionId: string): Promise<CheckoutSession> => {
    const { data } = await apiClient.post<ApiEnvelope<CheckoutSession>>(
      `/api/v1/checkout/${sessionId}/cancel`,
    );
    return data.data;
  },

  newIdempotencyKey,
};
