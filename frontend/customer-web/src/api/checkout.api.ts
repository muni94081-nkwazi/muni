import { apiClient } from './axios.config';
import type { ApiEnvelope } from '@/types/api.types';
import type { CheckoutSession, InitiateCheckoutPayload } from '@/types/checkout.types';

/**
 * checkout-service — the only supported way to turn a cart into an order.
 *
 * `POST /orders` still exists and is still reachable, but it creates an order
 * without running the saga: no payment is taken and nothing coordinates the
 * inventory hold with it. Everything customer-facing goes through here, where
 * one call runs price → reserve → charge → create order → deduct, unwinding
 * every completed step if a later one fails.
 */

function newIdempotencyKey(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `checkout-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

export const checkoutApi = {
  /**
   * Run a checkout to completion.
   *
   * The Idempotency-Key is required by the route and is the reason a retried
   * or double-tapped confirm cannot produce a second payment: the first call's
   * response is replayed instead of the saga running again. Generate it once
   * per checkout attempt and reuse it across retries of that same attempt —
   * which is why it is a parameter rather than being minted inside the call.
   */
  async initiate(payload: InitiateCheckoutPayload, idempotencyKey: string): Promise<CheckoutSession> {
    const { data } = await apiClient.post<ApiEnvelope<CheckoutSession>>(
      '/checkout/initiate',
      payload,
      { headers: { 'Idempotency-Key': idempotencyKey } },
    );
    return data.data;
  },

  /**
   * Re-drive a session that stopped at PAYMENT_PENDING — e.g. a mobile money
   * collection the customer approved on their handset after the initial
   * request returned.
   */
  async confirm(sessionId: string, idempotencyKey: string): Promise<CheckoutSession> {
    const { data } = await apiClient.post<ApiEnvelope<CheckoutSession>>(
      `/checkout/${sessionId}/confirm`,
      {},
      { headers: { 'Idempotency-Key': idempotencyKey } },
    );
    return data.data;
  },

  async getSession(sessionId: string): Promise<CheckoutSession> {
    const { data } = await apiClient.get<ApiEnvelope<CheckoutSession>>(`/checkout/${sessionId}`);
    return data.data;
  },

  async cancel(sessionId: string): Promise<CheckoutSession> {
    const { data } = await apiClient.post<ApiEnvelope<CheckoutSession>>(`/checkout/${sessionId}/cancel`);
    return data.data;
  },

  newIdempotencyKey,
};
