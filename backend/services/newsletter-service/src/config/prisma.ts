import { PrismaClient } from '../generated/prisma/index.js';
import env from './env.js';

export const prisma = new PrismaClient({
  log: env.nodeEnv === 'development' ? ['warn', 'error'] : ['error'],
});

export default prisma;
