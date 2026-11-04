import 'dotenv/config';
import express from 'express';
import { internalCors } from '../../../shared/http/internal-cors.js';
import {
  requireAuth,
  assertInternalIdentityConfigured,
} from '../../../shared/http/service-auth.middleware.js';
import { connectProducer, disconnectProducer } from '../../../shared/kafka/producer.js';
import * as loyalty from './controllers/loyalty.controller.js';
import { connectDB, disconnectDB, prisma } from './db/prisma.js';

const app = express();
app.use(internalCors());
app.use(express.json());

// Health Checks
app.get('/health/live', (_req, res) => {
  res.json({ service: 'loyalty-service', status: 'up', ts: new Date().toISOString() });
});
app.get('/health/ready', async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ service: 'loyalty-service', ready: true, db: 'connected', ts: new Date().toISOString() });
  } catch {
    res.status(503).json({ service: 'loyalty-service', ready: false, db: 'disconnected', ts: new Date().toISOString() });
  }
});
app.get('/health', (_req, res) => res.redirect('/health/live'));

// ── Loyalty Program Routes ────────────────────────────────────────────────────
//
// Split by whether the response is about a PARTICULAR user.
//
// The reward catalogue and the tier benefits table are the same for everyone —
// both handlers ignore the request entirely — so they stay open for shoppers
// browsing before they sign in.
//
// Everything else reads or spends one user's balance. Those carry requireAuth,
// which verifies the gateway's signed identity assertion and publishes the
// result as res.locals.userId. Before this, the caller was whoever the request
// said it was: a "userId" in the request body was trusted, and an
// unauthenticated request silently acted as the hardcoded user 'user-123'.

// Public catalogue — no user context.
app.get('/api/v1/loyalty/rewards',       loyalty.getRewards);
app.get('/api/v1/loyalty/tier/benefits', loyalty.getTierBenefits);

// User-scoped — identity comes only from the verified session.
app.get('/api/v1/loyalty/points',        requireAuth, loyalty.getUserPoints);
app.get('/api/v1/loyalty/history',       requireAuth, loyalty.getHistory);
app.post('/api/v1/loyalty/redeem',       requireAuth, loyalty.redeemReward);
app.post('/api/v1/loyalty/referral',     requireAuth, loyalty.generateReferral);
app.post('/api/v1/loyalty/birthday',     requireAuth, loyalty.claimBirthday);

app.use((error: Error & { status?: number }, _req: express.Request, res: express.Response, _next: express.NextFunction) =>
  res.status(error.status ?? 400).json({ success: false, message: error.message }),
);

const PORT = Number(process.env.PORT ?? 4030);

async function start() {
  // Refuse to boot in production without the signing secret. Without it the
  // auth middleware degrades to trusting x-user-id, which on a service that
  // spends loyalty balances is the difference between "redeemed their own
  // reward" and "redeemed anyone's".
  assertInternalIdentityConfigured('loyalty-service');

  // Fatal, unlike Kafka below: a points balance the service cannot durably
  // record is either a customer robbed of what they earned or a discount
  // handed out twice.
  await connectDB();

  try {
    await connectProducer();
  } catch (err) {
    console.warn('[loyalty-service] Kafka producer unavailable (non-fatal):', err);
  }

  const server = app.listen(PORT, () =>
    console.log(`[loyalty-service] 🚀 Listening on port ${PORT}`),
  );

  async function shutdown(signal: string) {
    console.log(`[loyalty-service] ${signal} — shutting down`);
    await disconnectProducer();
    await disconnectDB().catch(() => { /* already closing */ });
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(1), 10_000);
  }

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT',  () => shutdown('SIGINT'));
}

start().catch((err) => {
  console.error('[loyalty-service] Fatal startup error:', err);
  process.exit(1);
});

export default app;
