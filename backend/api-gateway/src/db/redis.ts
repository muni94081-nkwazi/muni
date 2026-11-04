import { createClient } from 'redis';

// ─── Redis Client Singleton ───────────────────────────────────────────────────
// Uses node-redis v4. Connection is established once at gateway startup.

const REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379';

let client: ReturnType<typeof createClient> | null = null;
let isConnected = false;

export async function connectRedis(): Promise<void> {
  client = createClient({
    url: REDIS_URL,
    socket: {
      // node-redis's default strategy retries forever and never rejects
      // connect(), which would block gateway startup indefinitely when
      // Redis is unavailable. Give up after 3 tries so connect() rejects
      // and the caller's non-fatal fallback (in-memory rate limiting) runs.
      reconnectStrategy: (retries) => (retries >= 3 ? new Error('Redis unavailable') : Math.min(retries * 100, 1000)),
    },
  });

  client.on('error',        (err) => console.error('[redis] Error:', err.message));
  client.on('connect',      ()    => console.log('[redis] Connecting…'));
  client.on('ready',        ()    => { isConnected = true;  console.log('[redis] ✅ Ready'); });
  client.on('end',          ()    => { isConnected = false; console.warn('[redis] Connection closed'); });
  client.on('reconnecting', ()    => console.warn('[redis] Reconnecting…'));

  await client.connect();
}

export async function disconnectRedis(): Promise<void> {
  await client?.quit();
  isConnected = false;
  console.log('[redis] Disconnected');
}

export function getRedisClient() {
  if (!client || !isConnected) return null;
  return client;
}

export function isRedisReady(): boolean {
  return isConnected;
}
