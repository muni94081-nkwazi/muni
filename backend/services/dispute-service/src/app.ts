import express from 'express';
import { logger } from './utils/logger.js';
import { router as routes } from './routes/index.js';
import { startSlaEscalationWorker, stopSlaEscalationWorker } from './workers/sla-escalation.worker.js';
import { connectDB, disconnectDB, prisma } from './db/prisma.js';
import { env } from './config/env.js';
import { assertInternalIdentityConfigured } from '../../../shared/http/service-auth.middleware.js';

const app = express();
app.use(express.json());

app.get('/health', (_req, res) => res.json({ service: 'dispute-service', status: 'up' }));
app.get('/health/live', (_req, res) => res.json({ service: 'dispute-service', status: 'up' }));

// Readiness now means something: the service cannot record a claim without the
// database, so reporting ready while it is unreachable would have the load
// balancer send buyers to a replica that 500s on every filing.
app.get('/health/ready', async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ service: 'dispute-service', ready: true, db: 'connected' });
  } catch {
    res.status(503).json({ service: 'dispute-service', ready: false, db: 'disconnected' });
  }
});

app.use('/api/v1', routes);

app.use((error: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  if (error.name === 'ZodError') {
    res.status(422).json({ message: 'Validation failed', issues: error.issues });
    return;
  }
  logger.error('Unhandled error', { error: error.message, stack: error.stack });
  res.status(error.status ?? 500).json({ message: error.message ?? 'Internal server error' });
});

// Connect before binding the port. A dispute-service that accepts filings it
// cannot durably record is worse than one that is plainly down — the buyer
// believes their claim is open, but no escrow hold was ever placed.
async function start(): Promise<void> {
  // Without the signing secret the route guards degrade to trusting x-user-id,
  // which would put this service back where it started: a caller who can reach
  // the port could read, answer or arbitrate any dispute by naming themselves
  // in a header. Fatal in production, a warning elsewhere.
  assertInternalIdentityConfigured('dispute-service');

  await connectDB();

  startSlaEscalationWorker();

  const server = app.listen(env.port, () => {
    logger.info(`dispute-service listening on port ${env.port}`);
  });

  async function shutdown(signal: string): Promise<void> {
    logger.info(signal + ' received — shutting down');
    stopSlaEscalationWorker();
    await disconnectDB().catch(() => { /* already closing */ });
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(1), 10000);
  }

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

start().catch((err) => {
  logger.error('[dispute-service] Fatal startup error', { error: (err as Error).message });
  process.exit(1);
});

export default app;
