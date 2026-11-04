// MUST be first: starts OpenTelemetry before any instrumented library loads.
import { logger } from './utils/logger.js';
import './telemetry.js';
import 'dotenv/config';
import express from 'express';
import { internalCors } from '../../../shared/http/internal-cors.js';
import * as order from './controllers/order.controller.js';
import * as wholesale from './controllers/wholesale.controller.js';
import { connectProducer, disconnectProducer, isProducerReady } from '../../../shared/kafka/producer.js';
import { connectRabbitMQ, disconnectRabbitMQ, isRabbitMQReady } from '../../../shared/rabbitmq/index.js';
import { startPaymentConsumer, stopPaymentConsumer } from './consumers/payment.consumer.js';
import { connectDB, disconnectDB, isDBReady } from './db/mongoose.js';
import {
  requireAuth,
  requireRole,
  requireInternalCaller,
  assertInternalIdentityConfigured,
} from '../../../shared/http/service-auth.middleware.js';

// ─── Async handler safety net ─────────────────────────────────────────────────
//
// Express 4 does not forward a rejected promise from a handler. Every handler
// in this service is `async` and several deliberately throw with a `status`
// attached — `updateSubOrderStatus` throws a 403 when a seller reaches for
// another seller's consignment — and none of them called `next`. So the
// rejection reached no error handler, became an unhandled rejection, and Node
// killed the process.
//
// That turned an ordinary authorization failure into a denial of service: one
// seller touching a consignment that is not theirs took order-service down for
// every customer and every other seller on the platform. The error handler at
// the bottom of this file was already written to map `error.status` — it was
// simply never reached.
//
// Wrapping at registration rather than inside each handler means a handler
// added later is covered by default instead of by remembering to be.
type Handler = (
  req:  express.Request,
  res:  express.Response,
  next: express.NextFunction,
) => void | Promise<void>;

const wrap = (handler: Handler): express.RequestHandler =>
  (req, res, next) => { void Promise.resolve(handler(req, res, next)).catch(next); };

// ─── Express App ───────────────────────────────────────────────────────────────

const app = express();
app.use(internalCors());
app.use(express.json());

// ─── Health Checks ────────────────────────────────────────────────────────────

app.get('/health/live', (_req, res) => {
  res.json({ service: 'order-service', status: 'up', ts: new Date().toISOString() });
});

app.get('/health/ready', (_req, res) => {
  const kafkaOk    = isProducerReady();
  const rabbitmqOk = isRabbitMQReady();
  const mongoOk    = isDBReady();
  res.status(mongoOk ? 200 : 503).json({
    service:  'order-service',
    ready:    mongoOk,
    mongo:    mongoOk ? 'up' : 'down',
    kafka:    kafkaOk ? 'up' : 'degraded',
    rabbitmq: rabbitmqOk ? 'up' : 'degraded',
    ts:       new Date().toISOString(),
  });
});

app.get('/health', (_req, res) => res.redirect('/health/live'));

// ─── Order Routes ──────────────────────────────────────────────────────────────
//
// Creation is service-only. Orders are the end of the checkout saga, which
// prices the cart, holds stock and takes payment before it gets here; a
// browser reaching this route directly would create an unpaid order and skip
// all three. `requireInternalCaller` demands an assertion carrying a `svc`
// claim, which only a peer service mints — a signature alone is not enough,
// since the gateway signs one for every logged-in customer too.
//
// Everything else here is genuinely customer-facing and just needs the caller
// resolved.
app.get('/api/v1/orders',             requireAuth,            wrap(order.list));
app.post('/api/v1/orders',            requireInternalCaller,  wrap(order.create));
app.get('/api/v1/orders/:id',         requireAuth,            wrap(order.getById));
app.post('/api/v1/orders/:id/cancel', requireAuth,            wrap(order.cancelOrder));
app.get('/api/v1/orders/:id/invoice', requireAuth,            wrap(order.getInvoice));

// ─── Wholesale (bulk) Routes ───────────────────────────────────────────────────
//
// The gateway proxies /api/v1/wholesale here (WHOLESALE_SERVICE_URL points at
// order-service). Nothing was mounted for it, so every wholesale request 404'd
// while the seller-facing UI showed tier pricing from a mock.
//
// Authenticated: tiers are negotiated B2B pricing, and an order is placed for
// the caller. `requireAuth` also gives the handlers a trustworthy buyer id.
app.get ('/api/v1/wholesale/tiers',  requireAuth, wrap(wholesale.getTiers));
app.get ('/api/v1/wholesale/orders', requireAuth, wrap(wholesale.listOrders));
app.post('/api/v1/wholesale/orders', requireAuth, wrap(wholesale.createOrder));

