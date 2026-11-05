import math
from datetime import datetime, timezone
from typing import Dict, Any, List, Optional, Tuple
from sqlalchemy.orm import Session

from app.core.exceptions import ApiError
from app.models.seller_trust import SellerTrustStats, SellerStanding
from app.schemas.seller_trust import (
    ScoreBreakdown,
    Scorecard,
    ScorecardMetric,
    MetricStatus,
    TrustProfile,
    TrustEventRequest,
    TRUST_EVENT_TYPES,
)
from app.events.publisher import publish, TOPICS

WEIGHTS = {"ON_TIME": 35, "DISPUTE": 25, "DEFECT": 25, "RESPONSE": 15}
NEUTRAL_RATE = 0.7
COLD_START_SCORE = 70
RESPONSE_SLA_HOURS = 72

BADGE_THRESHOLDS = {
    "TOP_RATED_SELLER": {"minScore": 95, "minOrders": 20, "maxDisputeRate": 0.02},
    "FAST_SHIPPER": {"minDeliverySamples": 10, "minOnTimeRate": 0.95},
}

POLICY = {
    "MIN_SAMPLE": 10,
    "orderDefectRate": {"atRisk": 0.01, "suspend": 0.05},
    "lateShipmentRate": {"atRisk": 0.04, "suspend": 0.1},
    "cancellationRate": {"atRisk": 0.025, "suspend": 0.075},
}

COUNTER_INCREMENTS: Dict[str, Dict[str, int]] = {
    "ORDER_DELIVERED_ON_TIME": {"totalOrders": 1, "onTimeDeliveries": 1},
    "ORDER_DELIVERED_LATE": {"totalOrders": 1, "lateDeliveries": 1},
    "DISPUTE_OPENED": {"disputesOpened": 1},
    "DISPUTE_RESOLVED_SELLER_FAVOR": {"disputesResolvedSellerFavor": 1},
    "DISPUTE_RESOLVED_BUYER_FAVOR": {"disputesResolvedBuyerFavor": 1},
    "ITEM_DEFECT_REPORTED": {"defectReportsINAD": 1},
    "SLA_BREACHED": {"slaBreaches": 1},
    "ORDER_ACCEPTED": {"ordersAccepted": 1},
    "SHIPMENT_LATE": {"lateShipments": 1},
    "ORDER_CANCELLED_BY_SELLER": {"cancelledBySeller": 1},
    "CLAIM_GRANTED": {"claimsGranted": 1},
    "POLICY_VIOLATION": {"policyViolations": 1},
}

RESPONSE_TRACKED_EVENTS = {
    "DISPUTE_RESOLVED_SELLER_FAVOR",
    "DISPUTE_RESOLVED_BUYER_FAVOR",
}


def clamp(val: float, min_v: float, max_v: float) -> float:
    return min(max_v, max(min_v, val))


def compute_score(stats: SellerTrustStats) -> Tuple[int, Optional[ScoreBreakdown]]:
    delivery_samples = stats.onTimeDeliveries + stats.lateDeliveries
    has_any_signal = (
        stats.totalOrders > 0
        or stats.disputesOpened > 0
        or stats.defectReportsINAD > 0
    )

    if not has_any_signal:
        return COLD_START_SCORE, None

    on_time_rate = (
        stats.onTimeDeliveries / delivery_samples
        if delivery_samples > 0
        else NEUTRAL_RATE
    )

    dispute_den = max(stats.totalOrders, stats.disputesOpened, 1)
    dispute_rate = stats.disputesOpened / dispute_den

    defect_den = max(stats.totalOrders, stats.defectReportsINAD, 1)
    defect_rate = stats.defectReportsINAD / defect_den

    avg_response_hours = (
        stats.totalResponseHours / stats.resolvedResponseCount
        if stats.resolvedResponseCount > 0
        else None
    )

    response_ratio = (
        NEUTRAL_RATE
        if avg_response_hours is None
        else clamp(1.0 - (avg_response_hours / RESPONSE_SLA_HOURS), 0.0, 1.0)
    )

    on_time_comp = on_time_rate * WEIGHTS["ON_TIME"]
    dispute_comp = (1.0 - clamp(dispute_rate, 0.0, 1.0)) * WEIGHTS["DISPUTE"]
    defect_comp = (1.0 - clamp(defect_rate, 0.0, 1.0)) * WEIGHTS["DEFECT"]
    response_comp = response_ratio * WEIGHTS["RESPONSE"]

    raw_score = clamp(on_time_comp + dispute_comp + defect_comp + response_comp, 0.0, 100.0)
    # Match JS Math.round behavior
    trust_score = int(math.floor(raw_score + 0.5))

    breakdown = ScoreBreakdown(
        onTimeDeliveryRate=round(on_time_rate * 1000) / 1000,
        disputeRate=round(dispute_rate * 1000) / 1000,
        defectRateINAD=round(defect_rate * 1000) / 1000,
        avgResponseTimeHours=(
            None if avg_response_hours is None else round(avg_response_hours * 100) / 100
        ),
    )

    return trust_score, breakdown


