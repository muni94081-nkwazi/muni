// MUST be first: starts OpenTelemetry before any instrumented library loads.
import './telemetry.js';
import express from 'express';
import { logger } from './utils/logger.js';
import { assertInternalIdentityConfigured } from '../../../shared/http/service-auth.middleware.js';
import routes from './routes/index.js';
import { connectSessionStore, disconnectSessionStore, isSessionStoreReady } from './repositories/session.repository.js';
import { connectIdempotencyStore, disconnectIdempotencyStore, isIdempotencyStoreReady } from './repositories/idempotency.store.js';
import { startPaymentConsumer, stopPaymentConsumer } from './consumers/payment.consumer.js';
import { startReconciliationWorker, stopReconciliationWorker } from './workers/payment-reconciliation.worker.js';

const app = express();
app.use(express.json());

app.get('/health',      (_req, res) => res.json({ service: 'checkout-service', status: 'up' }));
app.get('/health/live', (_req, res) => res.json({ service: 'checkout-service', status: 'up' }));

// Readiness reflects what checkout actually needs to operate safely. Without
// the idempotency store, money-moving routes fail closed — so reporting ready
// would put a pod into rotation that can only return 503 on its main job.
app.get('/health/ready', (_req, res) => {
  const sessions    = isSessionStoreReady();
  const idempotency = isIdempotencyStoreReady();
  const ready       = sessions && idempotency;

  res.status(ready ? 200 : 503).json({
    service: 'checkout-service',
    ready,
    dependencies: {
      sessionStore:     sessions    ? 'up' : 'down',
      idempotencyStore: idempotency ? 'up' : 'down',
    },
  });
});

app.use('/api/v1', routes);

// ─── Error Handler ────────────────────────────────────────────────────────────
//
// Errors carry a status from the layer that raised them (409 sold out, 402
// declined, 503 dependency down). Flattening everything to 400 — as this used
// to — tells the client to fix its request when the real answer is "retry" or
// "choose another item".

app.use((
  error: Error & { status?: number; name?: string },
  _req:  express.Request,
  res:   express.Response,
  _next: express.NextFunction,
) => {
  const status = error.status ?? 500;

  if (status >= 500) {
    logger.error('Unhandled error', { error: error.message, stack: error.stack });
  } else {
    logger.warn('Request failed', { error: error.message, status });
  }

  res.status(status).json({
    success: false,
    data:    null,
    error: {
      code:    error.name ?? 'INTERNAL_ERROR',
      message: status >= 500 && process.env.NODE_ENV === 'production'
        ? 'Something went wrong on our end. Please try again.'
        : error.message,
    },
    meta: { timestamp: new Date().toISOString(), service: 'checkout-service' },
  });
});

const PORT = process.env.PORT || 4024;

async function start() {
  // Before anything binds a port: without a verifiable identity secret this
  // service trusts plain x-user-id headers, which is an authorization gap, not
  // a degraded mode. Fatal in production, a warning elsewhere.
  assertInternalIdentityConfigured('checkout-service');
  await Promise.all([connectSessionStore(), connectIdempotencyStore()]);

  // The two halves of the mobile money completion path: the consumer handles
  // the confirmation event, the sweep handles its absence. Neither is fatal —
  // a broker outage must not stop the service taking checkouts.
  await startPaymentConsumer();
  startReconciliationWorker();

  const server = app.listen(PORT, () => {
    logger.info(`checkout-service listening on port ${PORT}`);
  });

  async function shutdown(signal: string) {
    logger.info(`${signal} received — shutting down`);
    stopReconciliationWorker();
    await stopPaymentConsumer();
    await Promise.allSettled([disconnectSessionStore(), disconnectIdempotencyStore()]);
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(1), 10_000);
  }

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT',  () => shutdown('SIGINT'));
}

// Guarded so importing the app in a test does not bind a port.
if (process.env.NODE_ENV !== 'test') {
  start().catch((err) => {
    logger.error('Fatal startup error', { error: (err as Error).message });
    process.exit(1);
  });
}

export default app;