// ─── Seller Sub-Order Routes ───────────────────────────────────────────────────
app.get  ('/api/v1/seller/sub-orders',            requireAuth, wrap(order.listSellerSubOrders));
app.get  ('/api/v1/seller/sub-orders/:id',        requireAuth, wrap(order.getSellerSubOrder));
app.patch('/api/v1/seller/sub-orders/:id/status', requireAuth, wrap(order.updateSubOrderStatus));

// Same handlers under /seller/orders, which is the path that actually arrives.
//
// The gateway mounts `route('/orders', targets.order)` under /api/v1/seller and
// forwards req.originalUrl verbatim (`new URL(req.originalUrl, target)` in
// api-gateway/src/utils/proxy.ts — there is no path rewriting), so a seller
// client calling /api/v1/seller/orders reached this service as
// /api/v1/seller/orders and fell through to the error handler. Every seller
// order request 404'd; the seller UI never noticed because it was mocked.
//
// Registered as an alias rather than a rename so any caller already using
// /sub-orders keeps working. "Sub-order" is also the more accurate word — a
// seller sees their slice of a split order, not the whole thing.
app.get  ('/api/v1/seller/orders',             requireAuth, wrap(order.listSellerSubOrders));
app.get  ('/api/v1/seller/orders/:id',         requireAuth, wrap(order.getSellerSubOrder));
app.patch('/api/v1/seller/orders/:id/status',  requireAuth, wrap(order.updateSubOrderStatus));

// ─── Admin Order Console ───────────────────────────────────────────────────────
// Gated by requireRole('ROLE_ADMIN', 'ROLE_SUPER_ADMIN') at the gateway.
app.get ('/api/v1/admin/stats',                   requireAuth, wrap(order.adminStats));
app.get ('/api/v1/admin/dashboard/recent-orders', requireAuth, wrap(order.adminRecentOrders));
app.get ('/api/v1/admin/orders',                  requireAuth, wrap(order.adminListOrders));
app.get ('/api/v1/admin/orders/:id',              requireAuth, wrap(order.adminGetOrder));
// Cancels ANY order, bypassing the buyer-ownership scoping the customer path
// uses (`orderService.cancel(..., isAdmin = true)`). `adminCancelOrder` checks
// only that *a* user is authenticated, so with `requireAuth` alone the
// privilege came entirely from the gateway's mount — one config change, or one
// request reaching this pod directly, away from any customer cancelling any
// order on the platform.
//
// Defence in depth, not a replacement: the gateway's admin router still applies
// its own requireRole.
app.post('/api/v1/admin/orders/:id/cancel',       requireRole('ROLE_ADMIN', 'ROLE_SUPER_ADMIN'), wrap(order.adminCancelOrder));

app.use((
  error: Error & { status?: number },
  _req:  express.Request,
  res:   express.Response,
  _next: express.NextFunction,
) => res.status(error.status ?? 400).json({ message: error.message }));

// ─── Startup ───────────────────────────────────────────────────────────────────

const PORT = Number(process.env.PORT ?? 4003);

async function start() {
  try {
    await connectDB();
  } catch (err) {
    if (process.env.NODE_ENV === 'production') {
      logger.error('Failed to connect to MongoDB — exiting', { detail: err });
      process.exit(1);
    }
    logger.warn('⚠️  MongoDB unavailable — continuing in degraded mode (dev only)', { detail: (err as Error).message });
  }

  try {
    await connectProducer();
  } catch (err) {
    logger.warn('Kafka producer failed to connect (non-fatal)', { detail: err });
  }

  try {
    await connectRabbitMQ();
    // Settles the inventory holds a direct-path order is carrying, once its
    // payment is confirmed. Without this the holds expire on their TTL and the
    // stock quietly returns to the shelf after the customer has paid.
    await startPaymentConsumer();
  } catch (err) {
    logger.warn('RabbitMQ failed to connect (non-fatal)', { detail: (err as Error).message });
  }

  // Before anything binds a port: without a verifiable identity secret this
  // service trusts plain x-user-id headers, which is an authorization gap, not
  // a degraded mode. Fatal in production, a warning elsewhere.
  assertInternalIdentityConfigured('order-service');

  const server = app.listen(PORT, () =>
    logger.info(`🚀 Listening on port ${PORT}`),
  );

  async function shutdown(signal: string) {
    logger.info(`${signal} — shutting down`);
    await disconnectProducer();
    await stopPaymentConsumer();
    await disconnectRabbitMQ();
    await disconnectDB();
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(1), 10_000);
  }

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT',  () => shutdown('SIGINT'));
}

start().catch((err) => {
  logger.error('Fatal startup error', { detail: err });
  process.exit(1);
});