def assign_badges(stats: SellerTrustStats, trust_score: int) -> List[str]:
    badges: List[str] = []
    delivery_samples = stats.onTimeDeliveries + stats.lateDeliveries
    dispute_den = max(stats.totalOrders, stats.disputesOpened, 1)
    dispute_rate = stats.disputesOpened / dispute_den

    t = BADGE_THRESHOLDS["TOP_RATED_SELLER"]
    if trust_score >= t["minScore"] and stats.totalOrders >= t["minOrders"] and dispute_rate <= t["maxDisputeRate"]:
        badges.append("Top Rated Seller")

    f = BADGE_THRESHOLDS["FAST_SHIPPER"]
    if delivery_samples >= f["minDeliverySamples"] and (stats.onTimeDeliveries / delivery_samples) >= f["minOnTimeRate"]:
        badges.append("Fast Shipper")

    if stats.isVerifiedMerchant:
        badges.append("Verified Merchant")

    return badges


def _rate(num: int, den: int) -> Optional[float]:
    return num / den if den > 0 else None


def _metric_status(val: Optional[float], den: int, thresholds: Dict[str, float]) -> MetricStatus:
    if val is None or den < POLICY["MIN_SAMPLE"]:
        return "INSUFFICIENT_DATA"
    if val >= thresholds["suspend"]:
        return "BREACH"
    if val >= thresholds["atRisk"]:
        return "AT_RISK"
    return "GOOD"


def build_scorecard(stats: SellerTrustStats) -> Scorecard:
    defect_den = max(stats.ordersAccepted, stats.totalOrders)
    defect_num = stats.defectReportsINAD + stats.claimsGranted
    odr = _rate(defect_num, defect_den)

    lsr = _rate(stats.lateShipments, stats.ordersAccepted)
    cr = _rate(stats.cancelledBySeller, stats.ordersAccepted)

    return Scorecard(
        orderDefectRate=ScorecardMetric(
            value=None if odr is None else round(odr * 10000) / 10000,
            target=POLICY["orderDefectRate"]["atRisk"],
            suspendAt=POLICY["orderDefectRate"]["suspend"],
            numerator=defect_num,
            denominator=defect_den,
            status=_metric_status(odr, defect_den, POLICY["orderDefectRate"]),
        ),
        lateShipmentRate=ScorecardMetric(
            value=None if lsr is None else round(lsr * 10000) / 10000,
            target=POLICY["lateShipmentRate"]["atRisk"],
            suspendAt=POLICY["lateShipmentRate"]["suspend"],
            numerator=stats.lateShipments,
            denominator=stats.ordersAccepted,
            status=_metric_status(lsr, stats.ordersAccepted, POLICY["lateShipmentRate"]),
        ),
        cancellationRate=ScorecardMetric(
            value=None if cr is None else round(cr * 10000) / 10000,
            target=POLICY["cancellationRate"]["atRisk"],
            suspendAt=POLICY["cancellationRate"]["suspend"],
            numerator=stats.cancelledBySeller,
            denominator=stats.ordersAccepted,
            status=_metric_status(cr, stats.ordersAccepted, POLICY["cancellationRate"]),
        ),
        minimumSampleSize=POLICY["MIN_SAMPLE"],
    )


def _format_percent(v: float) -> str:
    return f"{v * 100:.1f}%"


def evaluate_standing(stats: SellerTrustStats) -> Tuple[SellerStanding, Optional[str]]:
    card = build_scorecard(stats)
    metrics: List[Tuple[str, ScorecardMetric]] = [
        ("order defect rate", card.orderDefectRate),
        ("late shipment rate", card.lateShipmentRate),
        ("cancellation rate", card.cancellationRate),
    ]

    breaches = [m for m in metrics if m[1].status == "BREACH"]
    if breaches:
        detail = "; ".join(
            f"{name} {_format_percent(m.value or 0)} (limit {_format_percent(m.suspendAt)})"
            for name, m in breaches
        )
        return SellerStanding.SUSPENDED, f"Above policy limit: {detail}"

    at_risk = [m for m in metrics if m[1].status == "AT_RISK"]
    if at_risk:
        detail = "; ".join(
            f"{name} {_format_percent(m.value or 0)} (target {_format_percent(m.target)})"
            for name, m in at_risk
        )
        return SellerStanding.AT_RISK, f"Above target: {detail}"

    if stats.policyViolations > 0:
        return SellerStanding.AT_RISK, f"{stats.policyViolations} open policy violation(s)"

    return SellerStanding.GOOD, None


