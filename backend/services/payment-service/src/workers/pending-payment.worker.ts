import { randomUUID } from 'node:crypto';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';
import { getRedisClient, isRedisReady } from '../redis/client.js';
import { paymentRepository } from '../repositories/payment.repository.js';
import { mtnMomoDriver } from '../drivers/mtn-momo.driver.js';
import { airtelMoneyDriver } from '../drivers/airtel-money.driver.js';
import { ProviderApiError } from '../drivers/types.js';
import type { MobileMoneyDriver } from '../drivers/types.js';
import { markPaymentSuccessful, markPaymentFailed } from '../services/payment-resolution.service.js';

// ─── Redis-Backed Pending-Payment Polling Worker ───────────────────────────────
//
// When MTN/Airtel accept a "request to pay", the customer sees a PIN prompt
// on their phone and the payment sits in `PENDING_USER_PIN_PROMPT` until
// they approve/decline (or a webhook never arrives, e.g. their app crashed).
// This worker is the safety net: it polls each pending reference's status
// directly with the provider on a schedule, using a Redis sorted set as the
// scheduling queue (score = next-due epoch ms) so:
//   • multiple payment-service instances can share the same queue,
//   • polling survives a process restart (the queue lives in Redis, not memory),
//   • we get natural backoff/reschedule via ZADD instead of setTimeout chains.
//
// A webhook arriving first is the common case and wins the race: it resolves
// the in-memory payment record directly, and the next time this worker picks
// up that reference it sees `providerStatus !== 'PENDING_USER_PIN_PROMPT'`
// and simply drops it from the queue — no duplicate processing.

const PENDING_SET_KEY = 'payments:pending_poll';
const LOCK_KEY = 'payments:pending_poll:lock';
const WORKER_INSTANCE_ID = randomUUID();

let intervalHandle: ReturnType<typeof setInterval> | null = null;

function driverFor(provider: string | null | undefined): MobileMoneyDriver | null {
  if (provider === 'mtn_momo') return mtnMomoDriver;
  if (provider === 'airtel_money') return airtelMoneyDriver;
  return null;
}

/** Schedule (or reschedule) a payment reference for its next status check. */
export async function enqueuePendingPayment(
  reference: string,
  delayMs: number = env.pendingPaymentWorker.pollIntervalMs,
): Promise<void> {
  if (!isRedisReady()) {
    logger.warn('[pending-payment-worker] Redis not ready — cannot enqueue for polling', { reference });
    return;
  }
  try {
    await getRedisClient().zadd(PENDING_SET_KEY, Date.now() + delayMs, reference);
  } catch (err) {
    logger.error('[pending-payment-worker] Failed to enqueue', { reference, error: (err as Error).message });
  }
}

export async function dequeuePendingPayment(reference: string): Promise<void> {
  if (!isRedisReady()) return;
  try {
    await getRedisClient().zrem(PENDING_SET_KEY, reference);
  } catch (err) {
    logger.error('[pending-payment-worker] Failed to dequeue', { reference, error: (err as Error).message });
  }
}

async function processDueReference(reference: string): Promise<void> {
  const payment = await paymentRepository.findByReference(reference);

  if (!payment) {
    logger.warn('[pending-payment-worker] No stored record for pending reference — dropping', { reference });
    await dequeuePendingPayment(reference);
    return;
  }

  if (payment.providerStatus !== 'PENDING_USER_PIN_PROMPT') {
    // Already resolved (most likely by a webhook that beat us to it).
    await dequeuePendingPayment(reference);
    return;
  }

  const driver = driverFor(payment.provider);
  if (!driver || !payment.providerReferenceId) {
    logger.error('[pending-payment-worker] Pending payment missing provider/providerReferenceId', { reference });
    await markPaymentFailed(payment, 'Internal error: payment has no provider reference to poll');
    await dequeuePendingPayment(reference);
    return;
  }

  payment.pollAttempts = await paymentRepository.incrementPollAttempts(reference);

  if (payment.pollAttempts > env.pendingPaymentWorker.maxPollAttempts) {
    await markPaymentFailed(
      payment,
      `Timed out waiting for customer PIN confirmation after ${payment.pollAttempts} status checks`,
    );
    await dequeuePendingPayment(reference);
    return;
  }

  try {
    const result = await driver.getCollectionStatus(payment.providerReferenceId);

    if (result.status === 'SUCCESSFUL') {
      await markPaymentSuccessful(payment, result.providerTransactionId);
      await dequeuePendingPayment(reference);
    } else if (result.status === 'FAILED') {
      await markPaymentFailed(payment, result.reason ?? `${payment.provider} declined the payment`);
      await dequeuePendingPayment(reference);
    } else {
      await enqueuePendingPayment(reference, env.pendingPaymentWorker.retryBackoffMs);
    }
  } catch (err) {
    // Transient provider/network error — retry rather than fail the payment outright;
    // bounded by maxPollAttempts above so a persistently broken provider still resolves.
    logger.error('[pending-payment-worker] Status check threw — will retry', {
      reference,
      error: err instanceof ProviderApiError ? err.message : (err as Error).message,
    });
    await enqueuePendingPayment(reference, env.pendingPaymentWorker.retryBackoffMs);
  }
}

async function tick(): Promise<void> {
  if (!isRedisReady()) return;

  const redis = getRedisClient();
  const lockValue = `${WORKER_INSTANCE_ID}:${Date.now()}`;

  // Best-effort single-flight lock so multiple payment-service replicas don't
  // double-poll the same batch concurrently. Not strictly required for
  // correctness (duplicate polls are idempotent — see the providerStatus
  // guard above) but avoids wasted duplicate provider API calls.
  const acquired = await redis.set(LOCK_KEY, lockValue, 'PX', env.pendingPaymentWorker.lockTtlMs, 'NX');
  if (!acquired) return;

  try {
    const due = await redis.zrangebyscore(
      PENDING_SET_KEY,
      '-inf',
      Date.now(),
      'LIMIT',
      0,
      env.pendingPaymentWorker.batchSize,
    );
    if (due.length === 0) return;

    logger.debug(`[pending-payment-worker] Processing ${due.length} due payment(s)`);
    for (const reference of due) {
      await processDueReference(reference);
    }
  } catch (err) {
    logger.error('[pending-payment-worker] Tick failed', { error: (err as Error).message });
  }
}

export function startPendingPaymentWorker(): void {
  if (intervalHandle) return;
  intervalHandle = setInterval(() => void tick(), env.pendingPaymentWorker.pollIntervalMs);
  logger.info(
    `[pending-payment-worker] ✅ Started (interval=${env.pendingPaymentWorker.pollIntervalMs}ms, maxAttempts=${env.pendingPaymentWorker.maxPollAttempts})`,
  );
}

export function stopPendingPaymentWorker(): void {
  if (intervalHandle) {
    clearInterval(intervalHandle);
    intervalHandle = null;
    logger.info('[pending-payment-worker] Stopped');
  }
}
