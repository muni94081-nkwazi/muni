import { jest, describe, it, expect, beforeEach } from '@jest/globals';

// ─── Redis double ─────────────────────────────────────────────────────────────

const store = new Map<string, unknown>();
let redisThrows = false;

jest.unstable_mockModule('../../../../shared/cache/redis.js', () => ({
  cache: {
    async get(key: string) {
      if (redisThrows) throw new Error('redis down');
      return store.has(key) ? store.get(key) : null;
    },
    async set(key: string, value: unknown) {
      if (redisThrows) throw new Error('redis down');
      store.set(key, value);
    },
    // Atomic claim — the whole point of the stampede lock. Single-threaded JS
    // makes has()+set() atomic here, which faithfully models Redis SET NX.
    async setNx(key: string, _ttl: number, value = '1') {
      if (redisThrows) return true;   // mirrors the real fail-open behaviour
      if (store.has(key)) return false;
      store.set(key, value);
      return true;
    },
    async del(...keys: string[]) {
      for (const k of keys) store.delete(k);
    },
    async getOrSet() { throw new Error('not used'); },
    async delPattern() { /* not used */ },
  },
  connectCache: jest.fn(), disconnectCache: jest.fn(), isCacheReady: () => true,
}));

const { cached, entityVersion, bumpEntityVersion } =
  await import('../../../../shared/cache/protected-cache.js');

beforeEach(() => {
  store.clear();
  redisThrows = false;
  jest.clearAllMocks();
});

describe('cached() — basic cache-aside', () => {
  it('calls the fetcher on a miss and serves the hit from cache', async () => {
    const fetcher = jest.fn(async () => ({ id: 'p1' }));

    const first  = await cached('k', 300, fetcher);
    const second = await cached('k', 300, fetcher);

    expect(first).toEqual({ id: 'p1' });
    expect(second).toEqual({ id: 'p1' });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});

// ─── ② Cache penetration ──────────────────────────────────────────────────────

describe('cache penetration', () => {
  it('caches a null so a repeat lookup does not reach the database', async () => {
    const fetcher = jest.fn(async () => null);

    expect(await cached('missing', 300, fetcher)).toBeNull();
    expect(await cached('missing', 300, fetcher)).toBeNull();

    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('absorbs a bot scanning many non-existent ids on the second pass', async () => {
    const fetcher = jest.fn(async () => null);
    const ids = Array.from({ length: 50 }, (_, i) => `ghost-${i}`);

    for (const id of ids) await cached(id, 300, fetcher);
    for (const id of ids) await cached(id, 300, fetcher);

    // 50 real lookups, not 100.
    expect(fetcher).toHaveBeenCalledTimes(50);
  });

  it('can be told not to cache nulls', async () => {
    const fetcher = jest.fn(async () => null);

    await cached('k', 300, fetcher, { cacheNulls: false });
    await cached('k', 300, fetcher, { cacheNulls: false });

    expect(fetcher).toHaveBeenCalledTimes(2);
  });
});

// ─── ① Cache stampede ─────────────────────────────────────────────────────────

describe('cache stampede', () => {
  it('collapses concurrent misses onto a single computation', async () => {
    let running = 0;
    let maxConcurrent = 0;

    const fetcher = jest.fn(async () => {
      running++;
      maxConcurrent = Math.max(maxConcurrent, running);
      await new Promise((r) => setTimeout(r, 60));
      running--;
      return { id: 'p1' };
    });

    const results = await Promise.all(
      Array.from({ length: 25 }, () => cached('hot-key', 300, fetcher)),
    );

    // Without the lock all 25 would hit the database at once.
    expect(maxConcurrent).toBe(1);
    expect(results.every((r) => JSON.stringify(r) === JSON.stringify({ id: 'p1' }))).toBe(true);
  });

  it('lets followers proceed rather than hang when the holder is slow', async () => {
    // Holder exceeds the follower poll budget (~1s).
    const slow = jest.fn(async () => {
      await new Promise((r) => setTimeout(r, 1_400));
      return { id: 'slow' };
    });

    const results = await Promise.all([
      cached('slow-key', 300, slow),
      cached('slow-key', 300, slow),
    ]);

    // Both resolve — a duplicate query beats a hung request.
    expect(results[0]).toEqual({ id: 'slow' });
    expect(results[1]).toEqual({ id: 'slow' });
  }, 10_000);

  it('can be disabled for cheap fetchers where the lock costs more', async () => {
    const fetcher = jest.fn(async () => ({ id: 'p1' }));

    await Promise.all(
      Array.from({ length: 5 }, () => cached('k', 300, fetcher, { preventStampede: false })),
    );

    expect(fetcher.mock.calls.length).toBeGreaterThan(1);
  });
});

// ─── ③ Thundering herd ────────────────────────────────────────────────────────

describe('thundering herd', () => {
  it('jitters TTLs so keys written together do not expire together', async () => {
    const ttls: number[] = [];

    const { cache } = await import('../../../../shared/cache/redis.js');
    const setSpy = jest.spyOn(cache, 'set').mockImplementation(async (k, v, ttl) => {
      // Only value keys — lock keys carry their own fixed 10s TTL and would
      // otherwise pollute the jitter distribution being measured.
      if (typeof ttl === 'number' && !String(k).startsWith('lock:')) ttls.push(ttl);
      store.set(k as string, v);
    });

    for (let i = 0; i < 40; i++) {
      await cached(`key-${i}`, 300, async () => ({ i }));
    }

    setSpy.mockRestore();

    const unique = new Set(ttls);
    expect(unique.size).toBeGreaterThan(5);        // genuinely spread
    expect(Math.min(...ttls)).toBeGreaterThanOrEqual(240);   // 300 × 0.8
    expect(Math.max(...ttls)).toBeLessThanOrEqual(360);      // 300 × 1.2
  });
});

// ─── Redis outage ─────────────────────────────────────────────────────────────

describe('degradation', () => {
  it('falls back to the database when Redis is unavailable', async () => {
    redisThrows = true;
    const fetcher = jest.fn(async () => ({ id: 'p1' }));

    const result = await cached('k', 300, fetcher);

    expect(result).toEqual({ id: 'p1' });
    expect(fetcher).toHaveBeenCalled();
  });

  it('does not throw a cache error to the caller', async () => {
    redisThrows = true;
    await expect(cached('k', 300, async () => ({ ok: true }))).resolves.toEqual({ ok: true });
  });
});

// ─── Versioned invalidation ───────────────────────────────────────────────────

describe('versioned keys', () => {
  it('starts at version 1', async () => {
    expect(await entityVersion('product', 'p1')).toBe(1);
  });

  it('bumping the version orphans the old key instead of scanning for it', async () => {
    const v1 = await entityVersion('product', 'p1');
    await cached(`product:v${v1}:p1`, 300, async () => ({ name: 'old' }));

    await bumpEntityVersion('product', 'p1');

    const v2 = await entityVersion('product', 'p1');
    expect(v2).toBe(2);

    const fresh = await cached(`product:v${v2}:p1`, 300, async () => ({ name: 'new' }));
    expect(fresh).toEqual({ name: 'new' });
  });

  it('keeps versions independent per entity id', async () => {
    await bumpEntityVersion('product', 'p1');

    expect(await entityVersion('product', 'p1')).toBe(2);
    expect(await entityVersion('product', 'p2')).toBe(1);
  });
});
