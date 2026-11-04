import express from 'express';
import { logger } from './utils/logger.js';
import routes from './routes/index.js';
import { connectDB, disconnectDB, prisma } from './db/prisma.js';
import { assertInternalIdentityConfigured } from '../../../shared/http/service-auth.middleware.js';

const app = express();
app.use(express.json());

app.get('/health', (_req, res) => res.json({ service: 'fulfillment-service', status: 'up' }));
app.get('/health/live', (_req, res) => res.json({ service: 'fulfillment-service', status: 'up' }));
// Readiness means something now: without the database no cash collection can
// be recorded, and a rider handing in money against a replica that cannot
// write it is exactly the failure the cash ledger exists to prevent.
app.get('/health/ready', async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ service: 'fulfillment-service', ready: true, db: 'connected' });
  } catch {
    res.status(503).json({ service: 'fulfillment-service', ready: false, db: 'disconnected' });
  }
});

app.use('/api/v1', routes);

app.use((error: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  logger.error('Unhandled error', { error: error.message, stack: error.stack });
  res.status(error.status ?? 500).json({ message: error.message ?? 'Internal server error' });
});

const PORT = process.env.PORT || 4023;

async function start(): Promise<void> {
  // Before anything binds a port. Without a verifiable identity secret this
  // service falls back to trusting plain x-user-id/x-user-roles headers, and
  // those gate cash collection and the delivery state that releases a seller's
  // escrow — that is an authorization gap, not a degraded mode. Fatal in
  // production, a warning elsewhere.
  assertInternalIdentityConfigured('fulfillment-service');

  await connectDB();

  const server = app.listen(PORT, () => {
    logger.info(`fulfillment-service listening on port ${PORT}`);
  });

  async function shutdown(signal: string): Promise<void> {
    logger.info(`${signal} received — shutting down`);
    await disconnectDB().catch(() => { /* already closing */ });
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(1), 10000);
  }

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

start().catch((err) => {
  logger.error('[fulfillment-service] Fatal startup error', { error: (err as Error).message });
  process.exit(1);
});

export default app;
