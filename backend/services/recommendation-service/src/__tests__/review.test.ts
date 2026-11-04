import { jest, describe, it, expect, beforeEach } from '@jest/globals';

const mockPublish = jest.fn<() => Promise<void>>().mockResolvedValue();

jest.unstable_mockModule('../../../../shared/kafka/producer.js', () => ({
  publish: mockPublish,
  connectProducer: jest.fn<() => Promise<void>>().mockResolvedValue(),
  disconnectProducer: jest.fn<() => Promise<void>>().mockResolvedValue(),
  isProducerReady: jest.fn<() => boolean>().mockReturnValue(true),
}));

const { reviewService } = await import('../services/review.service.js');
const { sellerReputationService } = await import('../services/reputation.service.js');

describe('Phase 9 — Review & Reputation System', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Verified Purchase Enforcement', () => {
    it('blocks unverified buyers from leaving a review', async () => {
      await expect(
        reviewService.createProductReview({
          productId: 'prod-unbought',
          userId: 'user-guest',
          userName: 'Guest',
          rating: 5,
          title: 'Great product',
          body: 'Loved it so much!',
        })
      ).rejects.toThrow('Only verified buyers');
    });

    it('allows verified buyers to submit a product review', async () => {
      // Record delivered order
      reviewService.recordDeliveredPurchase('user-buyer-1', 'prod-bought-1');

      const review = await reviewService.createProductReview({
        productId: 'prod-bought-1',
        userId: 'user-buyer-1',
        userName: 'Verified Buyer',
        rating: 5,
        title: 'Authentic item',
        body: 'Arrived on time and works perfectly.',
      });

      expect(review.id).toBeDefined();
      expect(review.verifiedPurchase).toBe(true);
      expect(review.status).toBe('approved');
    });
  });

  describe('Profanity Filter & Moderation', () => {
    it('auto-flags review containing prohibited profanity terms', async () => {
      reviewService.recordDeliveredPurchase('user-buyer-2', 'prod-bought-2');

      const review = await reviewService.createProductReview({
        productId: 'prod-bought-2',
        userId: 'user-buyer-2',
        userName: 'Customer',
        rating: 1,
        title: 'This is a scam',
        body: 'Total scam link and fake_site!',
      });

      expect(review.status).toBe('flagged');
      expect(review.flagReason).toBe('profanity');
      expect(mockPublish).toHaveBeenCalledWith(
        'review-events',
        expect.objectContaining({ eventType: 'review.flagged_suspicious', reason: 'profanity' }),
        'prod-bought-2'
      );
    });

    it('allows admin to approve flagged reviews', async () => {
      reviewService.recordDeliveredPurchase('user-buyer-3', 'prod-bought-3');
      const review = await reviewService.createProductReview({
        productId: 'prod-bought-3',
        userId: 'user-buyer-3',
        userName: 'Customer',
        rating: 1,
        title: 'Scam alert',
        body: 'Is this a scam?',
      });

      expect(review.status).toBe('flagged');

      const approved = reviewService.moderateReview(review.id, 'approve');
      expect(approved.status).toBe('approved');
    });
  });

  describe('Seller 4-Factor Reputation Algorithm', () => {
    it('calculates weighted seller score (40% rating, 20% fulfillment, 20% response time, 20% low disputes)', () => {
      const reputation = sellerReputationService.calculateReputation({
        sellerId: 'seller-top-1',
        averageRating6Mo: 4.8,       // Rating 4.8 / 5.0 -> 95% rating score
        fulfillmentRatePercent: 98,   // 98% fulfillment score
        avgResponseTimeHours: 0.8,    // < 1h -> 100% response time score
        disputeReturnRatePercent: 0.5, // <= 1% -> 100% low dispute score
        totalReviewsCount: 120,
      });

      expect(reputation.sellerId).toBe('seller-top-1');
      expect(reputation.reputationPercent).toBeGreaterThanOrEqual(90);
      expect(reputation.badgeTier).toBe('Top Rated Seller');
      expect(reputation.searchRankMultiplier).toBe(1.30); // 30% search rank boost
    });

    it('penalizes sellers with high dispute rate and poor response time', () => {
      const reputation = sellerReputationService.calculateReputation({
        sellerId: 'seller-poor-1',
        averageRating6Mo: 2.5,
        fulfillmentRatePercent: 60,
        avgResponseTimeHours: 36.0,   // > 24h -> 40% score
        disputeReturnRatePercent: 8.0, // > 5% -> 30% score
        totalReviewsCount: 15,
      });

      expect(reputation.reputationPercent).toBeLessThan(50);
      expect(reputation.badgeTier).toBe('Under Review');
      expect(reputation.searchRankMultiplier).toBe(0.70); // 30% search rank penalty
    });
  });

  describe('Seller Public Replies', () => {
    it('allows seller to post a public reply to a review', async () => {
      reviewService.recordDeliveredPurchase('user-buyer-4', 'prod-bought-4');
      const review = await reviewService.createProductReview({
        productId: 'prod-bought-4',
        sellerId: 'seller-vendor-4',
        userId: 'user-buyer-4',
        userName: 'Customer',
        rating: 4,
        title: 'Good quality',
        body: 'Very good item.',
      });

      const updated = reviewService.addSellerReply(review.id, 'seller-vendor-4', 'Thank you for your review!');
      expect(updated.sellerReply).toBeDefined();
      expect(updated.sellerReply?.replyBody).toBe('Thank you for your review!');
    });
  });
});
