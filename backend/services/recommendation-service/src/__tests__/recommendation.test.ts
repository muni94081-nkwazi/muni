import { jest, describe, it, expect, beforeEach } from '@jest/globals';

const mockPublish = jest.fn<() => Promise<void>>().mockResolvedValue();

jest.unstable_mockModule('../../../../shared/kafka/producer.js', () => ({
  publish: mockPublish,
  connectProducer: jest.fn<() => Promise<void>>().mockResolvedValue(),
  disconnectProducer: jest.fn<() => Promise<void>>().mockResolvedValue(),
  isProducerReady: jest.fn<() => boolean>().mockReturnValue(true),
}));

const { recommendationEngineService } = await import('../services/recommendation-engine.service.js');
const { userAffinityService } = await import('../services/affinity.service.js');

describe('Phase 10 — AI-Powered Recommendation Strategies', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Strategy 1: Customers Also Viewed', () => {
    it('returns collaborative filtering recommendations based on co-view history', async () => {
      const reco = await recommendationEngineService.getCustomersAlsoViewed('phone-001', 5);

      expect(reco).toBeDefined();
      expect(Array.isArray(reco)).toBe(true);
      expect(reco.length).toBeGreaterThan(0);
      expect(reco[0].reason).toBe('also_viewed');
      expect(reco[0].productId).not.toBe('phone-001');
    });
  });

  describe('Strategy 2: Frequently Bought Together', () => {
    it('auto-calculates the bundle discount from association-rule confidence', async () => {
      const bundle = await recommendationEngineService.getFrequentlyBoughtTogether('phone-001');

      expect(bundle).toBeDefined();
      expect(bundle.primaryProductId).toBe('phone-001');
      expect(bundle.bundleItems.length).toBeGreaterThan(0);
      // phone-001 is co-purchased with case-001/charger-001 in every seeded order
      // (confidence 1.0), so the auto-calculator should land on the top discount tier.
      expect(bundle.bundleDiscountPercent).toBe(15);
      expect(bundle.bundleDiscountPrice).toBe(Math.round(bundle.originalTotalPrice * (1 - bundle.bundleDiscountPercent / 100)));
      expect(bundle.savingsAmount).toBe(bundle.originalTotalPrice - bundle.bundleDiscountPrice);
    });
  });

  describe('Strategy: Customers Who Bought This Also Bought (item-item similarity)', () => {
    it('returns cosine-similarity based purchase recommendations', async () => {
      const reco = await recommendationEngineService.getCustomersAlsoBought('phone-001', 5);

      expect(reco).toBeDefined();
      expect(reco.length).toBeGreaterThan(0);
      expect(reco[0].productId).not.toBe('phone-001');
      expect(reco.every((item) => item.score >= 0 && item.score <= 1)).toBe(true);
    });
  });

  describe('Real-Time Home Feed', () => {
    it('always includes a trending fallback section so the feed is never empty', async () => {
      const feed = await recommendationEngineService.getHomeFeed('user-with-no-history', 5);

      expect(feed.sections.length).toBeGreaterThan(0);
      const trendingSection = feed.sections.find((s) => s.key === 'trending-now');
      expect(trendingSection).toBeDefined();
      expect(trendingSection!.items.length).toBeGreaterThan(0);
    });

    it('surfaces a category-affinity section once the user has clickstream signal', async () => {
      // Simulate clickstream events landing via the Redis Streams consumer
      await userAffinityService.recordEvent({ userId: 'user-affinity-test', eventType: 'category_browse', category: 'groceries', timestamp: Date.now() });
      await userAffinityService.recordEvent({ userId: 'user-affinity-test', eventType: 'add_to_cart', productId: 'food-001', category: 'groceries', timestamp: Date.now() });

      const feed = await recommendationEngineService.getHomeFeed('user-affinity-test', 5);
      const pickedForYou = feed.sections.find((s) => s.key === 'picked-for-you');
      const becauseYouBrowsed = feed.sections.find((s) => s.key === 'because-you-browsed');
      expect(pickedForYou).toBeDefined();
      expect(becauseYouBrowsed).toBeDefined();
      expect(becauseYouBrowsed!.title).toContain('groceries');
    });
  });

  describe('Strategy 3: Personalized For You', () => {
    it('applies recency weighting and excludes products user already purchased', async () => {
      // Record view for user-test-1
      await recommendationEngineService.trackView('user-test-1', 'phone-001', 'electronics');
      // Record purchase for user-test-1
      await recommendationEngineService.trackPurchase('user-test-1', 'phone-001', 'ord-99');

      const personalized = await recommendationEngineService.getPersonalizedForUser('user-test-1', 5);

      expect(personalized).toBeDefined();
      // phone-001 should be excluded because user-test-1 already purchased it
      const hasPurchasedPhone = personalized.some((item) => item.productId === 'phone-001');
      expect(hasPurchasedPhone).toBe(false);

      // Remaining items should have personalized reason
      expect(personalized[0].reason).toBe('personalized');
    });
  });

  describe('Strategy 4: Trending Now', () => {
    it('returns top trending products based on 24h conversion velocity', async () => {
      const trending = await recommendationEngineService.getTrendingNow(5);

      expect(trending).toBeDefined();
      expect(trending.length).toBeGreaterThan(0);
      expect(trending[0].reason).toBe('trending');
    });
  });
});
