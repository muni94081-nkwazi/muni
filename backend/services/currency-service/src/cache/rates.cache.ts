import { Redis } from 'ioredis';
import { logger } from '../utils/logger.js';

// ─── Shared exchange-rate cache ───────────────────────────────────────────────
//
// Rates are NOT business records — they are a cache of data owned by Open
// Exchange Rates, refreshed on a timer. Putting them in Postgres would model
// them as something this service owns, which it does not. Redis is the right
// shape: shared, expiring, and cheap to refill.
//
// What it fixes, though, is a money problem. Every replica used to hold its own
// private Map and fetch on its own schedule, so two pods could answer the same
// conversion with different rates mid-refresh — and payment-service converts
// settlement amounts through this endpoint. One shared snapshot means every
// replica quotes the same number.
//
// The second problem is staleness. On restart, before the first successful
// fetch — or permanently, when OPEN_EXCHANGE_RATES_APP_ID is unset — the
// service served hardcoded rates that were current whenever the code was
// written, with nothing to distinguish them from live ones. The snapshot now
// carries where it came from and when, so a caller and an operator can both
// see it.

export type RateSource = 'live' | 'cache' | 'fallback';

export interface RateSnapshot {
  baseCurrency: string;
  rates: Record<string, number>;
  /** ISO-8601. When the rates were fetched from the provider. */
  fetchedAt: string;
  source: RateSource;
}

const REDIS_KEY = 'muni:currency:rates';

/**
 * How long a cached snapshot is served before a refresh is due. Twice the
 * refresh interval, so a single failed fetch does not immediately expire it.
 */
const CACHE_TTL_SECONDS = 12 * 60 * 60;

let client: Redis | null = null;

/** Last snapshot this process saw. Serves reads when Redis is unreachable. */
let memo: RateSnapshot | null = null;

function getClient(): Redis | null {
  if (client) return client;

  const url = process.env.REDIS_URL;
  if (!url) {
    logger.warn('[rates-cache] REDIS_URL not set — rates will not be shared between replicas');
    return null;
  }

  client = new Redis(url, {
    lazyConnect: true,
    maxRetriesPerRequest: 2,
    retryStrategy: (attempt: number) => Math.min(attempt * 200, 5000),
  });

  client.on('error', (err: Error) =>
    logger.error('[rates-cache] Redis error', { error: err.message }),
  );

  return client;
}

export async function connectRatesCache(): Promise<void> {
  const c = getClient();
  if (!c) return;

  // Deliberately non-fatal, unlike the Postgres services. Rates have a
  // fallback that still lets the service answer; refusing to start would take
  // conversion down entirely rather than degrade it.
  try {
    if (c.status !== 'ready' && c.status !== 'connecting') await c.connect();
    logger.info('[rates-cache] ✅ Redis connected');
  } catch (err) {
    logger.warn('[rates-cache] Redis unavailable — falling back to per-process rates', {
      error: (err as Error).message,
    });
  }
}

export async function disconnectRatesCache(): Promise<void> {
  if (!client) return;
  await client.quit().catch(() => { /* already closing */ });
  client = null;
}

/** Read the shared snapshot, falling back to whatever this process last saw. */
export async function readRates(): Promise<RateSnapshot | null> {
  const c = getClient();

  if (c) {
    try {
      const raw = await c.get(REDIS_KEY);
      if (raw) {
        const snapshot = JSON.parse(raw) as RateSnapshot;
        memo = snapshot;
        // Read back from the shared cache rather than fetched here.
        return { ...snapshot, source: snapshot.source === 'live' ? 'cache' : snapshot.source };
      }
    } catch (err) {
      logger.warn('[rates-cache] Read failed — using last known rates', {
        error: (err as Error).message,
      });
    }
  }

  return memo;
}

/** Publish a freshly fetched snapshot for every replica to use. */
export async function writeRates(snapshot: RateSnapshot): Promise<void> {
  memo = snapshot;

  const c = getClient();
  if (!c) return;

  try {
    await c.set(REDIS_KEY, JSON.stringify(snapshot), 'EX', CACHE_TTL_SECONDS);
  } catch (err) {
    logger.warn('[rates-cache] Write failed — this replica will use its own rates', {
      error: (err as Error).message,
    });
  }
}

/** Age of a snapshot in seconds, for staleness reporting. */
export function ageSeconds(snapshot: RateSnapshot): number {
  return Math.max(0, Math.round((Date.now() - new Date(snapshot.fetchedAt).getTime()) / 1000));
}

/** Test seam: drop the in-process memo and any client. */
export function resetRatesCacheForTests(): void {
  memo = null;
  client = null;
}
