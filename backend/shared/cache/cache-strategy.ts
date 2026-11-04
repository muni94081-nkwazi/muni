import { cache } from './redis.js';

export const CACHE_TTL = {
  PRODUCT_CATALOG: 5 * 60,       // 5 minutes (300s)
  USER_SESSIONS:   24 * 60 * 60, // 24 hours (86400s)
  API_RESPONSES:   60,           // 1 minute (60s)
  RECOMMENDATIONS: 60 * 60,      // 1 hour (3600s)
  ANALYTICS:       5 * 60,       // 5 minutes (300s)
};

/**
 * Cache-Aside Strategy Pattern:
 * 1. Check Redis cache first.
 * 2. On cache hit: return cached data immediately.
 * 3. On cache miss: execute dbFetcher(), store result in Redis with TTL, and return data.
 */
export async function getOrSetCache<T>(
  key: string,
  ttlSeconds: number,
  dbFetcher: () => Promise<T>
): Promise<T> {
  return cache.getOrSet(key, ttlSeconds, dbFetcher);
}

/**
 * Write-Through Cache Strategy Pattern:
 * 1. Writes data to primary database store via dbSaver().
 * 2. Updates Redis cache atomically with new value and TTL.
 */
export async function writeThroughCache<T>(
  key: string,
  ttlSeconds: number,
  data: T,
  dbSaver: (data: T) => Promise<T>
): Promise<T> {
  const savedData = await dbSaver(data);
  // `cache.set` takes (key, value, ttlSeconds) and serialises the value
  // itself — this was calling it ioredis-style with a pre-stringified value and
  // a separate 'EX' flag, which is both the wrong arity and a double encode.
  await cache.set(key, savedData, ttlSeconds);
  return savedData;
}

/**
 * Invalidate multiple cache keys matching pattern
 */
export async function invalidateCacheKeys(...keys: string[]): Promise<void> {
  if (keys.length > 0) {
    await cache.del(...keys);
  }
}
