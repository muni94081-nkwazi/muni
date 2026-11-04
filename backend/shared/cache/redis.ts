import { createClient, type RedisClientType } from 'redis';

// ─── Shared Redis Cache Helper ────────────────────────────────────────────────
//
// Provides a simple getOrSet() wrapper used by all services for caching.
// Each service creates its own connection (not shared between processes).
//
// Usage:
//   import { cache, connectCache } from '../../../shared/cache/redis.js';
//   await connectCache();
//   const product = await cache.getOrSet(`product:${id}`, 300, () => db.findProduct(id));

const REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379';

let client: RedisClientType | null = null;
let ready = false;

export async function connectCache(serviceName = 'service'): Promise<void> {
  client = createClient({ url: REDIS_URL }) as RedisClientType;

  client.on('error',        (e)  => console.error(`[cache:${serviceName}] Error:`, e.message));
  client.on('ready',        ()   => { ready = true;  console.log(`[cache:${serviceName}] ✅ Redis ready`); });
  client.on('end',          ()   => { ready = false; console.warn(`[cache:${serviceName}] Connection closed`); });
  client.on('reconnecting', ()   => console.warn(`[cache:${serviceName}] Reconnecting…`));

  await client.connect();
}

export async function disconnectCache(): Promise<void> {
  await client?.quit();
  ready = false;
}

export function isCacheReady(): boolean { return ready; }

// ─── Cache API ─────────────────────────────────────────────────────────────────

export const cache = {
  /**
   * Get the cached value for `key`, or fetch it via `fetcher` and cache it.
   * Returns the fetcher's result even if Redis is unavailable (graceful degradation).
   */
  async getOrSet<T>(
    key:       string,
    ttlSec:    number,
    fetcher:   () => Promise<T>,
  ): Promise<T> {
    if (client && ready) {
      try {
        const cached = await client.get(key);
        if (cached !== null) {
          return JSON.parse(cached) as T;
        }
      } catch (e) {
        console.warn(`[cache] Redis GET failed for "${key}":`, e);
      }
    }

    const value = await fetcher();

    if (client && ready) {
      try {
        await client.setEx(key, ttlSec, JSON.stringify(value));
      } catch (e) {
        console.warn(`[cache] Redis SET failed for "${key}":`, e);
      }
    }

    return value;
  },

  /** Invalidate one or more cache keys. */
  async del(...keys: string[]): Promise<void> {
    if (!client || !ready || keys.length === 0) return;
    try {
      await client.del(keys);
    } catch (e) {
      console.warn(`[cache] Redis DEL failed for [${keys.join(', ')}]:`, e);
    }
  },

  /** Invalidate all keys matching a glob pattern (uses SCAN to avoid blocking). */
  async delPattern(pattern: string): Promise<void> {
    if (!client || !ready) return;
    try {
      let cursor = 0;
      do {
        const result = await (client as unknown as { scan: (c: number, o: object) => Promise<{ cursor: number; keys: string[] }> })
          .scan(cursor, { MATCH: pattern, COUNT: 100 });
        cursor = result.cursor;
        if (result.keys.length > 0) await client.del(result.keys);
      } while (cursor !== 0);
    } catch (e) {
      console.warn(`[cache] Redis SCAN+DEL failed for pattern "${pattern}":`, e);
    }
  },

  /** Set a key with TTL directly (no fetcher). */
  async set<T>(key: string, value: T, ttlSec: number): Promise<void> {
    if (!client || !ready) return;
    try {
      await client.setEx(key, ttlSec, JSON.stringify(value));
    } catch (e) {
      console.warn(`[cache] Redis SET failed for "${key}":`, e);
    }
  },

  /**
   * Atomically claim a key (SET … NX EX). Returns true only for the caller
   * that created it.
   *
   * A `get` followed by a `set` is NOT equivalent: every concurrent caller
   * reads null before any of them writes, so all of them "acquire". Locking
   * needs the check and the write to be one operation.
   *
   * Returns true on a Redis error so callers degrade to doing the work rather
   * than blocking on a lock that can never be granted.
   */
  async setNx(key: string, ttlSec: number, value = '1'): Promise<boolean> {
    if (!client || !ready) return true;
    try {
      const result = await client.set(key, value, { NX: true, EX: ttlSec });
      return result === 'OK';
    } catch (e) {
      console.warn(`[cache] Redis SET NX failed for "${key}":`, e);
      return true;
    }
  },

  /** Get a key directly (returns null on miss or Redis error). */
  async get<T>(key: string): Promise<T | null> {
    if (!client || !ready) return null;
    try {
      const raw = await client.get(key);
      return raw ? (JSON.parse(raw) as T) : null;
    } catch (e) {
      console.warn(`[cache] Redis GET failed for "${key}":`, e);
      return null;
    }
  },
};
