import express from 'express';
import { logger } from './utils/logger.js';
import routes from './routes/index.js';
import { connectDB, disconnectDB, prisma } from './db/prisma.js';

const app = express();
app.use(express.json());

app.get('/health', (_req, res) => res.json({ service: 'fraud-service', status: 'up' }));
app.get('/health/live', (_req, res) => res.json({ service: 'fraud-service', status: 'up' }));
// Readiness means something now: an assessment this service cannot record is
// an order either blocked with no explanation or let through unflagged.
app.get('/health/ready', async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ service: 'fraud-service', ready: true, db: 'connected' });
  } catch {
    res.status(503).json({ service: 'fraud-service', ready: false, db: 'disconnected' });
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

async function start(): Promise<void> {
  await connectDB();

  const server = app.listen(4019, () => {
    logger.info('fraud-service listening on port 4019');
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
  logger.error('[fraud-service] Fatal startup error', { error: (err as Error).message });
  process.exit(1);
});

export default app;
