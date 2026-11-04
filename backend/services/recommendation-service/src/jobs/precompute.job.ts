import { recommendationEngineService } from '../services/recommendation-engine.service.js';

let intervalId: NodeJS.Timeout | null = null;

export function startRecommendationPrecomputationJob(): void {
  console.log('[recommendation-service] 🔄 Starting background recommendation pre-computation job (runs hourly)...');

  // Run immediately on startup
  void runPrecomputation();

  // Run every 60 minutes
  intervalId = setInterval(() => {
    void runPrecomputation();
  }, 60 * 60 * 1000);
}

export function stopRecommendationPrecomputationJob(): void {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
  }
}

async function runPrecomputation(): Promise<void> {
  try {
    const startMs = Date.now();

    // 1. Pre-compute Trending Now
    const trending = await recommendationEngineService.getTrendingNow(10);

    // 2. Pre-compute Frequently Bought Together / item-similarity caches for key products
    const sampleProducts = ['phone-001', 'food-001', 'fashion-001'];
    for (const pid of sampleProducts) {
      await recommendationEngineService.getFrequentlyBoughtTogether(pid);
      await recommendationEngineService.getCustomersAlsoViewed(pid);
      await recommendationEngineService.getCustomersAlsoBought(pid);
    }

    const elapsedMs = Date.now() - startMs;
    console.log(`[recommendation-service] ✅ Pre-computed recommendations in ${elapsedMs}ms (Trending: ${trending.length} items). Redis cache warmed.`);
  } catch (err) {
    console.error('[recommendation-service] Error during recommendation pre-computation:', (err as Error).message);
  }
}
