import { PrismaClient } from '../generated/prisma/index.js';

// ─── Singleton Prisma Client ──────────────────────────────────────────────────
//
// A single PrismaClient is reused across the entire Node.js process.
// Prisma manages its own connection pool internally (default: 10 connections).
// Adjust pool size via the DATABASE_URL query param:
//   postgresql://user:pass@host/db?connection_limit=20
//
// We attach it to `globalThis` in development so that hot-reloading
// (tsx watch) doesn't open a new pool on every file change.

const globalWithPrisma = globalThis as typeof globalThis & {
  __prisma?: PrismaClient;
};

function createPrismaClient(): PrismaClient {
  return new PrismaClient({
    log:
      process.env.NODE_ENV === 'development'
        ? ['warn', 'error']
        : ['error'],
  });
}

export const prisma: PrismaClient =
  globalWithPrisma.__prisma ?? (globalWithPrisma.__prisma = createPrismaClient());

/**
 * Connect to the database. Call once on service startup before app.listen().
 * Throws on connection failure so the process exits early with a clear error.
 */
export async function connectDB(): Promise<void> {
  await prisma.$connect();
  console.log('[auth-service] ✅ PostgreSQL connected via Prisma');
}

/**
 * Gracefully disconnect. Call in SIGINT / SIGTERM handlers.
 */
export async function disconnectDB(): Promise<void> {
  await prisma.$disconnect();
  console.log('[auth-service] PostgreSQL disconnected');
}
