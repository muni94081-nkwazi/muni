/**
 * MUNI Platform — Redis Cluster Configuration
 * Supports single-node dev and multi-node cluster for production.
 * Provides named connection pools for different use-cases.
 */

import { createClient, createCluster, type RedisClientType } from 'redis';

// ─── Connection Pool Types ────────────────────────────────────────────────────

export type RedisPoolName =
  | 'session'       // user sessions + JWT blacklist
  | 'rate-limit'    // API rate limiting windows
  | 'query-cache'   // service-level query results
  | 'cart'          // cart-service (separate for TTL isolation)
  | 'pubsub';       // pub/sub for real-time features

// ─── Connection Config ────────────────────────────────────────────────────────

function getRedisUrl(pool: RedisPoolName): string {
  const base = process.env.REDIS_URL ?? 'redis://localhost:6379';
  // In production with Redis Cluster, different pools could use different nodes.
  // Override per-pool via REDIS_<POOL>_URL env vars.
  const poolUrl = process.env[`REDIS_${pool.toUpperCase().replace('-', '_')}_URL`];
  return poolUrl ?? base;
}

// ─── Singleton Clients ────────────────────────────────────────────────────────

const clients = new Map<RedisPoolName, RedisClientType>();
const readyState = new Map<RedisPoolName, boolean>();

export async function connectRedisPool(pool: RedisPoolName): Promise<RedisClientType> {
  if (clients.has(pool)) return clients.get(pool)!;

  const url = getRedisUrl(pool);
  const client = createClient({ url }) as RedisClientType;

  client.on('error',        (e) => console.error(`[redis:${pool}] Error: ${e.message}`));
  client.on('ready',        ()  => { readyState.set(pool, true);  console.log(`[redis:${pool}] ✅ Ready`); });
  client.on('end',          ()  => { readyState.set(pool, false); console.warn(`[redis:${pool}] Disconnected`); });
  client.on('reconnecting', ()  => console.warn(`[redis:${pool}] Reconnecting...`));

  await client.connect();
  clients.set(pool, client);
  return client;
}

export function getRedisPool(pool: RedisPoolName): RedisClientType | null {
  return clients.get(pool) ?? null;
}

export function isPoolReady(pool: RedisPoolName): boolean {
  return readyState.get(pool) === true;
}

export async function disconnectRedisPool(pool: RedisPoolName): Promise<void> {
  const client = clients.get(pool);
  if (client) {
    await client.quit();
    clients.delete(pool);
    readyState.delete(pool);
  }
}

export async function disconnectAllPools(): Promise<void> {
  await Promise.all(
    Array.from(clients.keys()).map(pool => disconnectRedisPool(pool))
  );
}

// ─── Health Check ─────────────────────────────────────────────────────────────

export function getRedisHealthStatus(): Record<RedisPoolName, 'up' | 'down'> {
  const pools: RedisPoolName[] = ['session', 'rate-limit', 'query-cache', 'cart', 'pubsub'];
  return Object.fromEntries(
    pools.map(pool => [pool, isPoolReady(pool) ? 'up' : 'down'])
  ) as Record<RedisPoolName, 'up' | 'down'>;
}

// ─── Cluster Config (for production scaling) ──────────────────────────────────
//
// Set REDIS_CLUSTER=true and REDIS_CLUSTER_NODES=host1:6379,host2:6379,host3:6379
// to enable Redis Cluster mode (primary/replica sharding across nodes).

export function createRedisClusterClient() {
  const clusterNodes = (process.env.REDIS_CLUSTER_NODES ?? '')
    .split(',')
    .filter(Boolean)
    .map(node => {
      const [host, port] = node.split(':');
      return { url: `redis://${host}:${port ?? 6379}` };
    });

  if (clusterNodes.length === 0) {
    throw new Error('REDIS_CLUSTER_NODES must be set when REDIS_CLUSTER=true');
  }

  return createCluster({
    rootNodes: clusterNodes,
    defaults: { socket: { reconnectStrategy: (retries) => Math.min(retries * 100, 3000) } },
  });
}
