"""Verified review service with automated fraud and profanity moderation."""
from __future__ import annotations

import time
import uuid
from datetime import datetime, timezone
from typing import Dict, List, Optional, Set
from pydantic import BaseModel

from app.models.review import (
    ProductReview,
    SellerReview,
    ReviewStatus,
    FlagReason,
    SellerReply,
)
from app.services.reputation_service import seller_reputation_service
from app.events.publisher import publish

PROFANITY_WORDS = [
    "scam",
    "fraud",
    "fake_site",
    "cheat",
    "crap",
    "shit",
    "bitch",
    "idiot",
    "spam_link",
]


class CreateProductReviewInput(BaseModel):
    productId: str
    sellerId: Optional[str] = None
    userId: str
    userName: str = "Customer"
    rating: int
    title: str
    body: str
    userAccountCreatedAt: Optional[str] = None
    userIp: Optional[str] = None


class CreateSellerReviewInput(BaseModel):
    sellerId: str
    userId: str
    userName: str = "Customer"
    communicationRating: int
    shippingSpeedRating: int
    itemAccuracyRating: int
    overallRating: int
    body: str
    userAccountCreatedAt: Optional[str] = None


class ReviewService:
    def __init__(self):
        self._product_reviews: Dict[str, ProductReview] = {}
        self._seller_reviews: Dict[str, SellerReview] = {}
        self._verified_purchases: Set[str] = set()
        self._seed_verified_purchases()

    def _seed_verified_purchases(self) -> None:
        self._verified_purchases.add("user-123:prod-001")
        self._verified_purchases.add("user-123:seller-001")
        self._verified_purchases.add("user-456:prod-002")
        self._verified_purchases.add("user-456:seller-002")

    def record_delivered_purchase(
        self, user_id: str, product_id: Optional[str] = None, seller_id: Optional[str] = None
    ) -> None:
        if product_id:
            self._verified_purchases.add(f"{user_id}:{product_id}")
        if seller_id:
            self._verified_purchases.add(f"{user_id}:{seller_id}")

    def is_verified_buyer(self, user_id: str, target_id: str) -> bool:
        return f"{user_id}:{target_id}" in self._verified_purchases

    def check_profanity(self, text: str) -> bool:
        lower = text.lower()
        return any(w in lower for w in PROFANITY_WORDS)

    def detect_review_fraud(
        self, target_id: str, rating: int, account_created_at: Optional[str] = None
    ) -> tuple[bool, Optional[FlagReason]]:
        now_ms = int(time.time() * 1000)
        one_hour_ms = 60 * 60 * 1000
        seven_days_ms = 7 * 24 * 60 * 60 * 1000

        account_age_ms = (
            now_ms - int(datetime.fromisoformat(account_created_at.replace("Z", "+00:00")).timestamp() * 1000)
            if account_created_at
            else (seven_days_ms + 1)
        )
        is_new_account = account_age_ms < seven_days_ms

        recent_reviews = [
            r
            for r in self._product_reviews.values()
            if (r.productId == target_id or r.sellerId == target_id)
            and (
                now_ms - int(datetime.fromisoformat(r.createdAt.replace("Z", "+00:00")).timestamp() * 1000)
                < one_hour_ms
            )
        ]

        if rating == 5 and is_new_account:
            recent_new_5stars = [
                r
                for r in recent_reviews
                if r.rating == 5
                and r.userAccountCreatedAt
                and (
                    now_ms
                    - int(
                        datetime.fromisoformat(r.userAccountCreatedAt.replace("Z", "+00:00")).timestamp() * 1000
                    )
                    < seven_days_ms
                )
            ]
            if len(recent_new_5stars) >= 3:
                return True, "suspicious_burst"

        if rating == 1:
            recent_1stars = [r for r in recent_reviews if r.rating == 1]
            if len(recent_1stars) >= 4:
                return True, "competitor_sabotage"

        return False, None

    async def create_product_review(self, input_data: CreateProductReviewInput) -> ProductReview:
        if not self.is_verified_buyer(input_data.userId, input_data.productId):
            err = Exception("Only verified buyers who have received this product can leave a review.")
            err.status = 403
            raise err

        now = (
            datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.")
            + f"{datetime.now(timezone.utc).microsecond // 1000:03d}Z"
        )
        review_id = str(uuid.uuid4())

        status: ReviewStatus = "approved"
        flag_reason: Optional[FlagReason] = None

        if self.check_profanity(input_data.title) or self.check_profanity(input_data.body):
            status = "flagged"
            flag_reason = "profanity"
        else:
            is_suspicious, reason = self.detect_review_fraud(
                input_data.productId, input_data.rating, input_data.userAccountCreatedAt
            )
            if is_suspicious:
                status = "flagged"
                flag_reason = reason or "suspicious_burst"

        review = ProductReview(
            id=review_id,
            productId=input_data.productId,
            sellerId=input_data.sellerId,
            userId=input_data.userId,
            userName=input_data.userName,
            rating=input_data.rating,
            title=input_data.title,
            body=input_data.body,
            verifiedPurchase=True,
            helpful=0,
            status=status,
            flagReason=flag_reason,
            sellerReply=None,
            userAccountCreatedAt=input_data.userAccountCreatedAt,
            userIp=input_data.userIp,
            createdAt=now,
            updatedAt=now,
        )

        self._product_reviews[review_id] = review

        if status == "flagged":
            await publish(
                "review-events",
                {
                    "topic": "review-events",
                    "eventType": "review.flagged_suspicious",
                    "reviewId": review_id,
                    "productId": input_data.productId,
                    "sellerId": input_data.sellerId,
                    "reason": flag_reason,
                    "rating": input_data.rating,
                    "flaggedAt": now,
                },
                key=input_data.productId,
            )

        return review

    def get_product_reviews(self, product_id: str, include_flagged: bool = False) -> List[ProductReview]:
        reviews = [
            r
            for r in self._product_reviews.values()
            if r.productId == product_id and (include_flagged or r.status == "approved")
        ]
        reviews.sort(key=lambda r: r.createdAt, reverse=True)
        return reviews

    async def create_seller_review(self, input_data: CreateSellerReviewInput) -> SellerReview:
        if not self.is_verified_buyer(input_data.userId, input_data.sellerId):
            err = Exception("Only verified buyers who have received orders from this seller can leave a review.")
            err.status = 403
            raise err

        now = (
            datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.")
            + f"{datetime.now(timezone.utc).microsecond // 1000:03d}Z"
        )
        review_id = str(uuid.uuid4())

        status: ReviewStatus = "approved"
        flag_reason: Optional[FlagReason] = None

        if self.check_profanity(input_data.body):
            status = "flagged"
            flag_reason = "profanity"

        review = SellerReview(
            id=review_id,
            sellerId=input_data.sellerId,
            userId=input_data.userId,
            userName=input_data.userName,
            communicationRating=input_data.communicationRating,
            shippingSpeedRating=input_data.shippingSpeedRating,
            itemAccuracyRating=input_data.itemAccuracyRating,
            overallRating=input_data.overallRating,
            body=input_data.body,
            verifiedPurchase=True,
            status=status,
            flagReason=flag_reason,
            sellerReply=None,
            userAccountCreatedAt=input_data.userAccountCreatedAt,
            createdAt=now,
            updatedAt=now,
        )

        self._seller_reviews[review_id] = review
        self._recalculate_seller_reputation(input_data.sellerId)

        return review

    def get_seller_reviews(self, seller_id: str, include_flagged: bool = False) -> List[SellerReview]:
        reviews = [
            r
            for r in self._seller_reviews.values()
            if r.sellerId == seller_id and (include_flagged or r.status == "approved")
        ]
        reviews.sort(key=lambda r: r.createdAt, reverse=True)
        return reviews

    def get_flagged_reviews(self) -> Dict[str, Any]:
        p_flagged = [r for r in self._product_reviews.values() if r.status == "flagged"]
        s_flagged = [r for r in self._seller_reviews.values() if r.status == "flagged"]
        return {"productReviews": p_flagged, "sellerReviews": s_flagged}

    def moderate_review(self, review_id: str, action: str) -> ProductReview | SellerReview:
        now = (
            datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.")
            + f"{datetime.now(timezone.utc).microsecond // 1000:03d}Z"
        )
        new_status: ReviewStatus = "approved" if action == "approve" else "rejected"

        if review_id in self._product_reviews:
            r = self._product_reviews[review_id]
            r.status = new_status
            r.updatedAt = now
            return r

        if review_id in self._seller_reviews:
            sr = self._seller_reviews[review_id]
            sr.status = new_status
            sr.updatedAt = now
            if action == "approve":
                self._recalculate_seller_reputation(sr.sellerId)
            return sr

        err = Exception("Review not found")
        err.status = 404
        raise err

    def add_seller_reply(self, review_id: str, seller_id: str, reply_body: str) -> ProductReview | SellerReview:
        now = (
            datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.")
            + f"{datetime.now(timezone.utc).microsecond // 1000:03d}Z"
        )
        reply = SellerReply(replyBody=reply_body, repliedAt=now)

        if review_id in self._product_reviews:
            pr = self._product_reviews[review_id]
            pr.sellerReply = reply
            pr.updatedAt = now
            return pr

        if review_id in self._seller_reviews:
            sr = self._seller_reviews[review_id]
            if sr.sellerId != seller_id:
                err = Exception("Unauthorized to reply to this review")
                err.status = 403
                raise err
            sr.sellerReply = reply
            sr.updatedAt = now
            return sr

        err = Exception("Review not found")
        err.status = 404
        raise err

    def _recalculate_seller_reputation(self, seller_id: str) -> None:
        approved = self.get_seller_reviews(seller_id, include_flagged=False)
        if not approved:
            return
        avg_rating = sum(r.overallRating for r in approved) / len(approved)
        seller_reputation_service.calculate_reputation(
            seller_id=seller_id,
            average_rating_6mo=avg_rating,
            total_reviews_count=len(approved),
        )

    def reset_for_tests(self) -> None:
        self._product_reviews.clear()
        self._seller_reviews.clear()
        self._verified_purchases.clear()
        self._seed_verified_purchases()


review_service = ReviewService()
