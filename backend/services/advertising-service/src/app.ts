import 'dotenv/config';
import express from 'express';
import { internalCors } from '../../../shared/http/internal-cors.js';
import {
  requireAuth,
  requireRole,
  optionalAuth,
  assertInternalIdentityConfigured,
} from '../../../shared/http/service-auth.middleware.js';
import { connectProducer, disconnectProducer } from '../../../shared/kafka/producer.js';
import * as ad from './controllers/advertising.controller.js';
import { connectDB, disconnectDB, prisma } from './db/prisma.js';

const app = express();
app.use(internalCors());
app.use(express.json());

// Health Checks
app.get('/health/live', (_req, res) => {
  res.json({ service: 'advertising-service', status: 'up', ts: new Date().toISOString() });
});
app.get('/health/ready', async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ service: 'advertising-service', ready: true, db: 'connected', ts: new Date().toISOString() });
  } catch {
    res.status(503).json({ service: 'advertising-service', ready: false, db: 'disconnected', ts: new Date().toISOString() });
  }
});
app.get('/health', (_req, res) => res.redirect('/health/live'));

// ─── Advertising PPC Routes ───────────────────────────────────────────────────
//
// Every route here used to be mounted bare, and the gateway published the whole
// /advertising prefix with `pub()` — all methods, no JWT. A campaign spends real
// money (each click charges its bid against a daily budget), so this was an
// unauthenticated write surface onto seller billing.
//
// Two routes stay public, because the storefront needs them for shoppers who
// are not signed in:
//
//   sponsored-products  a product page renders sponsored placements to everyone
//   clicks              customer-web posts this from the browser when an ad is
//                       clicked (SponsoredProductCard.tsx:32), and the shopper
//                       may well be anonymous
//
// `optionalAuth` on both rather than nothing at all: a session is resolved when
// one is present, from the verified assertion, without turning guests away.
const requireSeller = requireRole('ROLE_SELLER', 'ROLE_ADMIN', 'ROLE_SUPER_ADMIN');

app.post('/api/v1/advertising/campaigns',         requireSeller, ad.createCampaign);
app.get('/api/v1/advertising/campaigns',          requireAuth,   ad.getCampaigns);
app.get('/api/v1/advertising/campaigns/:id',      requireAuth,   ad.getCampaignById);
app.patch('/api/v1/advertising/campaigns/:id',    requireSeller, ad.updateCampaign);
app.get('/api/v1/advertising/analytics',          requireAuth,   ad.getAnalytics);

app.get('/api/v1/advertising/sponsored-products', optionalAuth,  ad.getSponsoredProducts);
app.post('/api/v1/advertising/clicks',            optionalAuth,  ad.recordClick);

app.use((error: Error & { status?: number }, _req: express.Request, res: express.Response, _next: express.NextFunction) =>
  res.status(error.status ?? 400).json({ success: false, message: error.message }),
);

const PORT = Number(process.env.PORT ?? 4027);

async function start() {
  // Without the signing secret the shared middleware falls back to trusting
  // plain x-user-id headers, and on this service that is the difference between
  // "your own campaigns" and "anyone's billing".
  assertInternalIdentityConfigured('advertising-service');

  // Fatal, unlike Kafka below: ad spend this service cannot durably record
  // is money charged with no trace of what it was charged for.
  await connectDB();

  try {
    await connectProducer();
  } catch (err) {
    console.warn('[advertising-service] Kafka producer unavailable (non-fatal):', err);
  }

  const server = app.listen(PORT, () =>
    console.log(`[advertising-service] 🚀 Listening on port ${PORT}`),
  );

  async function shutdown(signal: string) {
    console.log(`[advertising-service] ${signal} — shutting down`);
    await disconnectProducer();
    await disconnectDB().catch(() => { /* already closing */ });
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(1), 10_000);
  }

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT',  () => shutdown('SIGINT'));
}

// Guarded so importing the app in a test does not bind a port or open a
// database connection — the same arrangement checkout- and
// buyer-protection-service use. The route table above is what the
// authorization tests exercise, so they have to be able to import this module.
if (process.env.NODE_ENV !== 'test') {
  start().catch((err) => {
    console.error('[advertising-service] Fatal startup error:', err);
    process.exit(1);
  });
}

export default app;
