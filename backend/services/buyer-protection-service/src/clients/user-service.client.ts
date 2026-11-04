import { env } from '../config/env.js';
import {
  signServiceIdentity,
  INTERNAL_IDENTITY_HEADER,
} from '../../../../shared/utils/internal-identity.js';

/**
 * user-service now guards POST /sellers/:id/trust-events. It accepts a peer
 * service on the strength of the `svc` claim in a signed assertion — the
 * signature alone is not enough, because the gateway signs for ordinary
 * shoppers too. Without this header the call is rejected, and since this
 * client swallows failures by design the on-time delivery signal would simply
 * stop updating with nothing but a log line to show for it.
 *
 * `signServiceIdentity` returns null when INTERNAL_IDENTITY_SECRET is unset,
 * matching the migration behaviour of every other signed call in the platform.
 */
function buildHeaders(sellerId: string): Record<string, string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const assertion = signServiceIdentity(sellerId, [], 'buyer-protection-service');
  if (assertion) headers[INTERNAL_IDENTITY_HEADER] = assertion;
  return headers;
}

// ─── user-service Client — Seller Trust Score delivery-timing signal ───────
//
// Feeds the "on-time delivery rate" factor of the Seller Trust Score (see
// user-service/src/services/sellerTrust.service.js) the moment a delivery
// is verified and we know whether it beat the promised delivery date.
// Best-effort — a seller's trust score updating a little late is never a
// reason to fail a delivery-confirmation call.

export type DeliveryTrustEventType = 'ORDER_DELIVERED_ON_TIME' | 'ORDER_DELIVERED_LATE';

export const userServiceClient = {
  async recordDeliveryEvent(sellerId: string, eventType: DeliveryTrustEventType, orderId: string, occurredAt: string): Promise<void> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), env.userService.timeoutMs);

    try {
      const res = await fetch(`${env.userService.baseUrl}/sellers/${encodeURIComponent(sellerId)}/trust-events`, {
        method: 'POST',
        headers: buildHeaders(sellerId),
        body: JSON.stringify({ eventType, orderId, occurredAt }),
        signal: controller.signal,
      });

      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(`user-service trust-events returned ${res.status}: ${text}`);
      }
    } catch (err) {
      console.warn(`[user-service-client] Failed to record delivery trust event for seller ${sellerId}:`, err);
    } finally {
      clearTimeout(timer);
    }
  },
};
