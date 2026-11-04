import { createClient, type RedisClientType } from 'redis';
import type { CheckoutSession } from '../models/checkout.model.js';
import { logger } from '../utils/logger.js';

// ─── Checkout Session Store ───────────────────────────────────────────────────
//
// Sessions previously lived in a module-level array. That broke three ways at
// once: a customer who initiated on pod A and confirmed on pod B got
// "session not found"; any restart erased every in-flight order; and the array
// was only ever pushed to, so it leaked until the pod was OOM-killed.
//
// Redis rather than Postgres, because a checkout session is short-lived,
// TTL-bounded and read a handful of times. Completed sessions are handed to
// order-service, which owns the durable record — the Redis copy is allowed to
// expire.
//
// The TTL deliberately matches the inventory reservation TTL: if a session
// outlived its reservations it would promise stock it no longer holds.

const TTL_SECONDS = Number(process.env.CHECKOUT_SESSION_TTL_SECONDS ?? 15 * 60);

/**
 * How long one confirm attempt may hold a session before the lock self-expires.
 *
 * Longer than a saga takes, short enough that a pod dying mid-confirm does not
 * strand the session until its own TTL.
 */
const LOCK_TTL_SECONDS = Number(process.env.CHECKOUT_LOCK_TTL_SECONDS ?? 60);

const sessionKey = (id: string)     => `checkout:session:${id}`;
const userKey    = (userId: string) => `checkout:user:${userId}`;
const lockKey    = (id: string)     => `checkout:lock:${id}`;

/**
 * Sessions awaiting a mobile money collection, scored by when they last moved.
 *
 * Maintained on every save because the reconciliation sweep has to be able to
 * ask "what is stuck?" — Redis cannot query by field, and SCANning the keyspace
 * on a timer is not something to do to a shared cluster.
 */
const PENDING_INDEX = 'checkout:pending';

let client: RedisClientType | null = null;
let ready = false;

// Development fallback. Entries carry an expiry and are swept on access, so
// unlike the array this replaces it cannot grow without bound.
interface FallbackEntry { session: CheckoutSession; expiresAt: number }
const fallback = new Map<string, FallbackEntry>();

/** Lock expiries for the same fallback mode, keyed like the Redis locks. */
const fallbackLocks = new Map<string, number>();

function sweepFallback(): void {
  const now = Date.now();
  for (const [key, entry] of fallback) {
    if (entry.expiresAt <= now) fallback.delete(key);
  }
}

export async function connectSessionStore(): Promise<void> {
  try {
    client = createClient({
      url: process.env.REDIS_URL ?? 'redis://localhost:6379',
      socket: { reconnectStrategy: (r) => (r >= 3 ? new Error('unavailable') : Math.min(r * 100, 1000)) },
    }) as RedisClientType;

    client.on('error', (e) => logger.error('[session-store] Redis error', { error: e.message }));
    client.on('ready', () => { ready = true; });
    client.on('end',   () => { ready = false; });

    await client.connect();
    logger.info('[session-store] ✅ Connected to Redis');
  } catch (err) {
    ready = false;
    logger.warn(
      '[session-store] ⚠️  Redis unavailable — using in-process fallback. ' +
      'Checkout WILL break across replicas and lose sessions on restart. ' +
      'This is a development-only mode.',
      { error: (err as Error).message },
    );
  }
}

export async function disconnectSessionStore(): Promise<void> {
  try { await client?.quit(); } catch { /* already closed */ }
  ready = false;
}

/** True when sessions are durable across replicas. Surfaced on /health/ready. */
export function isSessionStoreReady(): boolean {
  return ready;
}

