import { jest, describe, it, expect, beforeEach } from '@jest/globals';

const mockPublish = jest.fn<() => Promise<void>>().mockResolvedValue();

jest.unstable_mockModule('../../../../shared/kafka/producer.js', () => ({
  publish: mockPublish,
  connectProducer: jest.fn<() => Promise<void>>().mockResolvedValue(),
  disconnectProducer: jest.fn<() => Promise<void>>().mockResolvedValue(),
  isProducerReady: jest.fn<() => boolean>().mockReturnValue(true),
}));

const { sellerAnalyticsService } = await import('../services/seller-analytics.service.js');
const { adminAnalyticsService } = await import('../services/admin-analytics.service.js');

describe('Phase 11 — Analytics & Business Intelligence Engine', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Seller BI Dashboard Metrics', () => {
    it('calculates seller revenue, order distribution bins, conversion rate, and inventory health', async () => {
      const dashboard = await sellerAnalyticsService.getSellerDashboard('seller-001', 'month');

      expect(dashboard).toBeDefined();
      expect(dashboard.sellerId).toBe('seller-001');

      // Revenue breakdown
      expect(dashboard.revenue.month).toBeGreaterThan(0);
      expect(dashboard.revenue.currency).toBe('UGX');

      // Order value distribution bins (< 50k, 50k-150k, 150k-500k, > 500k UGX)
      expect(dashboard.orderValueDistribution).toHaveLength(4);
      expect(dashboard.orderValueDistribution[0].rangeLabel).toContain('< 50,000');

      // Top selling products
      expect(dashboard.topSellingProducts.byRevenue.length).toBeGreaterThan(0);
      expect(dashboard.topSellingProducts.byQuantity.length).toBeGreaterThan(0);

      // Conversion rate & refund rate
      expect(dashboard.conversion.conversionRatePercent).toBeGreaterThan(0);
      expect(dashboard.refunds.refundRatePercent).toBeGreaterThanOrEqual(0);

      // Inventory health
      expect(dashboard.inventoryHealth.fastMovingCount).toBeDefined();
      expect(dashboard.inventoryHealth.slowMovingCount).toBeDefined();
    });
  });

  describe('Admin Platform-Wide Executive Dashboard Metrics', () => {
    it('calculates GMV time-series, 12.5% platform commission, dispute rate, AOV, and CLV', async () => {
      const dashboard = await adminAnalyticsService.getAdminDashboard('month');

      expect(dashboard).toBeDefined();

      // GMV & Commission
      expect(dashboard.gmv.monthly).toBe(385400000);
      expect(dashboard.platformRevenue.commissionRatePercent).toBe(12.5);
      expect(dashboard.platformRevenue.commissionCollected).toBe(Math.round(385400000 * 0.125));

      // Disbursals & Disputes
      expect(dashboard.payouts.totalDisbursed).toBeGreaterThan(0);
      expect(dashboard.disputes.disputeRatePercent).toBe(1.0);

      // Top sellers ranking
      expect(dashboard.topSellers.length).toBeGreaterThan(0);
      expect(dashboard.topSellers[0].gmv).toBeGreaterThan(0);

      // Unit Economics: AOV & CLV
      expect(dashboard.unitEconomics.averageOrderValue).toBeGreaterThan(0);
      expect(dashboard.unitEconomics.customerLifetimeValue).toBeGreaterThan(dashboard.unitEconomics.averageOrderValue);
    });
  });
});
