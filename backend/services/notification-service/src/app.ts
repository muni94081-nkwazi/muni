import express from 'express';
import cors from 'cors';
import env from './config/env.js';
import logger from './config/logger.js';
import prisma from './config/prisma.js';
import { apiRoutes, healthRoutes } from './routes/index.js';
import { startOrderConsumer, stopOrderConsumer } from './consumers/order.consumer.js';
import { startSellerConsumer, stopSellerConsumer } from './consumers/seller.consumer.js';
import { startRetryWorker, stopRetryWorker } from './services/dispatch.service.js';
import { shutdownProviders, configuredProviders } from './providers/index.js';

export function createApp(): express.Express {
  const app = express();

  // Closed by default. `origin: true` here would reflect whatever Origin the
  // request carried AND pair it with credentials:true — a combination the spec
  // forbids for `*` precisely because it lets any site read authenticated
  // responses. `false` sends no CORS headers, which is correct for a service
  // reached through the gateway; set CORS_ORIGINS to name real browser origins.
  app.use(cors({ origin: env.corsOrigins.length > 0 ? env.corsOrigins : false, credentials: true }));
  app.use(express.json());

  // Health probes at the root; the container HEALTHCHECK and k8s probes
  // address this service directly, not through the gateway.
  app.use('/', healthRoutes);

  // The API lives under the prefix api-gateway forwards unchanged.
  app.use('/api/v1', apiRoutes);

  app.use((_req, res) => res.status(404).json({ success: false, message: 'Not found' }));

  app.use((
    error: Error & { statusCode?: number; status?: number },
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction,
  ) => {
    const status = error.statusCode ?? error.status ?? 500;
    if (status >= 500) logger.error('unhandled error', { message: error.message, stack: error.stack });
    res.status(status).json({ success: false, message: error.message });
  });

  return app;
}

export const app = createApp();

async function start(): Promise<void> {
  // The database is required. Starting without it would silently reproduce the
  // in-memory behaviour this service was rewritten to remove.
  try {
    await prisma.$queryRaw`SELECT 1`;
    logger.info('database connected');
  } catch (err) {
    logger.error('database unavailable — exiting', { error: (err as Error).message });
    process.exit(1);
  }

  // Surface the delivery capability at boot: an operator should not have to
  // send a test message to discover that no provider is configured.
  const channels = {
    sms: configuredProviders('SMS').map((p) => p.name),
    whatsapp: configuredProviders('WHATSAPP').map((p) => p.name),
    push: configuredProviders('PUSH').map((p) => p.name),
    email: configuredProviders('EMAIL').map((p) => p.name),
  };
  const configured = Object.values(channels).flat();

  if (configured.length === 0 && !env.delivery.dryRun) {
    logger.warn(
      'no delivery provider configured — only in-app notifications will be written. ' +
        'Set AT_ENABLED / TWILIO_ENABLED / FCM_ENABLED / SMTP_ENABLED, or NOTIFICATION_DRY_RUN=true for local work.',
    );
  } else {
    logger.info('delivery channels ready', { channels, dryRun: env.delivery.dryRun });
  }

  // Consumers are non-fatal: a broker outage stops new events arriving but
  // must not take down the inbox API or the retry worker.
  await Promise.allSettled([startOrderConsumer(), startSellerConsumer()]);
  startRetryWorker();

  const server = app.listen(env.port, () => {
    logger.info(`notification-service listening on port ${env.port} (${env.nodeEnv})`);
  });

  async function shutdown(signal: string): Promise<void> {
    logger.info(`${signal} received — shutting down`);
    stopRetryWorker();
    await Promise.allSettled([stopOrderConsumer(), stopSellerConsumer(), shutdownProviders()]);
    server.close(async () => {
      await prisma.$disconnect();
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10_000).unref();
  }

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

// Only auto-start when run directly, so tests can import createApp() without
// opening sockets and Kafka connections.
if (process.env.NODE_ENV !== 'test') {
  start().catch((err) => {
    logger.error('fatal startup error', { error: (err as Error).message });
    process.exit(1);
  });
}

export default app;
