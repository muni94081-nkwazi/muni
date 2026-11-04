import { logger } from '../utils/logger.js';
import mongoose from 'mongoose';

// ─── Mongoose Connection ───────────────────────────────────────────────────────
//
// A single connection is reused across the process. Mongoose manages its own
// connection pool internally (default: 100 sockets).

mongoose.set('strictQuery', true);

const MONGODB_URI = process.env.MONGODB_URI ?? 'mongodb://localhost:27017/muni_orders';

/**
 * Connect to MongoDB. Call once on service startup before app.listen().
 * Throws on connection failure so the process exits early with a clear error.
 */
export async function connectDB(): Promise<void> {
  await mongoose.connect(MONGODB_URI);
  logger.info('✅ MongoDB connected via Mongoose');
}

/**
 * Gracefully disconnect. Call in SIGINT / SIGTERM handlers.
 */
export async function disconnectDB(): Promise<void> {
  await mongoose.disconnect();
  logger.info('MongoDB disconnected');
}

export function isDBReady(): boolean {
  return mongoose.connection.readyState === 1; // 1 = connected
}
