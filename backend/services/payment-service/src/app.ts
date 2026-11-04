// MUST be first: starts OpenTelemetry before any instrumented library loads.
import './telemetry.js';
import 'dotenv/config';
import express from 'express';
import { internalCors } from '../../../shared/http/internal-cors.js';
import { env } from './config/env.js';
import { logger } from './utils/logger.js';
import * as payment from './controllers/payment.controller.js';
import * as webhook from './controllers/webhook.controller.js';
import * as finance from './controllers/finance.controller.js';
import { startOrderConsumer, stopOrderConsumer } from './consumers/order.consumer.js';
import { connectRedis, disconnectRedis, isRedisReady } from './redis/client.js';
import { connectDB, disconnectDB, prisma } from './db/prisma.js';
import { startPendingPaymentWorker, stopPendingPaymentWorker } from './workers/pending-payment.worker.js';
import { isProducerReady } from '../../../shared/kafka/producer.js';
import { connectRabbitMQ, disconnectRabbitMQ, isRabbitMQReady } from '../../../shared/rabbitmq/index.js';
import {
  requireAuth,
  requireRole,
  requireInternalCaller,
  assertInternalIdentityConfigured,
} from '../../../shared/http/service-auth.middleware.js';
import { validateBody, validateParams } from '../../../shared/http/validation.middleware.js';
import {
  InitiatePaymentSchema,
  RefundPaymentSchema,
  LinkSubOrdersSchema,
  PaymentReferenceParams,
  OrderIdParams,
  ReleaseEscrowSchema,
  RefundEscrowSchema,
  HoldEscrowSchema,
  RequestPayoutSchema,
  ReviewWithdrawalSchema,
} from './models/validation.schemas.js';

const app = express();

app.use(internalCors());

// Capture the raw request body alongside the parsed one — MTN/Airtel webhook
// HMAC-SHA256 signatures are computed over the exact raw bytes the provider
// sent, and re-serializing `req.body` back to JSON is not guaranteed to
// reproduce those bytes (key order, number formatting, whitespace can all
// differ). See src/security/webhook-signature.ts and src/types/express.d.ts.
app.use(
  express.json({
    verify: (req, _res, buf) => {
      (req as express.Request & { rawBody?: Buffer }).rawBody = Buffer.from(buf);
    },
  }),
);
app.use(express.urlencoded({ extended: true }));

// ─── Health Checks ─────────────────────────────────────────────────────────────

app.get('/health/live', (_req, res) => {
  res.json({ service: 'payment-service', status: 'up', ts: new Date().toISOString() });
});

app.get('/health/ready', async (_req, res) => {
  // Postgres is the system of record for payments, escrow holds and the vendor
  // ledger. It was the one dependency this probe did NOT check, and the handler
  // returned `ready: true` unconditionally — `res.json()` with no status — so
  // the endpoint could never report not-ready no matter what was broken.
  //
  // That is wired to the Kubernetes readinessProbe
  // (infrastructure/kubernetes/base/services/payment-service/deployment.yaml),
  // which means a pod whose database was unreachable kept being sent traffic
  // and answered every charge with a 500 instead of being pulled from the
  // Service's endpoints.
  let dbUp = false;
  try {
    await prisma.$queryRaw`SELECT 1`;
    dbUp = true;
  } catch (err) {
    logger.warn('[payment-service] readiness: database unreachable', {
      error: (err as Error).message,
    });
  }

  const checks = {
    database: dbUp,
    kafka:    isProducerReady(),
    rabbitmq: isRabbitMQReady(),
    redis:    isRedisReady(),
  };

  // Only the database gates readiness. Redis, Kafka and RabbitMQ are genuinely
  // degradable — the service keeps taking payments without them (see
  // redis/client.ts and shared/kafka/producer.ts) — so failing readiness on
  // those would pull healthy pods out of rotation over a broker blip and turn
  // one outage into an outage of the whole payment path. They stay in the body
  // for visibility.
  res.status(dbUp ? 200 : 503).json({
    service: 'payment-service',
    ready:   dbUp,
    checks,
    ts:      new Date().toISOString(),
  });
});

app.get('/health', (_req, res) => res.redirect('/health/live'));

// ─── Admin Gate ───────────────────────────────────────────────────────────────
//
// Declared here rather than beside the admin routes below because route
// registration runs top-to-bottom at module load: a `const` referenced above
// its own declaration is still in the temporal dead zone and would throw at
// startup.
//
// `requireRole` re-derives the role from the *verified* identity assertion
// (res.locals.roles), never from the x-user-roles header, so a forged header
// cannot satisfy it.
const requireAdmin = requireRole('ROLE_ADMIN', 'ROLE_SUPER_ADMIN');

// ─── Customer Payment Collection Endpoints ────────────────────────────────────

