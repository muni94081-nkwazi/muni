// ─── Shared short-lived key/value store ───────────────────────────────────────
//
// One Redis connection, shared by every security throttle and handshake record
// in this service: MFA attempt counters, password-reset attempt counters, and
// the OAuth state/exchange records.
//
// Everything stored here is short-lived and reconstructible — a counter, a
// nonce, a 60-second exchange code. None of it is durable state, which is why
// an in-process fallback is an acceptable degradation rather than data loss.
//
// The fallback caveat is the same one it has always been, and it matters more
// for OAuth than for MFA: with N replicas behind a load balancer, a handshake
// that starts on replica A and returns to replica B will not find its nonce in
// B's memory, so the login fails closed. Redis is required in production.

import { createClient, type RedisClientType } from 'redis';

let client: RedisClientType | null = null;
let ready = false;

interface Entry { value: string; expiresAt: number }
const fallback = new Map<string, Entry>();

/** Entries carry their own expiry and are swept on access, so a burst of
 *  distinct keys cannot grow the map without bound. */
function sweep(now: number): void {
  for (const [key, entry] of fallback) {
    if (entry.expiresAt <= now) fallback.delete(key);
  }
}

export async function connectRedisStore(): Promise<void> {
  try {
    client = createClient({
      url: process.env.REDIS_URL ?? 'redis://localhost:6379',
      socket: { reconnectStrategy: (r) => (r >= 3 ? new Error('unavailable') : Math.min(r * 100, 1000)) },
    }) as RedisClientType;

    client.on('error', (e) => console.error('[redis-store] Redis error:', e.message));
    client.on('ready', () => { ready = true; });
    client.on('end',   () => { ready = false; });

    await client.connect();
    console.log('[auth-service] ✅ Security store connected to Redis');
  } catch (err) {
    ready = false;
    console.warn(
      '[auth-service] ⚠️  Security store falling back to in-process memory: ' +
      `${(err as Error).message}. Attempt limits and OAuth handshake state will ` +
      'NOT be shared across replicas.',
    );
  }
}

export async function disconnectRedisStore(): Promise<void> {
  try { await client?.quit(); } catch { /* already closed */ }
  ready = false;
}

/** True when Redis is actually carrying the state, rather than the fallback. */
export function isRedisReady(): boolean {
  return Boolean(client) && ready;
}

// ─── Counters ─────────────────────────────────────────────────────────────────

export async function incrementWithExpiry(
  key: string,
  windowSec: number,
): Promise<number> {
  if (client && ready) {
    const attempts = await client.incr(key);
    if (attempts === 1) await client.expire(key, windowSec);
    return attempts;
  }

  const now = Date.now();
  sweep(now);
  const entry = fallback.get(key);
  if (!entry || entry.expiresAt <= now) {
    fallback.set(key, { value: '1', expiresAt: now + windowSec * 1000 });
    return 1;
  }
  const next = Number(entry.value) + 1;
  entry.value = String(next);
  return next;
}

// ─── Values ───────────────────────────────────────────────────────────────────

export async function readValue(key: string): Promise<string | null> {
  if (client && ready) return client.get(key);

  const entry = fallback.get(key);
  if (!entry || entry.expiresAt <= Date.now()) return null;
  return entry.value;
}

export async function writeValue(key: string, value: string, ttlSec: number): Promise<void> {
  if (client && ready) { await client.set(key, value, { EX: ttlSec }); return; }

  const now = Date.now();
  sweep(now);
  fallback.set(key, { value, expiresAt: now + ttlSec * 1000 });
}

/**
 * Write only if the key is absent. Returns false when it was already taken —
 * which is how a single-use code is claimed without a read-then-write race.
 */
export async function claimKey(key: string, value: string, ttlSec: number): Promise<boolean> {
  if (client && ready) {
    return (await client.set(key, value, { NX: true, EX: ttlSec })) === 'OK';
  }

  const now = Date.now();
  sweep(now);
  if (fallback.has(key)) return false;
  fallback.set(key, { value, expiresAt: now + ttlSec * 1000 });
  return true;
}

export async function deleteKey(key: string): Promise<void> {
  if (client && ready) { await client.del(key); return; }
  fallback.delete(key);
}

/**
 * Read a value and delete it in the same step, so it can only be redeemed once.
 * Returns null when the key was absent, expired, or already consumed.
 *
 * On Redis this uses GETDEL, which is atomic — two concurrent redemptions of
 * the same OAuth exchange code cannot both succeed. The fallback path is
 * single-threaded within a process, so the read-then-delete is equivalent
 * there.
 */
export async function consumeValue(key: string): Promise<string | null> {
  if (client && ready) {
    return client.getDel(key);
  }

  const now = Date.now();
  sweep(now);
  const entry = fallback.get(key);
  if (!entry || entry.expiresAt <= now) return null;
  fallback.delete(key);
  return entry.value;
}
