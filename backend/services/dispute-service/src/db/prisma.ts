import { PrismaClient } from '../generated/prisma/index.js';

// ─── Singleton Prisma Client ──────────────────────────────────────────────────
//
// A single PrismaClient is reused across the process; Prisma manages its own
// connection pool (default 10). Tune via the DATABASE_URL query param:
//   postgresql://user:pass@host/db?connection_limit=20
//
// Attached to globalThis in development so `tsx watch` does not open a fresh
// pool on every file change.

const globalWithPrisma = globalThis as typeof globalThis & {
  __disputePrisma?: PrismaClient;
};

function createPrismaClient(): PrismaClient {
  return new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  });
}

export const prisma: PrismaClient =
  globalWithPrisma.__disputePrisma ?? (globalWithPrisma.__disputePrisma = createPrismaClient());

/**
 * Connect on startup, before app.listen().
 *
 * A missing database is fatal here, exactly as in payment-service. A dispute a
 * buyer believes they filed but which was never durably recorded is worse than
 * a service that is plainly down: the escrow hold is never placed, the seller's
 * payout is never frozen, and nobody finds out until the money is gone.
 */
export async function connectDB(): Promise<void> {
  await prisma.$connect();
  console.log('[dispute-service] ✅ PostgreSQL connected via Prisma');
}

export async function disconnectDB(): Promise<void> {
  await prisma.$disconnect();
  console.log('[dispute-service] PostgreSQL disconnected');
}