// Charging and refunding are service-only: they are steps inside the checkout
// saga, which has already priced the cart and reserved stock. A browser
// reaching them directly could charge an arbitrary amount against an
// arbitrary order, so a valid session is not enough — `requireInternalCaller`
// demands the `svc` claim only a peer service mints.
//
// Reads stay customer-facing; the handlers scope them to the caller.
app.post('/api/v1/payments/initiate',               requireInternalCaller, validateBody(InitiatePaymentSchema),  payment.initiatePayment);
// Registered before `/payments/:reference` — a bare `/payments` is a different
// path, but keeping the collection route above the parameterised one is what
// stops a future `/payments/anything` pattern from shadowing it.
//
// Read-only, and scoped by the caller's own order, so requireAuth is the right
// gate: a buyer needs their payment's `reference` to reconcile it, and that
// value was previously obtainable only from the database.
app.get('/api/v1/payments',                         requireAuth,           payment.findPaymentsByOrder);
app.get('/api/v1/payments/:reference/status',       requireAuth,           validateParams(PaymentReferenceParams), payment.getPaymentStatus);
app.get('/api/v1/payments/:reference',              requireAuth,           validateParams(PaymentReferenceParams), payment.getPaymentStatus);
app.post('/api/v1/payments/:reference/sub-orders',  requireInternalCaller, validateParams(PaymentReferenceParams), validateBody(LinkSubOrdersSchema), payment.linkSubOrders);
app.post('/api/v1/payments/:reference/refund',      requireInternalCaller, validateParams(PaymentReferenceParams), validateBody(RefundPaymentSchema), payment.refundPayment);

// ─── Escrow Fund Holding Endpoints (Phase 16 Feature 4) ────────────────────────
//
// Releasing escrow moves real money to a vendor. It is triggered by delivery
// confirmation and dispute resolution — never by a customer's browser.

app.get('/api/v1/payments/escrow/:orderId',        requireAuth,           validateParams(OrderIdParams),      payment.getEscrowStatus);
app.post('/api/v1/payments/escrow/release',        requireInternalCaller, validateBody(ReleaseEscrowSchema),  payment.releaseEscrow);
app.post('/api/v1/payments/escrow/hold',           requireInternalCaller, validateBody(HoldEscrowSchema),     payment.holdEscrowForDispute);
// The third transition, alongside release and hold. Internal-only for the same
// reason they are: it moves money, and only buyer-protection decides when a
// dispute has gone the buyer's way.
app.post('/api/v1/payments/escrow/refund',         requireInternalCaller, validateBody(RefundEscrowSchema),   payment.refundEscrow);
// Platform-wide escrow position across every buyer and vendor — an admin
// report, not a customer's view of their own order, so it takes the admin gate
// rather than bare requireAuth.
app.get('/api/v1/admin/payments/escrow/reconciliation', requireAdmin,     payment.getEscrowReconciliation);

// ─── Webhook Confirmation Handlers ────────────────────────────────────────────

app.post('/api/v1/payments/webhooks/flutterwave',  webhook.handleFlutterwaveWebhook);
app.post('/api/v1/payments/webhooks/pesapal',      webhook.handlePesapalWebhook);
app.post('/api/v1/payments/webhooks/mtn',          webhook.handleMtnMomoWebhook);
app.post('/api/v1/payments/webhooks/airtel',       webhook.handleAirtelMoneyWebhook);
app.post('/api/v1/payments/webhooks/visa',         webhook.handleVisaCardWebhook);
app.get('/api/v1/payments/callbacks/visa/3ds-return', webhook.handleVisaCard3dsReturn);
// Back-compat alias: any already-configured MTN dashboard callback URL keeps
// working, now with signature verification it did not have before.
app.post('/api/v1/payments/webhooks/momo',         webhook.handleMtnMomoWebhook);

// ─── Vendor Balance & Ledger Endpoints ────────────────────────────────────────

// A vendor's balance, ledger and payouts are their own money. These were
// reachable with no identity check at all on this service.
app.get('/api/v1/seller/balance',                 requireAuth, payment.getVendorBalance);
app.get('/api/v1/seller/ledger',                  requireAuth, payment.getVendorLedger);
app.post('/api/v1/seller/payouts/request',        requireAuth, validateBody(RequestPayoutSchema), payment.requestVendorPayout);
app.get('/api/v1/seller/payouts',                 requireAuth, payment.listVendorPayouts);

// ─── Seller Finance (earnings, statement, withdrawals) ────────────────────────
//
// Reached via the gateway's /api/v1/seller/finance/* → payment-service proxy,
// which forwards req.originalUrl verbatim — hence the full path here.

app.get ('/api/v1/seller/finance/earnings',     requireAuth, finance.getSellerEarnings);
app.get ('/api/v1/seller/finance/transactions', requireAuth, finance.listSellerTransactions);
app.get ('/api/v1/seller/finance/withdrawals',  requireAuth, finance.listSellerWithdrawals);
app.post('/api/v1/seller/finance/withdrawals',  requireAuth, validateBody(RequestPayoutSchema), finance.requestWithdrawal);

// ─── Platform Admin Commission & Payout Endpoints ─────────────────────────────
//
// These move real money: `process-weekly` disburses to every vendor with a
// balance, and the withdrawal queue below approves or rejects seller cash-outs.
// They carried no middleware at all — not even requireAuth — and this service
// publishes its port (docker-compose.yml `ports: ["4005:4005"]`), so the only
// thing standing between them and an anonymous caller was the gateway's own
// requireRole, which is bypassed entirely by talking to 4005 directly. Same
// defence-in-depth pattern fraud-, return- and marketplace-service already
// apply to their own admin routes.

