import { PrismaClient } from '../generated/prisma/index.js';
import env from './env.js';

// A single shared Prisma instance, reused across the app instead of
// instantiating a new client (and connection pool) per request.
export const prisma = new PrismaClient({
  log: env.nodeEnv === 'development' ? ['warn', 'error'] : ['error'],
});

export default prisma;
