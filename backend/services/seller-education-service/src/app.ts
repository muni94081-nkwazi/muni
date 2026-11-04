import 'dotenv/config';
import express from 'express';
import { internalCors } from '../../../shared/http/internal-cors.js';
import { connectProducer, disconnectProducer } from '../../../shared/kafka/producer.js';
import * as edu from './controllers/seller-education.controller.js';
import { connectDB, disconnectDB, prisma } from './db/prisma.js';

const app = express();
app.use(internalCors());
app.use(express.json());

// Health Checks
app.get('/health/live', (_req, res) => {
  res.json({ service: 'seller-education-service', status: 'up', ts: new Date().toISOString() });
});
app.get('/health/ready', async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ service: 'seller-education-service', ready: true, db: 'connected', ts: new Date().toISOString() });
  } catch {
    res.status(503).json({ service: 'seller-education-service', ready: false, db: 'disconnected', ts: new Date().toISOString() });
  }
});
app.get('/health', (_req, res) => res.redirect('/health/live'));

// Seller Education & Onboarding Routes
app.get('/api/v1/seller-education/courses',               edu.getCourses);
app.get('/api/v1/seller-education/courses/:id',           edu.getCourseById);
app.post('/api/v1/seller-education/progress',             edu.recordProgress);
app.get('/api/v1/seller-education/onboarding/:sellerId',  edu.getOnboardingProgress);
app.get('/api/v1/seller-education/webinars',              edu.getWebinars);
app.post('/api/v1/seller-education/webinars/:id/register', edu.registerForWebinar);

app.use((error: Error & { status?: number }, _req: express.Request, res: express.Response, _next: express.NextFunction) =>
  res.status(error.status ?? 400).json({ success: false, message: error.message }),
);

const PORT = Number(process.env.PORT ?? 4028);

async function start() {
  // Fatal, unlike Kafka below: progress this service cannot durably record
  // resets a seller's onboarding every time the process restarts.
  await connectDB();

  try {
    await connectProducer();
  } catch (err) {
    console.warn('[seller-education-service] Kafka producer unavailable (non-fatal):', err);
  }

  const server = app.listen(PORT, () =>
    console.log(`[seller-education-service] 🚀 Listening on port ${PORT}`),
  );

  async function shutdown(signal: string) {
    console.log(`[seller-education-service] ${signal} — shutting down`);
    await disconnectProducer();
    await disconnectDB().catch(() => { /* already closing */ });
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(1), 10_000);
  }

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT',  () => shutdown('SIGINT'));
}

start().catch((err) => {
  console.error('[seller-education-service] Fatal startup error:', err);
  process.exit(1);
});

export default app;
