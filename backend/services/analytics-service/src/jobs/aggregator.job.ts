import { sellerAnalyticsService } from '../services/seller-analytics.service.js';
import { adminAnalyticsService } from '../services/admin-analytics.service.js';
import { cache } from '../../../../shared/cache/redis.js';

let intervalId: NodeJS.Timeout | null = null;
const FIVE_MINUTES = 5 * 60; // 300 seconds TTL

export function startAnalyticsAggregatorJob(): void {
  console.log('[analytics-service] 🔄 Starting background hourly analytics pre-aggregation worker...');

  // Pre-aggregate immediately on startup
  void runPreaggregation();

  // Run pre-aggregation hourly
  intervalId = setInterval(() => {
    void runPreaggregation();
  }, 60 * 60 * 1000);
}

export function stopAnalyticsAggregatorJob(): void {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
  }
}

async function runPreaggregation(): Promise<void> {
  try {
    const startMs = Date.now();

    // 1. Pre-aggregate Admin Dashboard
    const adminData = await adminAnalyticsService.getAdminDashboard('month');
    await cache.set('analytics:admin:month', adminData, FIVE_MINUTES);

    // 2. Pre-aggregate Top Seller Dashboards
    const sampleSellers = ['seller-001', 'seller-002', 'ven-001', 'ven-002'];
    for (const sellerId of sampleSellers) {
      const sellerData = await sellerAnalyticsService.getSellerDashboard(sellerId, 'month');
      await cache.set(`analytics:seller:${sellerId}:month`, sellerData, FIVE_MINUTES);
    }

    const elapsedMs = Date.now() - startMs;
    console.log(`[analytics-service] ✅ Hourly analytics pre-aggregation completed in ${elapsedMs}ms. Redis cache warmed (5-minute TTL).`);
  } catch (err) {
    console.error('[analytics-service] Error during analytics pre-aggregation:', (err as Error).message);
  }
}
