import 'dotenv/config';
import express from 'express';
import { internalCors } from '../../../shared/http/internal-cors.js';
import { logger } from './utils/logger.js';
import routes from './routes/index.js';
import { assertInternalIdentityConfigured } from './middleware/auth.middleware.js';
// @ts-ignore
import { mountHealthRoutes } from '../../../shared/health/health-check.js';

const app = express();
const port = process.env.PORT || 4014;

app.use(internalCors());
app.use(express.json());

// Add Health Routes
if (typeof mountHealthRoutes === 'function') {
  mountHealthRoutes('tax-service', []);
} else {
  app.get('/health', (_req, res) => res.json({ service: 'tax-service', status: 'up' }));
  app.get('/health/live', (_req, res) => res.json({ service: 'tax-service', status: 'up' }));
  app.get('/health/ready', (_req, res) => res.json({ service: 'tax-service', ready: true }));
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

function bootstrap() {
  // Without the signing secret the shared middleware falls back to trusting
  // plain x-user-id headers, and on this service that is the difference between
  // "your own invoices" and "anyone's" — names, addresses and TINs included.
  assertInternalIdentityConfigured('tax-service');

  server = app.listen(port, () => {
    logger.info(`Tax Service listening on port ${port}`);
  });
}

function shutdown(signal: string) {
  logger.info(`${signal} received — shutting down`);
  
  if (server) {
    server.close(() => process.exit(0));
  } else {
    process.exit(0);
  }
  
  setTimeout(() => process.exit(1), 10000);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

bootstrap();
