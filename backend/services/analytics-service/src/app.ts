import 'dotenv/config';
import express from 'express';
import { internalCors } from '../../../shared/http/internal-cors.js';
import {
  requireAuth,
  requireRole,
  optionalAuth,
  assertInternalIdentityConfigured,
} from '../../../shared/http/service-auth.middleware.js';
import { connectCache, disconnectCache, isCacheReady } from '../../../shared/cache/redis.js';
import { startEventsConsumer, stopEventsConsumer, counters, eventLog } from './consumers/events.consumer.js';
import { startOrderConsumer,   stopOrderConsumer,   getOrderMetrics }   from './consumers/order.consumer.js';
import { startPaymentConsumer, stopPaymentConsumer, getRevenueMetrics } from './consumers/payment.consumer.js';
import * as analytics from './controllers/analytics.controller.js';
import { startAnalyticsAggregatorJob, stopAnalyticsAggregatorJob } from './jobs/aggregator.job.js';

// ─── Express App ───────────────────────────────────────────────────────────────

const app = express();
app.use(internalCors());
app.use(express.json());

// ─── Health Checks ─────────────────────────────────────────────────────────────

app.get('/health/live', (_req, res) => {
  res.json({ service: 'analytics-service', status: 'up', ts: new Date().toISOString() });
});

app.get('/health/ready', (_req, res) => {
  res.json({ service: 'analytics-service', ready: true, redis: isCacheReady() ? 'up' : 'degraded', ts: new Date().toISOString() });
});

app.get('/health', (_req, res) => res.redirect('/health/live'));

// ─── Phase 11 Analytics & Business Intelligence Dashboard Routes ──────────────

// ─── Guards ───────────────────────────────────────────────────────────────────
//
// Nothing here had any authentication, so every route below was readable by
// anyone who could reach the port: one seller's revenue by editing `:id`, and
// the platform's GMV, order counts and user totals from the executive
// endpoints.
//
// Ownership for the seller dashboards is decided in the controller, from the
// verified identity, because it depends on the path parameter.
const requireAdmin = requireRole('ROLE_ADMIN', 'ROLE_SUPER_ADMIN');

// Seller BI Dashboard
app.get('/api/v1/analytics/dashboard/seller/:id', requireAuth, analytics.getSellerDashboard);
app.get('/api/analytics/dashboard/seller/:id',    requireAuth, analytics.getSellerDashboard); // Alias requested in prompt

// Platform Executive Admin Dashboard
app.get('/api/v1/analytics/dashboard/admin',      requireAdmin, analytics.getAdminDashboard);
app.get('/api/analytics/dashboard/admin',         requireAdmin, analytics.getAdminDashboard);  // Alias requested in prompt

// Legacy Overview endpoints
app.get('/api/v1/analytics/overview', requireAdmin, (_req, res) => {
  const orderMetrics   = getOrderMetrics();
  const revenueMetrics = getRevenueMetrics();
  res.json({
    data: {
      live: {
        ...counters,
        ordersCreated: orderMetrics.totalOrdersCount,
        revenueTotal:  revenueMetrics.revenueTotal,
        refundTotal:   revenueMetrics.refundTotal,
      },
      gmv:     { total: 284_500_000 + revenueMetrics.revenueTotal, currency: 'UGX', growthPercent: 18.5 },
      orders:  { total: 8_931 + orderMetrics.totalOrdersCount, today: 47, fulfillmentRate: 0.94, byStatus: orderMetrics.ordersByStatus },
      users:   { total: 12_847, customers: 12_505, sellers: 342 },
      revenue: { commission: 28_450_000, currency: 'UGX', byMethod: revenueMetrics.paymentsByMethod },
    },
  });
});

app.get('/api/v1/analytics/gmv', requireAdmin, (_req, res) => {
  const periods = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'];
  const data = periods.map((p) => ({
    period: p,
    gmv:    Math.floor(Math.random() * 50_000_000) + 10_000_000,
    orders: Math.floor(Math.random() * 1_000) + 200,
  }));
  res.json({ data });
});

app.get('/api/v1/analytics/sellers', requireAdmin, (_req, res) => {
  res.json({
    data: [
      { vendorId: 'ven-001', name: 'Kampala Electronics', gmv: 45_000_000, orders: 1_200, fulfillmentRate: 0.98, rating: 4.8 },
      { vendorId: 'ven-002', name: 'Fresh Groceries',     gmv: 32_000_000, orders: 4_500, fulfillmentRate: 0.95, rating: 4.6 },
    ],
  });
});