export const sessionRepository = {
  async save(session: CheckoutSession): Promise<void> {
    if (client && ready) {
      await client.setEx(sessionKey(session.id), TTL_SECONDS, JSON.stringify(session));
      // Secondary index for getHistory — a sorted set, so listing a user's
      // sessions never has to SCAN the keyspace.
      await client.zAdd(userKey(session.userId), { score: Date.now(), value: session.id });
      await client.expire(userKey(session.userId), TTL_SECONDS);

      // And the pending index, so a session parked on a mobile money PIN
      // prompt is findable by the reconciliation sweep. Removed on any other
      // status, so a completed or failed session leaves the queue by the same
      // write that resolved it.
      if (session.status === 'PAYMENT_PENDING') {
        await client.zAdd(PENDING_INDEX, { score: Date.now(), value: session.id });
      } else {
        await client.zRem(PENDING_INDEX, session.id);
      }
      return;
    }

    sweepFallback();
    fallback.set(sessionKey(session.id), {
      session,
      expiresAt: Date.now() + TTL_SECONDS * 1000,
    });
  },

  async find(id: string): Promise<CheckoutSession | null> {
    if (client && ready) {
      const raw = await client.get(sessionKey(id));
      return raw ? (JSON.parse(raw) as CheckoutSession) : null;
    }

    sweepFallback();
    return fallback.get(sessionKey(id))?.session ?? null;
  },

  async findByUser(userId: string, limit = 20): Promise<CheckoutSession[]> {
    if (client && ready) {
      // Newest first.
      const ids = await client.zRange(userKey(userId), 0, limit - 1, { REV: true });
      if (ids.length === 0) return [];

      const raws = await Promise.all(ids.map((id) => client!.get(sessionKey(id))));
      return raws
        .filter((r): r is string => r !== null)
        .map((r) => JSON.parse(r) as CheckoutSession);
    }

    sweepFallback();
    return [...fallback.values()]
      .map((e) => e.session)
      .filter((s) => s.userId === userId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, limit);
  },

  /**
   * Claim the exclusive right to drive one session, or discover it is taken.
   *
   * A mobile money session can be confirmed from three places at once: the
   * customer retrying, the payment.succeeded consumer, and the reconciliation
   * sweep. A status guard alone is check-then-act — all three read
   * PAYMENT_PENDING and all three run the saga.
   *
   * `SET NX EX` rather than a held connection: the lock has to expire on its
   * own, because the process holding it can die mid-saga and nothing would
   * release it.
   */
  async acquireLock(sessionId: string, ttlSeconds = LOCK_TTL_SECONDS): Promise<boolean> {
    if (client && ready) {
      const res = await client.set(lockKey(sessionId), '1', { NX: true, EX: ttlSeconds });
      return res === 'OK';
    }

    const now = Date.now();
    for (const [key, expiresAt] of fallbackLocks) {
      if (expiresAt <= now) fallbackLocks.delete(key);
    }
    if (fallbackLocks.has(lockKey(sessionId))) return false;
    fallbackLocks.set(lockKey(sessionId), now + ttlSeconds * 1000);
    return true;
  },

  async releaseLock(sessionId: string): Promise<void> {
    if (client && ready) {
      await client.del(lockKey(sessionId));
      return;
    }
    fallbackLocks.delete(lockKey(sessionId));
  },

  /** Ids of sessions that entered PAYMENT_PENDING more than `ms` ago. */
  async findPendingOlderThan(ms: number): Promise<string[]> {
    const cutoff = Date.now() - ms;

    if (client && ready) {
      return client.zRangeByScore(PENDING_INDEX, 0, cutoff);
    }

    sweepFallback();
    return [...fallback.values()]
      .map((e) => e.session)
      .filter((s) => s.status === 'PAYMENT_PENDING' && new Date(s.updatedAt).getTime() <= cutoff)
      .map((s) => s.id);
  },

  /**
   * Drop an id from the pending index.
   *
   * For the case the sweep exists to surface: the session key has expired but
   * the index still lists it, which means a customer was charged for a checkout
   * that no longer exists. The entry is removed so the sweep does not re-report
   * it every minute; the sweep logs it before calling this.
   */
  async forgetPending(sessionId: string): Promise<void> {
    if (client && ready) await client.zRem(PENDING_INDEX, sessionId);
  },
};
