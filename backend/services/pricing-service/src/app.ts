import 'dotenv/config';
import express from 'express';
import { internalCors } from '../../../shared/http/internal-cors.js';
import {
  requireAuth,
  requireRole,
  assertInternalIdentityConfigured,
} from '../../../shared/http/service-auth.middleware.js';
import { connectProducer, disconnectProducer } from '../../../shared/kafka/producer.js';
import * as pricing from './controllers/pricing.controller.js';
import { connectDB, disconnectDB, prisma } from './db/prisma.js';

const app = express();
app.use(internalCors());
app.use(express.json());

// Health Checks
app.get('/health/live', (_req, res) => {
  res.json({ service: 'pricing-service', status: 'up', ts: new Date().toISOString() });
});
app.get('/health/ready', async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ service: 'pricing-service', ready: true, db: 'connected', ts: new Date().toISOString() });
  } catch {
    res.status(503).json({ service: 'pricing-service', ready: false, db: 'disconnected', ts: new Date().toISOString() });
  }
});
app.get('/health', (_req, res) => res.redirect('/health/live'));

// ─── Dynamic Pricing Routes ───────────────────────────────────────────────────
//
// Every route was mounted bare and the gateway published /pricing with `pub()`
// — all methods, no JWT. So `POST /pricing/rules` and `POST /pricing/apply`
// were unauthenticated writes onto what sellers' products sell for, and
// `GET /pricing/rules?sellerId=` handed out competitors' price floors.
//
// Nothing here is public: a shopper sees prices through product-service, not
// through the rule engine that sets them.
const requireSeller = requireRole('ROLE_SELLER', 'ROLE_ADMIN', 'ROLE_SUPER_ADMIN');

app.post('/api/v1/pricing/rules',             requireSeller, pricing.createRule);
app.get('/api/v1/pricing/rules',              requireAuth,   pricing.getRules);
app.get('/api/v1/pricing/competitors/:id',    requireAuth,   pricing.getCompetitorPrices);
// Platform-wide: walks every seller's active rules. The staff/internal check
// is in the controller, so a signed service call passes it too.
app.post('/api/v1/pricing/apply',             requireAuth,   pricing.applyRules);
app.get('/api/v1/pricing/history/:productId', requireAuth,   pricing.getHistory);

app.use((error: Error & { status?: number }, _req: express.Request, res: express.Response, _next: express.NextFunction) =>
  res.status(error.status ?? 400).json({ success: false, message: error.message }),
);

const PORT = Number(process.env.PORT ?? 4033);

async function start() {
  // Without the signing secret the shared middleware falls back to trusting
  // plain x-user-id headers, which on this service decides who may rewrite a
  // seller's prices.
  assertInternalIdentityConfigured('pricing-service');

  // Fatal, unlike Kafka below: state this service cannot durably record is
  // state that silently disappears on the next restart.
  await connectDB();

  try {
    await connectProducer();
  } catch (err) {
    console.warn('[pricing-service] Kafka producer unavailable (non-fatal):', err);
  }

  const server = app.listen(PORT, () =>
    console.log(`[pricing-service] 🚀 Listening on port ${PORT}`),
  );

  async function shutdown(signal: string) {
    console.log(`[pricing-service] ${signal} — shutting down`);
    await disconnectProducer();
    await disconnectDB().catch(() => { /* already closing */ });
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(1), 10_000);
  }

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT',  () => shutdown('SIGINT'));
}

// Guarded so importing the app in a test does not bind a port or open a
// database connection.
if (process.env.NODE_ENV !== 'test') {
  start().catch((err) => {
    console.error('[pricing-service] Fatal startup error:', err);
    process.exit(1);
  });
}

export default app;
