import { jest, describe, it, expect, beforeEach } from '@jest/globals';

const mockPublish = jest.fn<() => Promise<void>>().mockResolvedValue();

jest.unstable_mockModule('../../../../shared/kafka/producer.js', () => ({
  publish: mockPublish,
  connectProducer: jest.fn<() => Promise<void>>().mockResolvedValue(),
  disconnectProducer: jest.fn<() => Promise<void>>().mockResolvedValue(),
  isProducerReady: jest.fn<() => boolean>().mockReturnValue(true),
}));

const { AdvertisingService } = await import('../services/advertising.service.js');
const { MemoryAdvertisingRepository } = await import('../repositories/memory-advertising.repository.js');

// One instance for the whole suite: these tests chain, and two of them depend
// on the `ad-camp-seed-1` campaign the service used to hardcode into its Map.
// It carried 84 clicks and 42,000 UGX of invented spend against a real seller
// id, so it is seeded here rather than written into a database.
const repo = new MemoryAdvertisingRepository();
const advertisingService = new AdvertisingService(repo);

const seedNow = new Date().toISOString();
repo.seed({
  id: 'ad-camp-seed-1',
  sellerId: 'seller-001',
  productId: 'phone-001',
  productName: 'Samsung Galaxy S24 Ultra',
  campaignName: 'Galaxy S24 Search Ads',
  dailyBudgetUGX: 100000,
  bidPerClickUGX: 500,
  keywords: ['phone', 'samsung', 'galaxy', 'smartphone', 'mobile'],
  status: 'ACTIVE',
  totalImpressions: 1250,
  totalClicks: 84,
  totalSpentUGX: 42000,
  startDate: seedNow,
  createdAt: seedNow,
  updatedAt: seedNow,
});

describe('Phase 17 — Advertising PPC Service Unit Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('creates a new sponsored product PPC campaign', async () => {
    const campaign = await advertisingService.createCampaign({
      sellerId: 'seller-test-1',
      productId: 'phone-002',
      productName: 'iPhone 15 Pro',
      campaignName: 'iPhone Search Campaign',
      dailyBudgetUGX: 200000,
      bidPerClickUGX: 800,
      keywords: ['iphone', 'apple', 'mobile'],
    });

    expect(campaign.id).toBeDefined();
    expect(campaign.status).toBe('ACTIVE');
    expect(campaign.bidPerClickUGX).toBe(800);
  });

  it('returns active sponsored products matching search keywords', async () => {
    const products = await advertisingService.getSponsoredProducts('phone');
    expect(products.length).toBeGreaterThan(0);
    expect(products[0].isSponsoredBadge).toBe(true);
  });

  it('records ad clicks and deducts bid from campaign budget', async () => {
    const campaign = await advertisingService.createCampaign({
      sellerId: 'seller-test-2',
      productId: 'phone-003',
      productName: 'Pixel 8',
      campaignName: 'Pixel Campaign',
      dailyBudgetUGX: 1000, // Small budget for testing exhaustion
      bidPerClickUGX: 500,
      keywords: ['pixel'],
    });

    const click1 = await advertisingService.recordClick(campaign.id, '127.0.0.1');
    expect(click1).not.toBeNull();
    expect(click1?.chargedAmountUGX).toBe(500);

    const click2 = await advertisingService.recordClick(campaign.id, '127.0.0.1');
    expect(click2).not.toBeNull();

    // 3rd click should fail because 1000 budget is exhausted (2 x 500 = 1000)
    const click3 = await advertisingService.recordClick(campaign.id, '127.0.0.1');
    expect(click3).toBeNull();
  });

  it('computes campaign performance analytics (CTR, CPC, Spend)', async () => {
    const analytics = await advertisingService.getAnalytics('seller-001');
    expect(analytics.totalCampaigns).toBeGreaterThan(0);
    expect(analytics.averageCTRPercent).toBeDefined();
  });
});
