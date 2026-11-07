"""Algorithm parity tests verifying cosine similarity, association mining, decay, and reputation formulas."""
from __future__ import annotations

import math
import time
import pytest

from app.services.similarity_service import item_similarity_service, compute_bundle_discount_percent
from app.services.affinity_service import user_affinity_service, EVENT_WEIGHTS, HALF_LIFE_HOURS
from app.services.reputation_service import seller_reputation_service
from app.services.recommendation_engine_service import recommendation_engine_service
from app.store.event_store import record_purchase, record_view


class TestSimilarityAndAssociationParity:
    def test_cosine_similarity(self):
        """sim(i,j) = |U_i ∩ U_j| / sqrt(|U_i| * |U_j|)"""
        similar = item_similarity_service.get_similar_products("phone-001", limit=5)
        assert len(similar) > 0
        assert similar[0].productId != "phone-001"
        for s in similar:
            assert 0.0 <= s.score <= 1.0

    def test_association_rules_and_bundle_discount(self):
        """phone-001 is co-purchased with case-001 & charger-001 in all 4 seeded orders."""
        rules = item_similarity_service.get_association_rules("phone-001", top_n=2)
        assert len(rules) == 2
        for r in rules:
            assert r.confidence == 1.0  # Co-purchased in 100% of orders with phone-001
            assert r.lift > 0.0

        # High confidence (1.0 >= 0.6) yields top 15% discount
        discount_pct = compute_bundle_discount_percent(rules[0].confidence)
        assert discount_pct == 15.0

        # Tier testing
        assert compute_bundle_discount_percent(0.65) == 15.0
        assert compute_bundle_discount_percent(0.40) == 10.0
        assert compute_bundle_discount_percent(0.15) == 5.0


class TestUserAffinityAndDecayParity:
    @pytest.mark.anyio
    async def test_exponential_recency_decay(self):
        user_id = "decay-test-user"
        now = int(time.time() * 1000)

        # Record view 6 hours ago
        six_hours_ago = now - int(6 * 60 * 60 * 1000)
        await user_affinity_service.record_event({
            "userId": user_id,
            "eventType": "product_view",
            "productId": "phone-001",
            "category": "electronics",
            "timestamp": six_hours_ago,
        })

        # At 6 hours (1 half-life), score should decay to approximately 50%
        profile = await user_affinity_service.get_profile(user_id)
        assert "electronics" in profile.categoryAffinity
        score = profile.categoryAffinity["electronics"]
        # Initial weight was 1.0, decayed by 0.5^(6/6) = 0.5
        assert math.isclose(score, 0.5, rel_tol=0.1)

    @pytest.mark.anyio
    async def test_event_weights(self):
        user_id = "weights-test-user"
        now = int(time.time() * 1000)

        await user_affinity_service.record_event({
            "userId": user_id,
            "eventType": "add_to_cart",
            "category": "electronics",
            "timestamp": now,
        })
        profile = await user_affinity_service.get_profile(user_id)
        assert math.isclose(profile.categoryAffinity["electronics"], 4.0, rel_tol=0.01)


class TestReputationAlgorithmParity:
    def test_top_rated_seller_formula(self):
        rep = seller_reputation_service.calculate_reputation(
            seller_id="seller-top",
            average_rating_6mo=4.8,
            fulfillment_rate_percent=98.0,
            avg_response_time_hours=0.8,
            dispute_return_rate_percent=0.5,
            total_reviews_count=120,
        )
        assert rep.reputationPercent >= 88.0
        assert rep.badgeTier == "Top Rated Seller"
        assert rep.searchRankMultiplier == 1.30

    def test_under_review_seller_formula(self):
        rep = seller_reputation_service.calculate_reputation(
            seller_id="seller-low",
            average_rating_6mo=2.5,
            fulfillment_rate_percent=60.0,
            avg_response_time_hours=36.0,
            dispute_return_rate_percent=8.0,
            total_reviews_count=15,
        )
        assert rep.reputationPercent < 50.0
        assert rep.badgeTier == "Under Review"
        assert rep.searchRankMultiplier == 0.70
