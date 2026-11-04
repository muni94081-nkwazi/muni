import { PrismaClient } from '../generated/prisma/index.js';

// ─── Singleton Prisma Client ──────────────────────────────────────────────────
//
// One PrismaClient per process; Prisma manages its own pool (default 10). Tune
// with the DATABASE_URL query param: ?connection_limit=20
//
// Attached to globalThis in development so `tsx watch` does not open a fresh
// pool on every file change.

const globalWithPrisma = globalThis as typeof globalThis & {
  __discountPrisma?: PrismaClient;
};

function createPrismaClient(): PrismaClient {
  return new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  });
}

export const prisma: PrismaClient =
  globalWithPrisma.__discountPrisma ?? createPrismaClient();

if (process.env.NODE_ENV === 'development') {
  globalWithPrisma.__discountPrisma = prisma;
}

let connected = false;

export async function connectDB(): Promise<void> {
  await prisma.$connect();
  connected = true;
}

export async function disconnectDB(): Promise<void> {
  await prisma.$disconnect();
  connected = false;
}

/** Backs /health/ready — reports whether the pool is usable, not merely open. */
export function isDBReady(): boolean {
  return connected;
}
