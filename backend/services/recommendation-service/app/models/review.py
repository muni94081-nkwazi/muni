"""Pydantic schemas for product reviews, seller reviews, and seller reputation."""
from __future__ import annotations

from typing import Literal, Optional
from pydantic import BaseModel, ConfigDict

ReviewStatus = Literal["approved", "flagged", "rejected"]
FlagReason = Literal["profanity", "spam", "suspicious_burst", "competitor_sabotage"]
ReputationBadgeTier = Literal[
    "Top Rated Seller",
    "Trusted Seller",
    "Standard Seller",
    "Under Review",
]


class SellerReply(BaseModel):
    replyBody: str
    repliedAt: str


class ProductReview(BaseModel):
    id: str
    productId: str
    sellerId: Optional[str] = None
    userId: str
    userName: str
    rating: int  # 1-5
    title: str
    body: str
    verifiedPurchase: bool
    helpful: int
    status: ReviewStatus
    flagReason: Optional[FlagReason] = None
    sellerReply: Optional[SellerReply] = None
    userAccountCreatedAt: Optional[str] = None
    userIp: Optional[str] = None
    createdAt: str
    updatedAt: str

    model_config = ConfigDict(populate_by_name=True)


class SellerReview(BaseModel):
    id: str
    sellerId: str
    userId: str
    userName: str
    communicationRating: int
    shippingSpeedRating: int
    itemAccuracyRating: int
    overallRating: int
    body: str
    verifiedPurchase: bool
    status: ReviewStatus
    flagReason: Optional[FlagReason] = None
    sellerReply: Optional[SellerReply] = None
    userAccountCreatedAt: Optional[str] = None
    createdAt: str
    updatedAt: str

    model_config = ConfigDict(populate_by_name=True)


class ReputationFactors(BaseModel):
    averageRating6Mo: float
    fulfillmentRate: float
    responseTimeScore: float
    lowDisputeReturnScore: float


class ReputationMetrics(BaseModel):
    averageRating: float
    fulfillmentRatePercent: float
    avgResponseTimeHours: float
    disputeReturnRatePercent: float
    totalReviewsCount: int


class SellerReputation(BaseModel):
    sellerId: str
    reputationScore: float
    reputationPercent: float
    badgeTier: ReputationBadgeTier
    factors: ReputationFactors
    metrics: ReputationMetrics
    searchRankMultiplier: float
    updatedAt: str

    model_config = ConfigDict(populate_by_name=True)