def get_or_create_stats(db: Session, seller_id: str) -> SellerTrustStats:
    stats = db.query(SellerTrustStats).filter(SellerTrustStats.userId == seller_id).first()
    if not stats:
        stats = SellerTrustStats(userId=seller_id, badges=[])
        db.add(stats)
        db.commit()
        db.refresh(stats)
    return stats


def recalculate(db: Session, stats: SellerTrustStats) -> SellerTrustStats:
    trust_score, _ = compute_score(stats)
    badges = assign_badges(stats, trust_score)

    stats.trustScore = trust_score
    stats.badges = badges
    stats.lastCalculatedAt = datetime.now(timezone.utc)
    db.add(stats)
    db.commit()
    db.refresh(stats)
    return stats


def record_event(db: Session, seller_id: str, event: TrustEventRequest) -> SellerTrustStats:
    base = COUNTER_INCREMENTS.get(event.eventType)
    if not base:
        raise ApiError.bad_request(f"Unknown trust event type: {event.eventType}")

    stats = get_or_create_stats(db, seller_id)

    for field, amount in base.items():
        curr = getattr(stats, field, 0)
        setattr(stats, field, curr + amount)

    if event.eventType in RESPONSE_TRACKED_EVENTS and event.responseTimeHours is not None:
        stats.totalResponseHours += max(event.responseTimeHours, 0.0)
        stats.resolvedResponseCount += 1

    db.add(stats)
    db.commit()
    db.refresh(stats)

    return recalculate(db, stats)


def get_trust_profile(db: Session, seller_id: str) -> TrustProfile:
    stats = get_or_create_stats(db, seller_id)
    trust_score, breakdown = compute_score(stats)
    badges = assign_badges(stats, trust_score)
    rec_standing, _ = evaluate_standing(stats)

    stat_dict = {
        "totalOrders": stats.totalOrders,
        "ordersAccepted": stats.ordersAccepted,
        "onTimeDeliveries": stats.onTimeDeliveries,
        "lateDeliveries": stats.lateDeliveries,
        "lateShipments": stats.lateShipments,
        "cancelledBySeller": stats.cancelledBySeller,
        "disputesOpened": stats.disputesOpened,
        "disputesResolvedSellerFavor": stats.disputesResolvedSellerFavor,
        "disputesResolvedBuyerFavor": stats.disputesResolvedBuyerFavor,
        "defectReportsINAD": stats.defectReportsINAD,
        "claimsGranted": stats.claimsGranted,
        "policyViolations": stats.policyViolations,
        "slaBreaches": stats.slaBreaches,
        "isVerifiedMerchant": stats.isVerifiedMerchant,
    }

    return TrustProfile(
        sellerId=seller_id,
        trustScore=trust_score,
        badges=badges,
        breakdown=breakdown,
        scorecard=build_scorecard(stats),
        standing=stats.standing,
        standingReason=stats.standingReason,
        recommendedStanding=rec_standing,
        stats=stat_dict,
        lastCalculatedAt=stats.lastCalculatedAt,
    )


async def apply_standing(
    db: Session,
    seller_id: str,
    standing: Optional[SellerStanding] = None,
    reason: Optional[str] = None,
) -> SellerTrustStats:
    stats = get_or_create_stats(db, seller_id)
    rec_standing, rec_reason = evaluate_standing(stats)

    next_standing = standing if standing is not None else rec_standing
    next_reason = reason if reason is not None else rec_reason

    if next_standing == stats.standing:
        return stats

    prev_standing = stats.standing
    stats.standing = next_standing
    stats.standingReason = next_reason
    stats.standingChangedAt = datetime.now(timezone.utc)
    db.add(stats)
    db.commit()
    db.refresh(stats)

    await publish(TOPICS["SELLER_STANDING_CHANGED"], {
        "userId": seller_id,
        "sellerId": seller_id,
        "previousStanding": prev_standing.value if hasattr(prev_standing, "value") else str(prev_standing),
        "standing": next_standing.value if hasattr(next_standing, "value") else str(next_standing),
        "reason": next_reason,
    })

    return stats


def set_verified_merchant(db: Session, seller_id: str, is_verified: bool) -> SellerTrustStats:
    stats = get_or_create_stats(db, seller_id)
    stats.isVerifiedMerchant = is_verified
    db.add(stats)
    db.commit()
    db.refresh(stats)

    return recalculate(db, stats)
