from datetime import datetime, timezone
from app.models.seller_trust import SellerTrustStats, SellerStanding
from app.services.seller_trust_service import (
    compute_score,
    assign_badges,
    build_scorecard,
    evaluate_standing,
)


def make_stats(**overrides) -> SellerTrustStats:
    default_vals = {
        "id": "stats-1",
        "userId": "seller-1",
        "totalOrders": 0,
        "onTimeDeliveries": 0,
        "lateDeliveries": 0,
        "disputesOpened": 0,
        "disputesResolvedSellerFavor": 0,
        "disputesResolvedBuyerFavor": 0,
        "defectReportsINAD": 0,
        "slaBreaches": 0,
        "lateShipments": 0,
        "cancelledBySeller": 0,
        "ordersAccepted": 0,
        "claimsGranted": 0,
        "policyViolations": 0,
        "totalResponseHours": 0.0,
        "resolvedResponseCount": 0,
        "isVerifiedMerchant": False,
        "trustScore": 70.0,
        "badges": [],
        "standing": SellerStanding.GOOD,
        "standingReason": None,
        "standingChangedAt": None,
        "lastCalculatedAt": datetime.now(timezone.utc),
        "createdAt": datetime.now(timezone.utc),
        "updatedAt": datetime.now(timezone.utc),
    }
    default_vals.update(overrides)
    return SellerTrustStats(**default_vals)


class TestComputeScore:
    def test_cold_start_score_for_new_seller(self):
        score, breakdown = compute_score(make_stats())
        assert score == 70
        assert breakdown is None

    def test_scores_flawless_seller_at_top(self):
        score, breakdown = compute_score(
            make_stats(
                totalOrders=50,
                onTimeDeliveries=50,
                resolvedResponseCount=5,
                totalResponseHours=0.0,
            )
        )
        assert score == 100
        assert breakdown is not None
        assert breakdown.onTimeDeliveryRate == 1.0

    def test_counts_dispute_as_at_least_one_order(self):
        score, breakdown = compute_score(make_stats(totalOrders=0, disputesOpened=1))
        assert breakdown is not None
        assert breakdown.disputeRate == 1.0
        assert score < 70

    def test_penalises_late_delivery(self):
        punctual, _ = compute_score(make_stats(totalOrders=10, onTimeDeliveries=10))
        tardy, _ = compute_score(make_stats(totalOrders=10, onTimeDeliveries=5, lateDeliveries=5))
        assert tardy < punctual


class TestAssignBadges:
    def test_top_rated_seller_requires_volume(self):
        excellent = make_stats(totalOrders=25, onTimeDeliveries=25)
        assert "Top Rated Seller" in assign_badges(excellent, 100)

        unproven = make_stats(totalOrders=3, onTimeDeliveries=3)
        assert "Top Rated Seller" not in assign_badges(unproven, 100)

    def test_fast_shipper_on_delivery_punctuality(self):
        badges = assign_badges(make_stats(totalOrders=12, onTimeDeliveries=12), 80)
        assert "Fast Shipper" in badges

    def test_verified_merchant_when_admin_granted(self):
        assert "Verified Merchant" in assign_badges(make_stats(isVerifiedMerchant=True), 70)
        assert "Verified Merchant" not in assign_badges(make_stats(isVerifiedMerchant=False), 70)


class TestBuildScorecard:
    def test_reports_insufficient_data_below_min_sample_size(self):
        card = build_scorecard(make_stats(ordersAccepted=3, defectReportsINAD=1))
        assert card.orderDefectRate.status == "INSUFFICIENT_DATA"

    def test_counts_granted_claims_as_defects(self):
        card = build_scorecard(make_stats(ordersAccepted=100, defectReportsINAD=2, claimsGranted=3))
        assert card.orderDefectRate.numerator == 5
        assert card.orderDefectRate.value == 0.05

    def test_exposes_numerator_and_denominator(self):
        card = build_scorecard(make_stats(ordersAccepted=200, lateShipments=10))
        assert card.lateShipmentRate.numerator == 10
        assert card.lateShipmentRate.denominator == 200
        assert card.lateShipmentRate.value == 0.05


class TestEvaluateStanding:
    def test_leaves_clean_established_seller_in_good_standing(self):
        standing, reason = evaluate_standing(make_stats(ordersAccepted=100, totalOrders=100))
        assert standing == SellerStanding.GOOD
        assert reason is None

    def test_never_suspends_on_too_little_history(self):
        standing, reason = evaluate_standing(make_stats(ordersAccepted=1, claimsGranted=1))
        assert standing == SellerStanding.GOOD

    def test_flags_at_risk_once_metric_passes_target_not_limit(self):
        standing, reason = evaluate_standing(make_stats(ordersAccepted=100, claimsGranted=2))
        assert standing == SellerStanding.AT_RISK
        assert reason is not None
        assert "order defect rate" in reason

    def test_recommends_suspension_once_metric_passes_policy_limit(self):
        standing, reason = evaluate_standing(make_stats(ordersAccepted=100, claimsGranted=6))
        assert standing == SellerStanding.SUSPENDED
        assert reason is not None
        assert "Above policy limit" in reason

    def test_flags_at_risk_for_open_policy_violation(self):
        standing, reason = evaluate_standing(make_stats(ordersAccepted=100, policyViolations=1))
        assert standing == SellerStanding.AT_RISK
        assert reason is not None
        assert "policy violation" in reason

    def test_names_offending_metric_and_both_thresholds_in_reason(self):
        standing, reason = evaluate_standing(make_stats(ordersAccepted=100, lateShipments=12))
        assert standing == SellerStanding.SUSPENDED
        assert reason is not None
        assert "late shipment rate" in reason
        assert "12.0%" in reason
        assert "10.0%" in reason
