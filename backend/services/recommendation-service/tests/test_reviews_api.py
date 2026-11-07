"""Integration tests for verified reviews, moderation, reputation, and seller replies."""
from __future__ import annotations

import pytest
from app.services.review_service import review_service


class TestProductReviews:
    def test_unauthenticated_blocked(self, client):
        res = client.post("/api/v1/products/prod-001/reviews", json={"rating": 5, "title": "Great", "body": "Love it"})
        assert res.status_code == 401
        assert res.json()["message"] == "Authentication required"

    def test_unverified_buyer_blocked(self, client):
        res = client.post(
            "/api/v1/products/prod-unbought/reviews",
            json={"rating": 5, "title": "Nice", "body": "Looks good"},
            headers={"x-user-id": "user-unverified"},
        )
        assert res.status_code == 403
        assert "Only verified buyers" in res.json()["message"]

    def test_verified_buyer_review_creation(self, client):
        # user-123 is seeded as verified buyer for prod-001
        res = client.post(
            "/api/v1/products/prod-001/reviews",
            json={"rating": 5, "title": "Excellent product", "body": "Works as advertised."},
            headers={"x-user-id": "user-123"},
        )
        assert res.status_code == 201
        data = res.json()["data"]
        assert data["status"] == "approved"
        assert data["verifiedPurchase"] is True

    def test_profanity_auto_flagged(self, client):
        res = client.post(
            "/api/v1/products/prod-001/reviews",
            json={"rating": 1, "title": "This is a scam", "body": "Total fraud and fake_site."},
            headers={"x-user-id": "user-123"},
        )
        assert res.status_code == 201
        data = res.json()["data"]
        assert data["status"] == "flagged"
        assert data["flagReason"] == "profanity"

    def test_get_product_reviews(self, client):
        res = client.get("/api/v1/products/prod-001/reviews")
        assert res.status_code == 200
        assert isinstance(res.json()["data"], list)


class TestSellerReviewsAndReputation:
    def test_create_seller_review(self, client):
        # user-123 is seeded for seller-001
        res = client.post(
            "/api/v1/sellers/seller-001/reviews",
            json={"overallRating": 5, "body": "Fast delivery and great seller!"},
            headers={"x-user-id": "user-123"},
        )
        assert res.status_code == 201
        assert res.json()["data"]["status"] == "approved"

    def test_get_seller_reputation(self, client):
        res = client.get("/api/v1/sellers/seller-001/reputation")
        assert res.status_code == 200
        data = res.json()["data"]
        assert data["sellerId"] == "seller-001"
        assert "reputationPercent" in data
        assert "badgeTier" in data


class TestAdminModerationAndSellerReply:
    def test_admin_moderate_review(self, client):
        # Create a flagged review
        review_service.record_delivered_purchase("user-test-mod", "prod-mod-1")
        review = client.post(
            "/api/v1/products/prod-mod-1/reviews",
            json={"rating": 1, "title": "fraud", "body": "pure scam"},
            headers={"x-user-id": "user-test-mod"},
        ).json()["data"]
        review_id = review["id"]

        # Moderate to approve
        res = client.patch(
            f"/api/v1/admin/reviews/{review_id}/moderate",
            json={"action": "approve"},
        )
        assert res.status_code == 200
        assert res.json()["data"]["status"] == "approved"

    def test_seller_reply(self, client):
        review_service.record_delivered_purchase("user-buyer-r", "prod-r", "seller-v1")
        review = client.post(
            "/api/v1/products/prod-r/reviews",
            json={"rating": 4, "title": "Good", "body": "All good", "sellerId": "seller-v1"},
            headers={"x-user-id": "user-buyer-r"},
        ).json()["data"]
        review_id = review["id"]

        res = client.post(
            f"/api/v1/seller/reviews/{review_id}/reply",
            json={"replyBody": "Thank you for shopping with us!"},
            headers={"x-user-id": "seller-v1"},
        )
        assert res.status_code == 200
        assert res.json()["data"]["sellerReply"]["replyBody"] == "Thank you for shopping with us!"
