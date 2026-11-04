import { PrismaClient } from '../generated/prisma/index.js';

// ─── Singleton Prisma Client ──────────────────────────────────────────────────
//
// One PrismaClient per process; Prisma manages its own pool (default 10). Tune
// with the DATABASE_URL query param: ?connection_limit=20
//
// Attached to globalThis in development so `tsx watch` does not open a fresh
// pool on every file change.

const globalWithPrisma = globalThis as typeof globalThis & {
  __wishlistPrisma?: PrismaClient;
};

function createPrismaClient(): PrismaClient {
  return new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  });
}

export const prisma: PrismaClient =
  globalWithPrisma.__wishlistPrisma ?? (globalWithPrisma.__wishlistPrisma = createPrismaClient());

/**
 * Connect on startup, before app.listen(). A missing database is fatal: a
 * service that accepts writes it cannot durably record is worse than one that
 * is plainly down, because nobody finds out until the data is needed.
 */
export async function connectDB(): Promise<void> {
  await prisma.$connect();
  console.log('[wishlist-service] ✅ PostgreSQL connected via Prisma');
}

export async function disconnectDB(): Promise<void> {
  await prisma.$disconnect();
  console.log('[wishlist-service] PostgreSQL disconnected');
}
