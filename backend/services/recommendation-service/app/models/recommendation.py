"""Pydantic schemas for recommendation items, bundles, affinity, and home feed."""
from __future__ import annotations

from typing import Dict, List, Literal, Optional
from pydantic import BaseModel, ConfigDict

ClickstreamEventType = Literal["product_view", "category_browse", "add_to_cart", "wishlist"]
RecommendationReason = Literal[
    "also_viewed",
    "also_bought",
    "frequently_bought_together",
    "personalized",
    "trending",
    "popular",
]


class ProductViewEvent(BaseModel):
    id: str
    userId: str
    productId: str
    category: Optional[str] = None
    timestamp: int


class ProductPurchaseEvent(BaseModel):
    id: str
    userId: str
    productId: str
    orderId: str
    timestamp: int


class RecommendationItem(BaseModel):
    productId: str
    score: float
    reason: RecommendationReason
    category: Optional[str] = None
    name: Optional[str] = None
    price: Optional[float] = None
    imageUrl: Optional[str] = None

    model_config = ConfigDict(populate_by_name=True)


class BundleItem(BaseModel):
    productId: str
    name: str
    price: float
    imageUrl: Optional[str] = None


class BundleRecommendation(BaseModel):
    primaryProductId: str
    bundleItems: List[BundleItem]
    originalTotalPrice: float
    bundleDiscountPercent: float
    bundleDiscountPrice: float
    savingsAmount: float
    reason: str


class AssociationRule(BaseModel):
    productId: str
    coOccurrences: int
    support: float
    confidence: float
    lift: float


class ClickstreamEvent(BaseModel):
    userId: str
    eventType: ClickstreamEventType
    productId: Optional[str] = None
    category: Optional[str] = None
    timestamp: int


class UserAffinityProfile(BaseModel):
    userId: str
    categoryAffinity: Dict[str, float]
    productAffinity: Dict[str, float]
    updatedAt: str


class HomeFeedSection(BaseModel):
    key: str
    title: str
    reason: str
    items: List[RecommendationItem]


class HomeFeedResponse(BaseModel):
    userId: str
    sections: List[HomeFeedSection]
    generatedAt: str
