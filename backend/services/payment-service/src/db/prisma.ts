import { PrismaClient } from '../generated/prisma/index.js';

// ─── Singleton Prisma Client ──────────────────────────────────────────────────
//
// A single PrismaClient is reused across the entire Node.js process. Prisma
// manages its own connection pool internally (default: 10 connections). Adjust
// pool size via the DATABASE_URL query param:
//   postgresql://user:pass@host/db?connection_limit=20
//
// We attach it to `globalThis` in development so that hot-reloading
// (tsx watch) doesn't open a new pool on every file change.

const globalWithPrisma = globalThis as typeof globalThis & {
  __paymentPrisma?: PrismaClient;
};

function createPrismaClient(): PrismaClient {
  return new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  });
}

export const prisma: PrismaClient =
  globalWithPrisma.__paymentPrisma ?? (globalWithPrisma.__paymentPrisma = createPrismaClient());

/**
 * Connect on startup, before app.listen().
 *
 * Unlike Redis and Kafka — which this service deliberately degrades past when
 * unavailable — a missing database is fatal. A payment service that accepts
 * requests it cannot durably record is worse than one that is plainly down.
 */
export async function connectDB(): Promise<void> {
  await prisma.$connect();
  console.log('[payment-service] ✅ PostgreSQL connected via Prisma');
}

export async function disconnectDB(): Promise<void> {
  await prisma.$disconnect();
  console.log('[payment-service] PostgreSQL disconnected');
}