app.post('/api/v1/admin/payouts/process-weekly',  requireAdmin, payment.triggerWeeklyPayouts);
app.get('/api/v1/admin/commissions',              requireAdmin, payment.listPlatformCommissions);

// ─── Admin Finance (withdrawal queue + settlement totals) ─────────────────────

app.get ('/api/v1/admin/finance/summary',                  requireAdmin, finance.adminFinanceSummary);
app.get ('/api/v1/admin/finance/withdrawals',              requireAdmin, finance.adminListWithdrawals);
app.post('/api/v1/admin/finance/withdrawals/:id/approve',  requireAdmin, validateBody(ReviewWithdrawalSchema), finance.adminApproveWithdrawal);
app.post('/api/v1/admin/finance/withdrawals/:id/reject',   requireAdmin, validateBody(ReviewWithdrawalSchema), finance.adminRejectWithdrawal);
// Bank transfers only: MUNI has no bank driver, so a human makes the transfer
// and confirms it here with the bank's reference. Mobile money never uses this
// — those are settled by a real provider response.
app.post('/api/v1/admin/finance/withdrawals/:id/settle',   requireAdmin, finance.adminSettleWithdrawal);

// ─── 404 for unmatched API routes ─────────────────────────────────────────────

app.use('/api', (req, res) => {
  res.status(404).json({ success: false, message: `No route matches ${req.method} ${req.originalUrl}` });
});

// ─── Global Error Handler ─────────────────────────────────────────────────────

app.use((
  error: Error & { status?: number; type?: string },
  req: express.Request,
  res: express.Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _next: express.NextFunction,
) => {
  // Malformed JSON body (e.g. a webhook sender with a broken client)
  if (error.type === 'entity.parse.failed') {
    res.status(400).json({ success: false, message: 'Malformed JSON in request body' });
    return;
  }

  const status = error.status ?? 500;

  if (status >= 500) {
    logger.error('[payment-service] Unhandled error', {
      path: req.path,
      method: req.method,
      error: error.message,
      stack: error.stack,
    });
  } else {
    logger.warn('[payment-service] Request error', { path: req.path, method: req.method, status, error: error.message });
  }

  res.status(status).json({ success: false, message: error.message || 'Internal server error' });
});

// ─── Process-Level Safety Nets ─────────────────────────────────────────────────

process.on('unhandledRejection', (reason) => {
  logger.error('[payment-service] Unhandled promise rejection', {
    reason: reason instanceof Error ? reason.message : reason,
    stack: reason instanceof Error ? reason.stack : undefined,
  });
});

process.on('uncaughtException', (err) => {
  logger.error('[payment-service] Uncaught exception — exiting', { error: err.message, stack: err.stack });
  // The process may be in a corrupted state at this point; fail fast and let
  // the orchestrator (Docker/Kubernetes) restart a clean instance rather than
  // keep serving traffic from an unknown state.
  process.exit(1);
});

// ─── Startup ───────────────────────────────────────────────────────────────────

async function start() {
  // Deliberately not wrapped in a try/catch like the brokers below. Kafka,
  // Redis and RabbitMQ are degradable; the database is not. A payment service
  // that starts without durable storage would accept charges it cannot record,
  // so failing to connect must stop the process before it binds a port.
  await connectDB();

  try {
    await startOrderConsumer();
  } catch (err) {
    logger.warn('[payment-service] Kafka consumer failed to start (non-fatal)', { error: (err as Error).message });
  }

  try {
    await connectRedis();
  } catch (err) {
    logger.warn('[payment-service] Redis connection failed at startup — pending-payment polling degraded until it recovers', {
      error: (err as Error).message,
    });
  }

  try {
    await connectRabbitMQ();
  } catch (err) {
    logger.warn('[payment-service] RabbitMQ failed to connect (non-fatal)', { error: (err as Error).message });
  }

  startPendingPaymentWorker();

  // Before anything binds a port: without a verifiable identity secret this
  // service trusts plain x-user-id headers, which is an authorization gap, not
  // a degraded mode. Fatal in production, a warning elsewhere.
  assertInternalIdentityConfigured('payment-service');

  const server = app.listen(env.port, () => {
    logger.info(`[payment-service] 🚀 Listening on port ${env.port}`);
  });

  async function shutdown(signal: string) {
    logger.info(`[payment-service] ${signal} received — shutting down`);

    stopPendingPaymentWorker();

    await Promise.allSettled([stopOrderConsumer(), disconnectRedis(), disconnectRabbitMQ(), disconnectDB()]);

    server.close(() => process.exit(0));
    // Force-exit if graceful close hangs (e.g. a stuck keep-alive connection).
    setTimeout(() => process.exit(1), 10_000).unref();
  }

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

start().catch((err) => {
  logger.error('[payment-service] Fatal startup error', { error: (err as Error).message, stack: (err as Error).stack });
  process.exit(1);
});

export default app;
