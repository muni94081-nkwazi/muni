import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';
import { signServiceIdentity, INTERNAL_IDENTITY_HEADER } from '../../../../shared/utils/internal-identity.js';

// ─── buyer-protection-service Client ────────────────────────────────────────
//
// Tells the Escrow Payout Hold system when a dispute opens or resolves, so
// it can freeze/release the seller's payout accordingly. Best-effort: a
// buyer-protection-service outage should not block a buyer from filing a
// claim (this is already a strict improvement over the previous
// fire-and-forget-Kafka-only behaviour — see git history — since a real
// synchronous attempt is made and failures are logged loudly instead of
// silently dropped on the floor).

type DisputeOutcome = 'SELLER_FAVOR' | 'BUYER_FAVOR';

/**
 * The escrow transitions are internal-only on buyer-protection-service: they
 * freeze and release a seller's payout, so they require the `svc` claim that
 * only a peer service can mint rather than merely a valid session. Without this
 * assertion the calls below are refused — the freeze on a filed dispute would
 * silently never be placed, which is the failure this client logs loudly about.
 */
function serviceHeaders(): Record<string, string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  // Signed for dispute-service itself: no single user is acting here, the
  // service is, on behalf of a dispute it has already verified.
  const assertion = signServiceIdentity('dispute-service', [], 'dispute-service');
  if (assertion) headers[INTERNAL_IDENTITY_HEADER] = assertion;
  return headers;
}

async function post(path: string, body: Record<string, unknown>): Promise<void> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), env.buyerProtectionService.timeoutMs);

  try {
    const res = await fetch(`${env.buyerProtectionService.baseUrl}${path}`, {
      method: 'POST',
      headers: serviceHeaders(),
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`buyer-protection-service ${path} returned ${res.status}: ${text}`);
    }
  } finally {
    clearTimeout(timer);
  }
}

export const buyerProtectionClient = {
  async holdForDispute(orderId: string, subOrderId: string | undefined, disputeId: string): Promise<void> {
    try {
      await post('/api/v1/buyer-protection/escrow/dispute-hold', { orderId, subOrderId, disputeId });
    } catch (err) {
      logger.warn('[buyer-protection-client] Failed to freeze escrow for dispute — payout hold may not be in place', {
        orderId, disputeId, error: (err as Error).message,
      });
    }
  },

  async resolveDisputeHold(orderId: string, subOrderId: string | undefined, disputeId: string, outcome: DisputeOutcome): Promise<void> {
    try {
      await post('/api/v1/buyer-protection/escrow/dispute-resolve', { orderId, subOrderId, disputeId, outcome });
    } catch (err) {
      logger.warn('[buyer-protection-client] Failed to resolve escrow hold after dispute resolution', {
        orderId, disputeId, outcome, error: (err as Error).message,
      });
    }
  },
};
