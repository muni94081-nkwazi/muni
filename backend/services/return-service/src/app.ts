import express from 'express';
import { logger } from './utils/logger.js';
import routes from './routes/index.js';
import { connectDB, disconnectDB, prisma } from './db/prisma.js';

const app = express();
app.use(express.json());

app.get('/health', (_req, res) => res.json({ service: 'return-service', status: 'up' }));
app.get('/health/live', (_req, res) => res.json({ service: 'return-service', status: 'up' }));
// Readiness means something now: without the database this service cannot
// record a return, so reporting ready while it is unreachable would keep a
// replica in the load balancer that 500s on every RMA.
app.get('/health/ready', async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ service: 'return-service', ready: true, db: 'connected' });
  } catch {
    res.status(503).json({ service: 'return-service', ready: false, db: 'disconnected' });
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

// Connect before binding the port. A return-service that accepts RMAs it
// cannot durably record is worse than one that is plainly down: the buyer is
// told their refund is approved and no record of it survives.
async function start(): Promise<void> {
  await connectDB();

  const server = app.listen(4020, () => {
    logger.info('return-service listening on port 4020');
  });

  async function shutdown(signal: string): Promise<void> {
    logger.info(signal + ' received — shutting down');
    await disconnectDB().catch(() => { /* already closing */ });
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(1), 10000);
  }

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

start().catch((err) => {
  logger.error('[return-service] Fatal startup error', { error: (err as Error).message });
  process.exit(1);
});

export default app;
