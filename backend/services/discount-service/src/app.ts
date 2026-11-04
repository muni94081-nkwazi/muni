import express from 'express';
import { internalCors } from '../../../shared/http/internal-cors.js';
import { logger } from './utils/logger.js';
import routes from './routes/index.js';
import { connectProducer, disconnectProducer } from '../../../shared/kafka/producer.js';
import { connectDB, disconnectDB, isDBReady } from './db/prisma.js';

const app = express();
const PORT = process.env.PORT || 4015;

app.use(internalCors());
app.use(express.json());

app.get('/health', (_req, res) => res.json({ service: 'discount-service', status: 'up' }));
app.get('/health/live', (_req, res) => res.json({ service: 'discount-service', status: 'up' }));
// Readiness reflects the database: discounts are no longer answerable
// without it. /health/live stays a pure liveness signal — it is what the
// compose healthcheck probes, so a Postgres blip must not restart the
// container.
app.get('/health/ready', (_req, res) => {
  const dbRequired = Boolean(process.env.DATABASE_URL);
  const dbOk = !dbRequired || isDBReady();
  res.status(dbOk ? 200 : 503).json({
    service: 'discount-service',
    ready: dbOk,
    postgres: dbRequired ? (dbOk ? 'up' : 'down') : 'not-configured',
  });
});

app.use(routes);

app.use((error: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  if (error.name === 'ZodError') {
    res.status(422).json({ message: 'Validation failed', issues: error.issues });
    return;
  }
  logger.error('Unhandled error', { error: error.message, stack: error.stack });
  res.status(error.status ?? 500).json({ message: error.message ?? 'Internal server error' });
});

let server: any;

async function start() {
  try {
    if (process.env.DATABASE_URL) {
      try {
        await connectDB();
        logger.info('Postgres connected');
      } catch (err) {
        // Fatal in production: this service now owns durable state, and
        // serving reads that silently return nothing is worse than refusing
        // to start.
        if (process.env.NODE_ENV === 'production') {
          logger.error('Failed to connect to Postgres — exiting', { error: (err as Error).message });
          process.exit(1);
        }
        logger.warn('Postgres unavailable — continuing in degraded mode (dev only)', { error: (err as Error).message });
      }
    }

    try {
      await connectProducer();
    } catch (err) {
      logger.warn('Kafka unavailable');
    }
    server = app.listen(PORT, () => {
      logger.info(`discount-service listening on port ${PORT}`);
    });
  } catch (error) {
    logger.error('Failed to start server', error);
    process.exit(1);
  }
}

async function shutdown(signal: string) {
  logger.info(`${signal} received — shutting down`);
  await disconnectProducer();
  await disconnectDB().catch(() => {});
  if (server) {
    server.close(() => process.exit(0));
  } else {
    process.exit(0);
  }
  setTimeout(() => process.exit(1), 10000);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

start();
