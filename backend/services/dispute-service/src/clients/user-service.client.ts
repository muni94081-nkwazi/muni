import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';
import {
  signServiceIdentity,
  INTERNAL_IDENTITY_HEADER,
} from '../../../../shared/utils/internal-identity.js';

/**
 * user-service now guards POST /sellers/:id/trust-events. It accepts a peer
 * service on the strength of the `svc` claim in a signed assertion — the
 * signature alone is not enough, because the gateway signs for ordinary
 * shoppers too. Without this header the call is rejected, and since this
 * client swallows failures by design the trust score would simply stop
 * updating with nothing but a warning in the log to show for it.
 *
 * `signServiceIdentity` returns null when INTERNAL_IDENTITY_SECRET is unset,
 * which is the same migration behaviour every other signed call here has.
 */
function buildHeaders(sellerId: string): Record<string, string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const assertion = signServiceIdentity(sellerId, [], 'dispute-service');
  if (assertion) headers[INTERNAL_IDENTITY_HEADER] = assertion;
  return headers;
}

// ─── user-service Client — Seller Trust Score signal reporting ─────────────
//
// Every dispute lifecycle transition that's relevant to a seller's Trust
// Score (dispute rate, item-defect/INAD rate, response time) is reported
// here as it happens. user-service owns the actual score calculation — see
// user-service/src/services/sellerTrust.service.js — this client just
// ships it the raw event. Best-effort: a seller's trust score updating a
// little late is never a reason to fail a dispute action.

export type SellerTrustEventType =
  | 'DISPUTE_OPENED'
  | 'DISPUTE_RESOLVED_SELLER_FAVOR'
  | 'DISPUTE_RESOLVED_BUYER_FAVOR'
  | 'ITEM_DEFECT_REPORTED'
  | 'SLA_BREACHED';

export interface SellerTrustEvent {
  eventType: SellerTrustEventType;
  orderId: string;
  disputeId: string;
  /** Hours between dispute open and seller resolution — only present on resolution events. */
  responseTimeHours?: number;
  occurredAt: string;
}

export const userServiceClient = {
  async recordSellerTrustEvent(sellerId: string, event: SellerTrustEvent): Promise<void> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), env.userService.timeoutMs);

    try {
      const res = await fetch(`${env.userService.baseUrl}/sellers/${encodeURIComponent(sellerId)}/trust-events`, {
        method: 'POST',
        headers: buildHeaders(sellerId),
        body: JSON.stringify(event),
        signal: controller.signal,
      });

      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(`user-service trust-events returned ${res.status}: ${text}`);
      }
    } catch (err) {
      logger.warn('[user-service-client] Failed to record seller trust event', {
        sellerId, eventType: event.eventType, error: (err as Error).message,
      });
    } finally {
      clearTimeout(timer);
    }
  },
};
