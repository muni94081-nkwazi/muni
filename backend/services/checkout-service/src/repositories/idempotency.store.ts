import { createClient, type RedisClientType } from 'redis';
import type { IdempotencyStore } from '../../../../shared/http/idempotency.middleware.js';
import { logger } from '../utils/logger.js';

// ─── Idempotency Store ────────────────────────────────────────────────────────
//
// Deliberately a separate Redis connection from the cache: this data must not
// be evicted under memory pressure. Losing an idempotency key mid-flight means
// the next retry executes a second payment, so the backing instance should run
// with `maxmemory-policy noeviction`.
//
// The middleware fails closed when this store is unavailable — a 503 the user
// can retry is strictly better than a duplicate charge they cannot undo.

let client: RedisClientType | null = null;
let ready = false;

export async function connectIdempotencyStore(): Promise<void> {
  try {
    client = createClient({
      url: process.env.IDEMPOTENCY_REDIS_URL ?? process.env.REDIS_URL ?? 'redis://localhost:6379',
      socket: { reconnectStrategy: (r) => (r >= 3 ? new Error('unavailable') : Math.min(r * 100, 1000)) },
    }) as RedisClientType;

    client.on('error', (e) => logger.error('[idempotency] Redis error', { error: e.message }));
    client.on('ready', () => { ready = true; });
    client.on('end',   () => { ready = false; });

    await client.connect();
    logger.info('[idempotency] ✅ Connected to Redis');
  } catch (err) {
    ready = false;
    logger.error(
      '[idempotency] ⚠️  Redis unavailable — money-moving routes will return 503 ' +
      'until it recovers. This is intentional: without a shared store a retried ' +
      'checkout cannot be distinguished from a second purchase.',
      { error: (err as Error).message },
    );
  }
}

export async function disconnectIdempotencyStore(): Promise<void> {
  try { await client?.quit(); } catch { /* already closed */ }
  ready = false;
}

export function isIdempotencyStoreReady(): boolean {
  return ready;
}

/**
 * Adapter to the store shape the shared middleware expects. Throws when Redis
 * is down so the middleware's fail-closed branch produces a 503 rather than
 * silently letting a duplicate through.
 */
export function getIdempotencyStore(): IdempotencyStore {
  const assertReady = (): RedisClientType => {
    if (!client || !ready) throw new Error('idempotency store unavailable');
    return client;
  };

  return {
    async get(key) {
      return assertReady().get(key);
    },
    async set(key, value, opts) {
      return assertReady().set(key, value, {
        ...(opts.NX ? { NX: true } : {}),
        ...(opts.EX ? { EX: opts.EX } : {}),
      }) as Promise<string | null>;
    },
    async del(key) {
      return assertReady().del(key);
    },
  };
}
