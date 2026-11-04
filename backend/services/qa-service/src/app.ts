import 'dotenv/config';
import express from 'express';
import { internalCors } from '../../../shared/http/internal-cors.js';
import {
  requireAuth,
  requireRole,
  assertInternalIdentityConfigured,
} from '../../../shared/http/service-auth.middleware.js';
import { connectProducer, disconnectProducer } from '../../../shared/kafka/producer.js';
import * as qa from './controllers/qa.controller.js';
import { connectDB, disconnectDB, prisma } from './db/prisma.js';

const app = express();
app.use(internalCors());
app.use(express.json());

// Health Checks
app.get('/health/live', (_req, res) => {
  res.json({ service: 'qa-service', status: 'up', ts: new Date().toISOString() });
});
app.get('/health/ready', async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ service: 'qa-service', ready: true, db: 'connected', ts: new Date().toISOString() });
  } catch {
    res.status(503).json({ service: 'qa-service', ready: false, db: 'disconnected', ts: new Date().toISOString() });
  }
});
app.get('/health', (_req, res) => res.redirect('/health/live'));

// Product Q&A Routes
// ── Q&A Routes ────────────────────────────────────────────────────────────────
//
// Reading questions and answers is public: they are shown on the product page
// to shoppers who have not signed in, so both GETs stay open.
//
// Everything that writes carries the identity of whoever did it, and that
// identity now comes only from the gateway's signed assertion via
// res.locals.userId. Previously each handler took its actor from the request
// body or query string and fell back to a hardcoded 'user-123' / 'seller-001',
// so anyone could post, answer or vote as anyone.
//
// Answering is restricted to ROLE_SELLER: the handler records the actor as the
// answering seller and labels the reply with a store name, so a customer
// answering would be published as a seller.

// Public reads.
app.get('/api/v1/products/:productId/questions', qa.getProductQuestions);
app.get('/api/v1/questions/:id',                 qa.getQuestionById);

// Any signed-in shopper may ask a question and vote on an answer.
app.post('/api/v1/products/:productId/questions', requireAuth, qa.askQuestion);
app.put('/api/v1/answers/:id/helpful',            requireAuth, qa.voteHelpful);
app.put('/api/v1/answers/:id/not-helpful',        requireAuth, qa.voteNotHelpful);

// Sellers answer, and see the questions asked of them.
app.post('/api/v1/questions/:id/answers', requireRole('ROLE_SELLER'), qa.answerQuestion);
app.get('/api/v1/seller/questions',       requireRole('ROLE_SELLER'), qa.getSellerQuestions);

// Admin moderation.
app.post(
  '/api/v1/admin/questions/:id/feature',
  requireRole('ROLE_ADMIN', 'ROLE_SUPER_ADMIN'),
  qa.featureQuestion,
);

app.use((error: Error & { status?: number }, _req: express.Request, res: express.Response, _next: express.NextFunction) =>
  res.status(error.status ?? 400).json({ success: false, message: error.message }),
);

const PORT = Number(process.env.PORT ?? 4029);

async function start() {
  // Without the signing secret the guards above degrade to trusting x-user-id,
  // which would put this service straight back into the state where a caller
  // could answer or vote as anybody. Fatal in production, warn elsewhere.
  assertInternalIdentityConfigured('qa-service');

  // Fatal, unlike Kafka below: state this service cannot durably record is
  // state that silently disappears on the next restart.
  await connectDB();

  try {
    await connectProducer();
  } catch (err) {
    console.warn('[qa-service] Kafka producer unavailable (non-fatal):', err);
  }

  const server = app.listen(PORT, () =>
    console.log(`[qa-service] 🚀 Listening on port ${PORT}`),
  );

  async function shutdown(signal: string) {
    console.log(`[qa-service] ${signal} — shutting down`);
    await disconnectProducer();
    await disconnectDB().catch(() => { /* already closing */ });
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(1), 10_000);
  }

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT',  () => shutdown('SIGINT'));
}

start().catch((err) => {
  console.error('[qa-service] Fatal startup error:', err);
  process.exit(1);
});

export default app;
