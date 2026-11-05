from datetime import datetime
from typing import Optional, List, Dict, Any, Literal
from pydantic import BaseModel, Field, field_validator
from app.models.seller_trust import SellerStanding

TRUST_EVENT_TYPES = [
    "ORDER_DELIVERED_ON_TIME",
    "ORDER_DELIVERED_LATE",
    "DISPUTE_OPENED",
    "DISPUTE_RESOLVED_SELLER_FAVOR",
    "DISPUTE_RESOLVED_BUYER_FAVOR",
    "ITEM_DEFECT_REPORTED",
    "SLA_BREACHED",
    "ORDER_ACCEPTED",
    "SHIPMENT_LATE",
    "ORDER_CANCELLED_BY_SELLER",
    "CLAIM_GRANTED",
    "POLICY_VIOLATION",
]

MetricStatus = Literal["GOOD", "AT_RISK", "BREACH", "INSUFFICIENT_DATA"]


class TrustEventRequest(BaseModel):
    eventType: str
    orderId: Optional[str] = None
    disputeId: Optional[str] = None
    responseTimeHours: Optional[float] = Field(default=None, ge=0)
    occurredAt: Optional[str] = None

    @field_validator("eventType")
    @classmethod
    def check_event_type(cls, v: str) -> str:
        if v not in TRUST_EVENT_TYPES:
            raise ValueError("Unknown trust event type")
        return v


class SetVerifiedMerchantRequest(BaseModel):
    isVerified: bool


class UpdateStandingRequest(BaseModel):
    standing: Optional[SellerStanding] = None
    reason: Optional[str] = Field(default=None, max_length=500)


class ScoreBreakdown(BaseModel):
    onTimeDeliveryRate: float
    disputeRate: float
    defectRateINAD: float
    avgResponseTimeHours: Optional[float] = None


class ScorecardMetric(BaseModel):
    value: Optional[float] = None
    target: float
    suspendAt: float
    numerator: int
    denominator: int
    status: MetricStatus


class Scorecard(BaseModel):
    orderDefectRate: ScorecardMetric
    lateShipmentRate: ScorecardMetric
    cancellationRate: ScorecardMetric
    minimumSampleSize: int


class TrustProfile(BaseModel):
    sellerId: str
    trustScore: float
    badges: List[str]
    breakdown: Optional[ScoreBreakdown] = None
    scorecard: Scorecard
    standing: SellerStanding
    standingReason: Optional[str] = None
    recommendedStanding: SellerStanding
    stats: Dict[str, Any]
    lastCalculatedAt: datetime


class TrustScoreResponseData(BaseModel):
    userId: str
    trustScore: float
    badges: List[str]


class ScorecardResponseData(BaseModel):
    sellerId: str
    scorecard: Scorecard
    standing: SellerStanding
    standingReason: Optional[str] = None
    recommendedStanding: SellerStanding
    lastCalculatedAt: datetime


class StandingResponseData(BaseModel):
    userId: str
    standing: SellerStanding
    standingReason: Optional[str] = None
    standingChangedAt: Optional[datetime] = None
