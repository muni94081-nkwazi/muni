import type { SellerReputation, ReputationBadgeTier } from '../models/review.model.js';

export interface RawSellerPerformanceMetrics {
  sellerId: string;
  averageRating6Mo?: number;      // 1.0 to 5.0
  fulfillmentRatePercent?: number; // 0 to 100%
  avgResponseTimeHours?: number;   // Hours (e.g., 1.2)
  disputeReturnRatePercent?: number; // 0 to 100%
  totalReviewsCount?: number;
}

export class SellerReputationService {
  private reputationCache = new Map<string, SellerReputation>();

  calculateReputation(input: RawSellerPerformanceMetrics): SellerReputation {
    const avgRating = Math.min(5.0, Math.max(1.0, input.averageRating6Mo ?? 4.5));
    const fulfillmentPercent = Math.min(100, Math.max(0, input.fulfillmentRatePercent ?? 96));
    const responseTimeHours = Math.max(0, input.avgResponseTimeHours ?? 1.5);
    const disputePercent = Math.min(100, Math.max(0, input.disputeReturnRatePercent ?? 1.2));
    const totalReviews = Math.max(0, input.totalReviewsCount ?? 45);

    // 1. Average Rating Score (40% Weight): Map 1.0-5.0 to 0-100%
    const ratingScorePercent = ((avgRating - 1.0) / 4.0) * 100;

    // 2. Fulfillment Rate Score (20% Weight): Direct 0-100%
    const fulfillmentScorePercent = fulfillmentPercent;

    // 3. Response Time Score (20% Weight)
    let responseTimeScorePercent = 100;
    if (responseTimeHours <= 1.0) {
      responseTimeScorePercent = 100;
    } else if (responseTimeHours <= 4.0) {
      responseTimeScorePercent = 85;
    } else if (responseTimeHours <= 24.0) {
      responseTimeScorePercent = 65;
    } else {
      responseTimeScorePercent = 40;
    }

    // 4. Low Dispute / Return Rate Score (20% Weight)
    let disputeScorePercent = 100;
    if (disputePercent <= 1.0) {
      disputeScorePercent = 100;
    } else if (disputePercent <= 2.5) {
      disputeScorePercent = 85;
    } else if (disputePercent <= 5.0) {
      disputeScorePercent = 60;
    } else {
      disputeScorePercent = 30;
    }

    // Weighted Formula calculation
    const weightedPercent =
      ratingScorePercent * 0.40 +
      fulfillmentScorePercent * 0.20 +
      responseTimeScorePercent * 0.20 +
      disputeScorePercent * 0.20;

    const reputationPercent = Math.round(weightedPercent * 10) / 10;
    const reputationScore = Math.round((reputationPercent / 100) * 5.0 * 100) / 100;

    // Determine Badge Tier & Search Ranking Multiplier
    let badgeTier: ReputationBadgeTier = 'Standard Seller';
    let searchRankMultiplier = 1.0;

    if (reputationPercent >= 88) {
      badgeTier = 'Top Rated Seller';
      searchRankMultiplier = 1.30; // 30% boost in search rank
    } else if (reputationPercent >= 75) {
      badgeTier = 'Trusted Seller';
      searchRankMultiplier = 1.15; // 15% boost in search rank
    } else if (reputationPercent >= 50) {
      badgeTier = 'Standard Seller';
      searchRankMultiplier = 1.0;
    } else {
      badgeTier = 'Under Review';
      searchRankMultiplier = 0.70; // 30% penalty in search rank
    }

    const result: SellerReputation = {
      sellerId: input.sellerId,
      reputationScore,
      reputationPercent,
      badgeTier,
      factors: {
        averageRating6Mo:      Math.round(ratingScorePercent * 10) / 10,
        fulfillmentRate:       Math.round(fulfillmentScorePercent * 10) / 10,
        responseTimeScore:     Math.round(responseTimeScorePercent * 10) / 10,
        lowDisputeReturnScore: Math.round(disputeScorePercent * 10) / 10,
      },
      metrics: {
        averageRating:            avgRating,
        fulfillmentRatePercent:   fulfillmentPercent,
        avgResponseTimeHours:     responseTimeHours,
        disputeReturnRatePercent: disputePercent,
        totalReviewsCount:        totalReviews,
      },
      searchRankMultiplier,
      updatedAt: new Date().toISOString(),
    };

    this.reputationCache.set(input.sellerId, result);
    return result;
  }

  getReputation(sellerId: string): SellerReputation {
    if (!this.reputationCache.has(sellerId)) {
      // Calculate defaults if not cached
      return this.calculateReputation({ sellerId });
    }
    return this.reputationCache.get(sellerId)!;
  }
}

export const sellerReputationService = new SellerReputationService();
