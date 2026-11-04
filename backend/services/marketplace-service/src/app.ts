import express from 'express';
import { logger } from './utils/logger.js';
import routes from './routes/index.js';
import { connectDB, disconnectDB, prisma } from './db/prisma.js';

const app = express();
app.use(express.json());

app.get('/health', (_req, res) => res.json({ service: 'marketplace-service', status: 'up' }));
app.get('/health/live', (_req, res) => res.json({ service: 'marketplace-service', status: 'up' }));
app.get('/health/ready', async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ service: 'marketplace-service', ready: true, db: 'connected' });
  } catch {
    res.status(503).json({ service: 'marketplace-service', ready: false, db: 'disconnected' });
  }
});

app.use('/api/v1', routes);

app.use((error: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  // A rejected body is the caller's problem, not a server fault. Matches the
  // 422 the other services return so clients can treat validation uniformly.
  if (error?.name === 'ZodError') {
    res.status(422).json({
      success: false,
      message: 'Validation failed',
      issues: error.issues,
    });
    return;
  }

  logger.error('Unhandled error', { error: error.message, stack: error.stack });
  res.status(error.status ?? 500).json({ message: error.message ?? 'Internal server error' });
});

const PORT = process.env.PORT || 4022;
async function start(): Promise<void> {
  await connectDB();

  const server = app.listen(PORT, () => {
    logger.info(`marketplace-service listening on port ${PORT}`);
  });

  async function shutdown(signal: string): Promise<void> {
    logger.info(`${signal} received — shutting down`);
    await disconnectDB().catch(() => { /* already closing */ });
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(1), 10000);
  }

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));

  /**
   * A promise nobody caught must not take the service down.
   *
   * Node exits the process on an unhandled rejection by default, so a single
   * async throw that missed a try/catch ended the service for every seller —
   * which is exactly what one malformed create-store body did. The validation
   * above closes that specific hole; this is the backstop for the next one.
   *
   * Deliberately NOT applied to uncaughtException: a synchronous throw can
   * leave real corrupt state, and continuing after one is how a process ends up
   * serving nonsense. A stray rejection is a different, recoverable class.
   */
  process.on('unhandledRejection', (reason) => {
    logger.error('Unhandled promise rejection — staying up', {
      error: reason instanceof Error ? reason.message : String(reason),
      stack: reason instanceof Error ? reason.stack : undefined,
    });
  });
}

start().catch((err) => {
  logger.error('[marketplace-service] Fatal startup error', { error: (err as Error).message });
  process.exit(1);
});

export default app;