app.get('/api/v1/analytics/products', requireAdmin, (_req, res) => {
  res.json({
    data: [
      { productId: 'prod-001', name: 'Samsung Galaxy S24', revenue: 15_000_000, unitsSold: 5,  views: 1_200 },
      { productId: 'prod-002', name: 'Nike Air Max',       revenue:  8_000_000, unitsSold: 40, views: 3_500 },
    ],
  });
});

// ─── Seller analytics: shape-correct, data-free ───────────────────────────────
//
// seller-center calls both of these (frontend/seller-center/src/api/analytics.api.ts).
// Neither existed, so both 404'd — and because that client wraps every call in
// `try { … } catch { return MOCK_… }`, the page quietly rendered fabricated
// revenue charts instead of showing an error. A seller reading invented numbers
// off their own dashboard is worse than a seller seeing nothing.
//
// These return the real shape with no rows. That is the honest answer while the
// per-seller aggregation pipeline does not exist: this service keeps its
// counters in memory and has no database, so it genuinely has nothing to report
// yet. The empty array is a placeholder for that pipeline, NOT a stand-in for
// data we have and are not returning.
//
// `meta.pending` is there so the UI can say "not available yet" rather than
// "you sold nothing" — two very different messages to show a seller.

app.get('/api/v1/analytics/sales', requireAuth, (_req, res) => {
  res.json({
    data: [] as Array<{ date: string; revenue: number; orders: number; units: number }>,
    meta: {
      pending: true,
      reason: 'Per-seller daily aggregation is not implemented; analytics-service has no persistent store.',
    },
  });
});

app.get('/api/v1/analytics/top-products', requireAuth, (_req, res) => {
  res.json({
    data: [] as Array<{ productId: string; name: string; revenue: number; unitsSold: number; views: number }>,
    meta: {
      pending: true,
      reason: 'Per-seller product aggregation is not implemented; analytics-service has no persistent store.',
    },
  });
});

app.get('/api/v1/analytics/seller/:vendorId', requireAuth, analytics.getSellerDashboard);

app.get('/api/v1/analytics/events', requireAdmin, (_req, res) => {
  res.json({ data: eventLog.slice(-100).reverse() });
});

app.post('/api/v1/analytics/events', optionalAuth, (req, res) => {
  const event = req.body;
  console.log('[ANALYTICS] Tracked event:', event);
  res.status(204).send();
});

app.use((error: Error & { status?: number }, _req: express.Request, res: express.Response, _next: express.NextFunction) =>
  res.status(error.status ?? 400).json({ success: false, message: error.message }),
);

// ─── Startup ──────────────────────────────────────────────────────────────────

const PORT = Number(process.env.PORT ?? 4009);

async function start() {
  // Without the signing secret the shared middleware falls back to trusting
  // plain x-user-id headers, which on this service decides whose revenue a
  // caller can read.
  assertInternalIdentityConfigured('analytics-service');

  try {
    await connectCache('analytics-service');
  } catch (err) {
    console.warn('[analytics-service] Redis unavailable — caching disabled:', err);
  }

  // Start all Kafka consumers (non-fatal)
  await Promise.allSettled([
    startEventsConsumer(),
    startOrderConsumer(),
    startPaymentConsumer(),
  ]).then(results => {
    results.forEach((r, i) => {
      if (r.status === 'rejected') {
        console.warn(`[analytics-service] Consumer ${i} failed to start (non-fatal):`, r.reason);
      }
    });
  });

  // Start background hourly analytics pre-aggregation worker
  startAnalyticsAggregatorJob();

  const server = app.listen(PORT, () =>
    console.log(`[analytics-service] 🚀 Listening on port ${PORT}`),
  );

  async function shutdown(signal: string) {
    console.log(`[analytics-service] ${signal} — shutting down`);
    stopAnalyticsAggregatorJob();
    await Promise.allSettled([
      stopEventsConsumer(),
      stopOrderConsumer(),
      stopPaymentConsumer(),
      disconnectCache(),
    ]);
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(1), 10_000);
  }

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT',  () => shutdown('SIGINT'));
}

// Guarded so importing the app in a test does not bind a port or start
// consumers. The route table above is what the authorization tests exercise.
if (process.env.NODE_ENV !== 'test') {
  start().catch((err) => {
    console.error('[analytics-service] Fatal startup error:', err);
    process.exit(1);
  });
}

export default app;
