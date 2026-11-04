import 'dotenv/config';
import express from 'express';
import { internalCors } from '../../../shared/http/internal-cors.js';
import {
  requireAuth,
  requireRole,
  requireInternalCaller,
  optionalAuth,
  assertInternalIdentityConfigured,
} from '../../../shared/http/service-auth.middleware.js';
import { connectProducer, disconnectProducer } from '../../../shared/kafka/producer.js';
import * as bp from './controllers/buyer-protection.controller.js';
import * as escrow from './controllers/escrow-hold.controller.js';
import { startEscrowReleaseWorker, stopEscrowReleaseWorker } from './workers/escrow-release.worker.js';
import { env } from './config/env.js';
import { connectDB, disconnectDB, prisma } from './db/prisma.js';

const app = express();
app.use(internalCors());
app.use(express.json());

// Health Checks
app.get('/health/live', (_req, res) => {
  res.json({ service: 'buyer-protection-service', status: 'up', ts: new Date().toISOString() });
});
// Readiness means something now: without the database this service cannot
// record an escrow hold or a claim, and reporting ready while it is
// unreachable keeps a replica in rotation that fails every write.
app.get('/health/ready', async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ service: 'buyer-protection-service', ready: true, db: 'connected', ts: new Date().toISOString() });
  } catch {
    res.status(503).json({ service: 'buyer-protection-service', ready: false, db: 'disconnected', ts: new Date().toISOString() });
  }
});
app.get('/health', (_req, res) => res.redirect('/health/live'));

// ─── Routes ───────────────────────────────────────────────────────────────────
//
// Every route below used to be mounted with no guard whatsoever — no local
// auth.middleware.ts existed in this service at all — and the gateway mounted
// the whole /buyer-protection prefix as public. So escrow holds, delivery
// confirmations, dispute freezes and the admin claims queue were all reachable
// by anyone who could open a socket, acting as whoever they claimed to be.
//
// Three tiers, matching what each route actually does:
//
//   public    — the policy and the product badge. Public marketing copy that a
//               signed-out shopper reads on a product page; no stored data.
//               `optionalAuth` still resolves a session when one is present.
//   user      — a claim, the caller's own claims, their own escrow. The acting
//               user comes from the verified assertion, and ownership is
//               checked against the record (see the controllers).
//   internal  — createHold, markDelivered and the two dispute transitions.
//               These are driven by checkout/order-service, shipping and
//               dispute-service against orders they already own the facts for.
//               `requireInternalCaller` needs the `svc` claim that only a
//               service can mint, so a logged-in customer holding a perfectly
//               valid session cannot freeze or release anyone's money.
const requireAdmin = requireRole('ROLE_ADMIN', 'ROLE_SUPER_ADMIN');

app.get('/api/v1/buyer-protection/policy',              optionalAuth, bp.getPolicy);
app.get('/api/v1/buyer-protection/badge/:productId',    optionalAuth, bp.getBadgeStatus);
// Stateless: computes over the values in the request body and reads nothing.
app.post('/api/v1/buyer-protection/check-eligibility',  optionalAuth, bp.checkEligibility);

app.post('/api/v1/buyer-protection/claims',             requireAuth,  bp.fileClaim);
app.get('/api/v1/buyer-protection/claims',              requireAuth,  bp.getUserClaims);
app.get('/api/v1/buyer-protection/admin/claims',        requireAdmin, bp.getAllClaims);
// Approving a claim pays out against MUNI's own protection cover, so it is an
// admin decision. It was open to anyone, including the claimant.
app.patch('/api/v1/buyer-protection/claims/:id/resolve', requireAdmin, bp.resolveClaim);

// ─── Escrow Payout Hold Routes ─────────────────────────────────────────────────

app.post('/api/v1/buyer-protection/escrow',                          requireInternalCaller, escrow.createHold);
app.post('/api/v1/buyer-protection/escrow/delivered',                requireInternalCaller, escrow.markDelivered);
app.post('/api/v1/buyer-protection/escrow/dispute-hold',             requireInternalCaller, escrow.holdForDispute);
app.post('/api/v1/buyer-protection/escrow/dispute-resolve',          requireInternalCaller, escrow.resolveDisputeHold);
app.get('/api/v1/buyer-protection/seller/escrow',                    requireAuth,  escrow.listBySeller);
app.get('/api/v1/buyer-protection/admin/escrow',                     requireAdmin, escrow.listAll);
// Registered after the literal sub-paths above so "delivered", "dispute-hold"
// and "dispute-resolve" are not captured as order ids.
app.post('/api/v1/buyer-protection/escrow/:orderId/confirm-receipt', requireAuth,  escrow.confirmReceipt);
app.get('/api/v1/buyer-protection/escrow/:orderId',                  requireAuth,  escrow.getHold);

app.use((error: Error & { status?: number }, _req: express.Request, res: express.Response, _next: express.NextFunction) =>
  res.status(error.status ?? 400).json({ success: false, message: error.message }),
);

async function start() {
  // Refuse to start in production without the signing secret. Without it the
  // shared middleware degrades to trusting plain x-user-id headers, which on
  // this service is the difference between "the buyer released their own
  // escrow" and "anyone released anyone's".
  assertInternalIdentityConfigured('buyer-protection-service');

  // Fatal, unlike Kafka below: this service decides whose money is frozen, and
  // a hold it cannot durably record is a payout that either never releases or
  // releases with no record a dispute was blocking it.
  await connectDB();

  try {
    await connectProducer();
  } catch (err) {
    console.warn('[buyer-protection-service] Kafka producer unavailable (non-fatal):', err);
  }

  startEscrowReleaseWorker();

  const server = app.listen(env.port, () =>
    console.log(`[buyer-protection-service] 🚀 Listening on port ${env.port}`),
  );

  async function shutdown(signal: string) {
    console.log(`[buyer-protection-service] ${signal} — shutting down`);
    stopEscrowReleaseWorker();
    await disconnectProducer();
    await disconnectDB().catch(() => { /* already closing */ });
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(1), 10_000);
  }

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT',  () => shutdown('SIGINT'));
}

// Guarded so importing the app in a test does not bind a port or open a
// database connection — the same arrangement checkout-service uses. The route
// table above is what the authorization tests exercise, so they have to be able
// to import this module.
if (process.env.NODE_ENV !== 'test') {
  start().catch((err) => {
    console.error('[buyer-protection-service] Fatal startup error:', err);
    process.exit(1);
  });
}

export default app;
