import { Redis } from 'ioredis';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';

// ─── Shared Redis Client (payment-service) ─────────────────────────────────────
//
// Used by the pending-payment polling worker to track collection requests
// that are awaiting a customer PIN prompt (status: PENDING_USER_PIN_PROMPT).
// A dedicated `ioredis` client is used (rather than the generic
// `shared/cache/redis.ts` GET/SET wrapper) because the worker needs sorted-set
// commands (ZADD/ZRANGEBYSCORE/ZREM) and atomic locking (SET NX PX).

let client: Redis | null = null;
let ready = false;

export function getRedisClient(): Redis {
  if (!client) {
    client = new Redis(env.redis.url, {
      lazyConnect: true,
      maxRetriesPerRequest: 3,
      retryStrategy: (attempt: number) => Math.min(attempt * 200, 5000),
    });

    client.on('error', (err: Error) => logger.error('[redis] Connection error', { error: err.message || String(err) }));
    client.on('connect', () => { ready = true; logger.info('[redis] ✅ Connected'); });
    client.on('close', () => { ready = false; logger.warn('[redis] Connection closed'); });
    client.on('reconnecting', () => logger.warn('[redis] Reconnecting…'));
  }
  return client;
}

const INITIAL_CONNECT_TIMEOUT_MS = 5000;

/**
 * Kick off the Redis connection with a bounded wait at startup.
 *
 * ioredis's `retryStrategy` (configured above) never gives up, so `.connect()`
 * itself can stay pending indefinitely if Redis isn't reachable yet — awaiting
 * it directly would block the whole service from ever calling `app.listen()`.
 * We wait a short window for the common case (Redis already up), then move on
 * regardless; the client keeps retrying in the background and `isRedisReady()`
 * flips true whenever it eventually connects.
 */
export async function connectRedis(): Promise<void> {
  const c = getRedisClient();
  if (c.status === 'ready' || c.status === 'connecting') return;

  await Promise.race([
    c.connect().catch((err: Error) => {
      logger.warn('[redis] Initial connect attempt failed — will keep retrying in the background', {
        error: err.message || String(err),
      });
    }),
    new Promise<void>((resolve) => setTimeout(resolve, INITIAL_CONNECT_TIMEOUT_MS)),
  ]);
}

export async function disconnectRedis(): Promise<void> {
  if (client) {
    await client.quit();
    ready = false;
  }
}

export function isRedisReady(): boolean {
  return ready;
}
