import 'dotenv/config';
import express from 'express';
import { internalCors } from '../../../shared/http/internal-cors.js';
import { connectCache, disconnectCache, isCacheReady } from '../../../shared/cache/redis.js';
import { getStreamPublisher } from '../../../infrastructure/redis/streams.js';
import * as review from './controllers/review.controller.js';
import * as reco from './controllers/recommendation.controller.js';
import { startEventsConsumer, stopEventsConsumer } from './consumers/events.consumer.js';
import { startClickstreamConsumer, stopClickstreamConsumer } from './consumers/clickstream.consumer.js';
import { startRecommendationPrecomputationJob, stopRecommendationPrecomputationJob } from './jobs/precompute.job.js';

// ─── Express App ───────────────────────────────────────────────────────────────

const app = express();
app.use(internalCors());
app.use(express.json());

// ─── Health Checks ─────────────────────────────────────────────────────────────

app.get('/health/live', (_req, res) => {
  res.json({ service: 'recommendation-service', status: 'up', ts: new Date().toISOString() });
});

app.get('/health/ready', (_req, res) => {
  res.json({ service: 'recommendation-service', ready: true, redis: isCacheReady() ? 'up' : 'degraded', ts: new Date().toISOString() });
});

app.get('/health', (_req, res) => res.redirect('/health/live'));

// ─── Phase 10 Recommendation Strategy Routes ───────────────────────────────────

// Strategy 1: "Customers Also Viewed"
app.get('/api/v1/recommendations/also-viewed/:productId', reco.getCustomersAlsoViewed);

// Strategy 2: "Customers Who Bought This Also Bought" (Item-Item Similarity Matrix)
app.get('/api/v1/recommendations/also-bought/:productId', reco.getCustomersAlsoBought);

// Strategy 3: "Frequently Bought Together" (auto-calculated bundle discount)
app.get('/api/v1/recommendations/frequently-bought-together/:productId', reco.getFrequentlyBoughtTogether);

// Strategy 4: "Personalized For You" (Recency weighted & purchase exclusions)
app.get('/api/v1/recommendations/personalized', reco.getPersonalized);
app.get('/api/recommendations/personalized',    reco.getPersonalized); // Standard alias

// Strategy 5: "Trending Now" (24h conversion velocity + cart-add signal)
app.get('/api/v1/recommendations/trending', reco.getTrendingNow);

// Strategy 6: Real-Time Personalized Home Feed (affinity + personalized + trending)
app.get('/api/v1/recommendations/home-feed', reco.getHomeFeed);
app.get('/recommendations/home-feed',        reco.getHomeFeed); // Standard alias per spec

// Event Tracking Signals
app.post('/api/v1/recommendations/track/view',        reco.trackViewEvent);
app.post('/api/v1/recommendations/track/purchase',    reco.trackPurchaseEvent);
app.post('/api/v1/recommendations/track/clickstream', reco.trackClickstreamEvent);

// Legacy routes kept for compatibility
app.get('/api/v1/recommendations/products',          reco.getPersonalized);
app.get('/api/v1/recommendations/similar/:productId', reco.getCustomersAlsoViewed);
app.post('/api/v1/recommendations/events',           reco.trackViewEvent);

// ─── Verified Product & Seller Review Routes (Phase 9) ─────────────────────────

app.post('/api/v1/products/:id/reviews',    review.createProductReview);
app.get ('/api/v1/products/:id/reviews',    review.getProductReviews);
app.post('/api/v1/sellers/:id/reviews',     review.createSellerReview);
app.get ('/api/v1/sellers/:id/reviews',     review.getSellerReviews);

// ─── Seller 4-Factor Reputation Score Route ───────────────────────────────────

app.get('/api/v1/sellers/:id/reputation',  review.getSellerReputation);

// ─── Admin Review Moderation Panel & Seller Public Replies ────────────────────

app.get  ('/api/v1/admin/reviews/flagged',   review.listFlaggedReviews);
app.patch('/api/v1/admin/reviews/:id/moderate', review.moderateReview);
app.post ('/api/v1/seller/reviews/:id/reply',  review.addSellerReply);

// ─── Error Handler ────────────────────────────────────────────────────────────

app.use((
  error: Error & { status?: number },
  _req:  express.Request,
  res:   express.Response,
  _next: express.NextFunction,
) => res.status(error.status ?? 400).json({ success: false, message: error.message }));

// ─── Startup ───────────────────────────────────────────────────────────────────

const PORT = Number(process.env.PORT ?? 4008);

async function start() {
  try {
    await connectCache('recommendation-service');
  } catch (err) {
    console.warn('[recommendation-service] Redis unavailable — caching disabled:', err);
  }

  try {
    await startEventsConsumer();
  } catch (err) {
    console.warn('[recommendation-service] Kafka consumer failed to start (non-fatal):', err);
  }

  try {
    await getStreamPublisher().connect();
  } catch (err) {
    console.warn('[recommendation-service] Redis Streams publisher unavailable (non-fatal):', err);
  }

  try {
    await startClickstreamConsumer();
  } catch (err) {
    console.warn('[recommendation-service] Clickstream consumer failed to start (non-fatal):', err);
  }

  // Start background recommendation pre-computation job
  startRecommendationPrecomputationJob();

  const server = app.listen(PORT, () =>
    console.log(`[recommendation-service] 🚀 Listening on port ${PORT}`),
  );

  async function shutdown(signal: string) {
    console.log(`[recommendation-service] ${signal} — shutting down`);
    stopRecommendationPrecomputationJob();
    await stopEventsConsumer();
    await stopClickstreamConsumer();
    try {
      await getStreamPublisher().disconnect();
    } catch {
      // already disconnected / never connected
    }
    await disconnectCache();
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(1), 10_000);
  }

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT',  () => shutdown('SIGINT'));
}

start().catch((err) => {
  console.error('[recommendation-service] Fatal startup error:', err);
  process.exit(1);
});

export default app;
