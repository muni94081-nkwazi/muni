/**
 * MUNI Platform — Idempotent Consumer Guard
 * Uses a Redis `SET NX EX` lock keyed by eventId to ensure a message is
 * only ever processed once, even if RabbitMQ redelivers it (broker restart,
 * unacked message requeue, at-least-once retries, etc).
 */

import { createClient, type RedisClientType } from 'redis';

// Long enough to outlast the retry + DLQ window (RETRY_DELAYS_MS tops out at
// a few minutes) with generous headroom for a manual DLQ redrive.
const IDEMPOTENCY_TTL_SECONDS = 24 * 60 * 60;

let client: RedisClientType | null = null;

function getClient(): RedisClientType {
  if (!client) {
    client = createClient({ url: process.env.REDIS_URL ?? 'redis://localhost:6379' }) as RedisClientType;
    client.on('error', (e) => console.error('[rabbitmq:idempotency]', e.message));
  }
  return client;
}

async function ensureConnected(): Promise<RedisClientType> {
  const c = getClient();
  if (!c.isOpen) await c.connect();
  return c;
}

/**
 * Atomically claim an eventId for processing.
 * @returns true if this call won the claim (safe to process), false if
 *          another delivery already claimed it (duplicate — skip).
 */
export async function claimEvent(eventId: string): Promise<boolean> {
  const c = await ensureConnected();
  const result = await c.set(`event_processed:${eventId}`, '1', { NX: true, EX: IDEMPOTENCY_TTL_SECONDS });
  return result === 'OK';
}

/**
 * Release a claim after a failed processing attempt so a legitimate retry
 * (or a manual DLQ redrive) is not permanently blocked by its own first try.
 */
export async function releaseEvent(eventId: string): Promise<void> {
  const c = await ensureConnected();
  await c.del(`event_processed:${eventId}`);
}
