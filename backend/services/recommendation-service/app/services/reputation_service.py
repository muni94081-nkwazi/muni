"""Seller 4-factor reputation score calculation matching reputation.service.ts."""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Dict, Optional
from app.models.review import (
    SellerReputation,
    ReputationBadgeTier,
    ReputationFactors,
    ReputationMetrics,
)


class RawSellerPerformanceMetrics:
    def __init__(
        self,
        seller_id: str,
        average_rating_6mo: Optional[float] = None,
        fulfillment_rate_percent: Optional[float] = None,
        avg_response_time_hours: Optional[float] = None,
        dispute_return_rate_percent: Optional[float] = None,
        total_reviews_count: Optional[int] = None,
    ):
        self.seller_id = seller_id
        self.average_rating_6mo = average_rating_6mo
        self.fulfillment_rate_percent = fulfillment_rate_percent
        self.avg_response_time_hours = avg_response_time_hours
        self.dispute_return_rate_percent = dispute_return_rate_percent
        self.total_reviews_count = total_reviews_count


class SellerReputationService:
    def __init__(self):
        self._reputation_cache: Dict[str, SellerReputation] = {}

    def calculate_reputation(
        self,
        seller_id: str,
        average_rating_6mo: Optional[float] = None,
        fulfillment_rate_percent: Optional[float] = None,
        avg_response_time_hours: Optional[float] = None,
        dispute_return_rate_percent: Optional[float] = None,
        total_reviews_count: Optional[int] = None,
    ) -> SellerReputation:
        avg_rating = min(5.0, max(1.0, average_rating_6mo if average_rating_6mo is not None else 4.5))
        fulfillment_percent = min(100.0, max(0.0, fulfillment_rate_percent if fulfillment_rate_percent is not None else 96.0))
        response_time_hours = max(0.0, avg_response_time_hours if avg_response_time_hours is not None else 1.5)
        dispute_percent = min(100.0, max(0.0, dispute_return_rate_percent if dispute_return_rate_percent is not None else 1.2))
        total_reviews = max(0, total_reviews_count if total_reviews_count is not None else 45)

        # 1. Average Rating Score (40% Weight): Map 1.0-5.0 to 0-100%
        rating_score_percent = ((avg_rating - 1.0) / 4.0) * 100.0

        # 2. Fulfillment Rate Score (20% Weight): Direct 0-100%
        fulfillment_score_percent = fulfillment_percent

        # 3. Response Time Score (20% Weight)
        if response_time_hours <= 1.0:
            response_time_score_percent = 100.0
        elif response_time_hours <= 4.0:
            response_time_score_percent = 85.0
        elif response_time_hours <= 24.0:
            response_time_score_percent = 65.0
        else:
            response_time_score_percent = 40.0

        # 4. Low Dispute / Return Rate Score (20% Weight)
        if dispute_percent <= 1.0:
            dispute_score_percent = 100.0
        elif dispute_percent <= 2.5:
            dispute_score_percent = 85.0
        elif dispute_percent <= 5.0:
            dispute_score_percent = 60.0
        else:
            dispute_score_percent = 30.0

        # Weighted formula
        weighted_percent = (
            rating_score_percent * 0.40
            + fulfillment_score_percent * 0.20
            + response_time_score_percent * 0.20
            + dispute_score_percent * 0.20
        )

        reputation_percent = round(weighted_percent * 10) / 10
        reputation_score = round((reputation_percent / 100.0) * 5.0 * 100) / 100

        # Determine Badge Tier & Search Ranking Multiplier
        if reputation_percent >= 88.0:
            badge_tier: ReputationBadgeTier = "Top Rated Seller"
            search_rank_multiplier = 1.30  # 30% boost
        elif reputation_percent >= 75.0:
            badge_tier = "Trusted Seller"
            search_rank_multiplier = 1.15  # 15% boost
        elif reputation_percent >= 50.0:
            badge_tier = "Standard Seller"
            search_rank_multiplier = 1.0
        else:
            badge_tier = "Under Review"
            search_rank_multiplier = 0.70  # 30% penalty

        now = (
            datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.")
            + f"{datetime.now(timezone.utc).microsecond // 1000:03d}Z"
        )

        result = SellerReputation(
            sellerId=seller_id,
            reputationScore=reputation_score,
            reputationPercent=reputation_percent,
            badgeTier=badge_tier,
            factors=ReputationFactors(
                averageRating6Mo=round(rating_score_percent * 10) / 10,
                fulfillmentRate=round(fulfillment_score_percent * 10) / 10,
                responseTimeScore=round(response_time_score_percent * 10) / 10,
                lowDisputeReturnScore=round(dispute_score_percent * 10) / 10,
            ),
            metrics=ReputationMetrics(
                averageRating=avg_rating,
                fulfillmentRatePercent=fulfillment_percent,
                avgResponseTimeHours=response_time_hours,
                disputeReturnRatePercent=dispute_percent,
                totalReviewsCount=total_reviews,
            ),
            searchRankMultiplier=search_rank_multiplier,
            updatedAt=now,
        )

        self._reputation_cache[seller_id] = result
        return result

    def get_reputation(self, seller_id: str) -> SellerReputation:
        if seller_id not in self._reputation_cache:
            return self.calculate_reputation(seller_id=seller_id)
        return self._reputation_cache[seller_id]

    def reset_for_tests(self) -> None:
        self._reputation_cache.clear()


seller_reputation_service = SellerReputationService()
