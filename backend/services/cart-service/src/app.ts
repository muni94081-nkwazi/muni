import express from 'express';
import { internalCors } from '../../../shared/http/internal-cors.js';
import dotenv from 'dotenv';
import { logger } from './utils/logger.js';
import { router as cartRoutes } from './routes/index.js';
import { redis } from './utils/redis.js';
import { abandonedCartService } from './services/abandoned-cart.service.js';

dotenv.config();

const app = express();
const port = process.env.PORT || 4017;

app.use(internalCors());
app.use(express.json());

// Health checks
app.get('/health', (_req, res) => { res.json({ service: 'cart-service', status: 'up' }); });
app.get('/health/live', (_req, res) => { res.json({ service: 'cart-service', status: 'up' }); });
app.get('/health/ready', (_req, res) => { 
  const ready = redis.status === 'ready';
  res.status(ready ? 200 : 503).json({ service: 'cart-service', ready }); 
});

app.use('/api/v1/cart', cartRoutes);

app.use((error: Error & { status?: number; issues?: unknown }, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  if (error.name === 'ZodError') {
    res.status(422).json({ message: 'Validation failed', issues: error.issues });
    return;
  }
  logger.error('Unhandled error', { error: error.message, stack: error.stack });
  res.status(error.status ?? 500).json({ message: error.message ?? 'Internal server error' });
});

const server = app.listen(port, async () => {
  logger.info(`cart-service listening on port ${port}`);
  await redis.connect().catch((e: Error) => logger.warn('Redis connect failed on startup', e.message));
  abandonedCartService.startAbandonedCartScannerJob();
});

async function shutdown(signal: string) {
  logger.info(`${signal} received — shutting down`);
  abandonedCartService.stopAbandonedCartScannerJob();
  redis.disconnect();
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 10_000);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
