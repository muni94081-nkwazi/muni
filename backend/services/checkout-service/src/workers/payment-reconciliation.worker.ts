import { sessionRepository } from '../repositories/session.repository.js';
import { checkoutService } from '../services/checkout.service.js';
import { call, SERVICES } from '../clients/service.client.js';
import { logger } from '../utils/logger.js';

// ─── Pending payment reconciliation ───────────────────────────────────────────
//
// The safety net for a webhook that never arrived.
//
// The payment-events consumer handles the normal case, but it only works if the
// event is published AND delivered: a broker outage, a consumer restart mid-lag,
// or a provider that never calls back all leave a session parked in
// PAYMENT_PENDING with the customer's money taken. This asks payment-service
// what actually happened rather than waiting to be told.
//
// payment-service runs the same idea from the other side (a Redis worker polling
// unresolved collections), so a payment is chased independently of this. What
// this adds is the checkout half: turning a resolved payment into an order.

const INTERVAL_MS = Number(process.env.CHECKOUT_RECONCILE_INTERVAL_MS ?? 60_000);

/**
 * How long a session may sit on a PIN prompt before it is chased.
 *
 * Not too eager: a customer digging their phone out of a pocket is the normal
 * case, and re-querying every pending collection every minute would put load on
 * the provider for nothing.
 */
const STALE_AFTER_MS = Number(process.env.CHECKOUT_RECONCILE_STALE_MS ?? 3 * 60_000);

let timer: NodeJS.Timeout | null = null;
let running = false;

export interface SweepResult {
  checked:   number;
  confirmed: number;
  failed:    number;
  orphaned:  number;
}

/**
 * One pass over the stuck sessions.
 *
 * Exported and returning counts so it can be driven directly from a test, and
 * so an operator can trigger a sweep and see what it did.
 */
export async function runReconciliationSweep(): Promise<SweepResult> {
  const ids = await sessionRepository.findPendingOlderThan(STALE_AFTER_MS);
  const result: SweepResult = { checked: ids.length, confirmed: 0, failed: 0, orphaned: 0 };

  for (const sessionId of ids) {
    try {
      const session = await sessionRepository.find(sessionId);

      if (!session) {
        // Indexed as pending, but the session TTL'd out. If money was taken,
        // this is a charge with no checkout behind it — the one case this sweep
        // cannot repair. Reported once, then dropped from the index so it does
        // not repeat every minute.
        logger.error('[reconcile] pending checkout session expired before it resolved', { sessionId });
        await sessionRepository.forgetPending(sessionId);
        result.orphaned++;
        continue;
      }

      if (session.status !== 'PAYMENT_PENDING') {
        // Resolved by the consumer between the index read and now.
        await sessionRepository.forgetPending(sessionId);
        continue;
      }

      if (!session.paymentReference) {
        logger.warn('[reconcile] pending session has no payment reference to query', { sessionId });
        continue;
      }

      const res = await call<{ data?: { status?: string; providerStatus?: string } }>(
        `${SERVICES.payment}/api/v1/payments/${encodeURIComponent(session.paymentReference)}/status`,
        { service: 'checkout-service', method: 'GET', actorId: session.userId },
      );

      if (!res.ok) {
        // Transient: payment-service down, or a timeout. Leave the session
        // pending and try again on the next tick rather than failing a checkout
        // whose payment may well have succeeded.
        logger.warn('[reconcile] could not read payment status', {
          sessionId, reference: session.paymentReference, status: res.status,
        });
        continue;
      }

      const status         = res.data.data?.status;
      const providerStatus = res.data.data?.providerStatus;

      if (status === 'completed' || providerStatus === 'SUCCESSFUL') {
        await checkoutService.confirmPaymentFromSystem(sessionId, 'reconciliation');
        result.confirmed++;
        logger.info('[reconcile] confirmed a session whose webhook never arrived', { sessionId });
        continue;
      }

      if (status === 'failed' || providerStatus === 'FAILED' || providerStatus === 'EXPIRED') {
        await checkoutService.failPendingSession(
          sessionId,
          'The mobile money payment was not completed.',
        );
        result.failed++;
        continue;
      }

      // Genuinely still pending — the prompt is open on the customer's handset.
      // Left alone.
    } catch (err) {
      // One bad session must not stop the sweep reaching the rest.
      logger.error('[reconcile] sweep failed for session', {
        sessionId, error: (err as Error).message,
      });
    }
  }

  if (result.confirmed || result.failed || result.orphaned) {
    logger.info('[reconcile] sweep complete', result);
  }

  return result;
}

export function startReconciliationWorker(): void {
  if (timer) return;

  timer = setInterval(() => {
    // Skip rather than queue: a sweep that outruns its interval would otherwise
    // stack up passes that all fight for the same session locks.
    if (running) return;
    running = true;
    void runReconciliationSweep()
      .catch((err) => logger.error('[reconcile] sweep threw', { error: (err as Error).message }))
      .finally(() => { running = false; });
  }, INTERVAL_MS);

  // Does not hold the process open on shutdown.
  timer.unref();

  logger.info('[reconcile] worker started', { intervalMs: INTERVAL_MS, staleAfterMs: STALE_AFTER_MS });
}

export function stopReconciliationWorker(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}
