import 'dotenv/config';
import express from 'express';
import { internalCors } from '../../../shared/http/internal-cors.js';
import { logger } from './utils/logger.js';
import routes from './routes/index.js';
import { currencyService } from './services/currency.service.js';
import { connectProducer, disconnectProducer } from '../../../shared/kafka/producer.js';
import { connectRatesCache, disconnectRatesCache } from './cache/rates.cache.js';
// @ts-ignore
import { mountHealthRoutes } from '../../../shared/health/health-check.js';

const app = express();
const port = process.env.PORT || 4013;

app.use(internalCors());
app.use(express.json());

// Add Health Routes
if (typeof mountHealthRoutes === 'function') {
  mountHealthRoutes('currency-service', []);
} else {
  app.get('/health', (_req, res) => res.json({ service: 'currency-service', status: 'up' }));
  app.get('/health/live', (_req, res) => res.json({ service: 'currency-service', status: 'up' }));
  // Ready, but honest about what it is quoting. Rates have a fallback, so an
  // unreachable Redis degrades conversion rather than stopping it — the
  // response says which, and how old the numbers are.
  app.get('/health/ready', async (_req, res) => {
    const view = await currencyService.getAllRates();
    res.json({
      service: 'currency-service',
      ready: true,
      rates: { source: view.source, ageSeconds: view.ageSeconds, stale: view.stale },
    });
  });
}

// API Routes
app.use('/api/v1', routes);

// Error Handler
app.use((
  error: Error & { status?: number; issues?: unknown },
  _req: express.Request,
  res: express.Response,
  _next: express.NextFunction,
) => {
  if (error.name === 'ZodError') {
    res.status(422).json({ message: 'Validation failed', issues: error.issues });
    return;
  }
  logger.error('Unhandled error', { error: error.message, stack: error.stack });
  res.status(error.status ?? 500).json({ message: error.message ?? 'Internal server error' });
});

let server: any;

async function bootstrap() {
  // Non-fatal, unlike the Postgres-backed services: rates fall back to the
  // built-in table, so an unreachable Redis degrades conversion instead of
  // taking checkout down with it. It is logged loudly either way.
  await connectRatesCache();

  try {
    await connectProducer();
  } catch (err) {
    logger.warn('Kafka unavailable');
  }

  await currencyService.startRateRefresh();

  server = app.listen(port, () => {
    logger.info(`Currency Service listening on port ${port}`);
  });
}

async function shutdown(signal: string) {
  logger.info(`${signal} received — shutting down`);
  currencyService.stopRateRefresh();
  
  try {
    await disconnectProducer();
  } catch (err) {
    // Ignore
  }

  await disconnectRatesCache().catch(() => { /* already closing */ });

  if (server) {
    server.close(() => process.exit(0));
  } else {
    process.exit(0);
  }
  
  setTimeout(() => process.exit(1), 10000);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

bootstrap().catch(err => {
  logger.error('Failed to start service', { error: err });
  process.exit(1);
});
