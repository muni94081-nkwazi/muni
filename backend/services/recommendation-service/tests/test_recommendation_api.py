"""HTTP integration tests for all recommendation endpoints and strategies."""
from __future__ import annotations

import pytest


class TestHealthEndpoints:
    def test_health_live(self, client):
        res = client.get("/health/live")
        assert res.status_code == 200
        data = res.json()
        assert data["service"] == "recommendation-service"
        assert data["status"] == "up"

    def test_health_ready(self, client):
        res = client.get("/health/ready")
        assert res.status_code == 200
        data = res.json()
        assert data["service"] == "recommendation-service"
        assert data["ready"] is True

    def test_health_redirect(self, client):
        res = client.get("/health", follow_redirects=False)
        assert res.status_code in (302, 307)
        assert res.headers["location"] == "/health/live"


class TestRecommendationStrategies:
    def test_strategy_also_viewed(self, client):
        res = client.get("/api/v1/recommendations/also-viewed/phone-001?limit=4")
        assert res.status_code == 200
        body = res.json()
        assert body["success"] is True
        assert body["strategy"] == "customers_also_viewed"
        assert len(body["data"]) > 0
        assert body["data"][0]["reason"] == "also_viewed"

    def test_strategy_also_bought(self, client):
        res = client.get("/api/v1/recommendations/also-bought/phone-001")
        assert res.status_code == 200
        body = res.json()
        assert body["success"] is True
        assert body["strategy"] == "customers_who_bought_this_also_bought"
        assert len(body["data"]) > 0
        assert body["data"][0]["reason"] == "also_bought"

    def test_strategy_frequently_bought_together(self, client):
        res = client.get("/api/v1/recommendations/frequently-bought-together/phone-001")
        assert res.status_code == 200
        body = res.json()
        assert body["success"] is True
        assert body["strategy"] == "frequently_bought_together"
        d = body["data"]
        assert d["primaryProductId"] == "phone-001"
        assert len(d["bundleItems"]) > 0
        assert d["bundleDiscountPercent"] == 15.0
        assert d["bundleDiscountPrice"] < d["originalTotalPrice"]

    def test_strategy_personalized(self, client):
        res = client.get("/api/v1/recommendations/personalized?user_id=user-123&limit=5")
        assert res.status_code == 200
        body = res.json()
        assert body["success"] is True
        assert body["strategy"] == "personalized_for_you"
        # food-001 was purchased by user-123 in seed data, so must be excluded
        pids = [item["productId"] for item in body["data"]]
        assert "food-001" not in pids

    def test_strategy_trending(self, client):
        res = client.get("/api/v1/recommendations/trending?limit=5")
        assert res.status_code == 200
        body = res.json()
        assert body["success"] is True
        assert body["strategy"] == "trending_now"
        assert len(body["data"]) > 0

    def test_home_feed(self, client):
        res = client.get("/api/v1/recommendations/home-feed?user_id=user-new")
        assert res.status_code == 200
        body = res.json()
        assert body["success"] is True
        data = body["data"]
        assert data["userId"] == "user-new"
        assert len(data["sections"]) > 0
        keys = [s["key"] for s in data["sections"]]
        assert "trending-now" in keys


class TestEventTrackingEndpoints:
    def test_track_view_valid(self, client):
        res = client.post(
            "/api/v1/recommendations/track/view",
            json={"productId": "phone-002", "category": "electronics"},
            headers={"x-user-id": "user-view-1"},
        )
        assert res.status_code == 202
        assert res.json()["success"] is True

    def test_track_view_missing_product_id(self, client):
        res = client.post("/api/v1/recommendations/track/view", json={})
        assert res.status_code == 400
        assert res.json()["message"] == "productId is required"

    def test_track_purchase_valid(self, client):
        res = client.post(
            "/api/v1/recommendations/track/purchase",
            json={"productId": "phone-002", "orderId": "ord-test-1"},
            headers={"x-user-id": "user-buy-1"},
        )
        assert res.status_code == 202

    def test_track_purchase_missing_fields(self, client):
        res = client.post("/api/v1/recommendations/track/purchase", json={"productId": "phone-002"})
        assert res.status_code == 400
        assert res.json()["message"] == "productId and orderId are required"

    def test_track_clickstream_valid(self, client):
        res = client.post(
            "/api/v1/recommendations/track/clickstream",
            json={"eventType": "add_to_cart", "productId": "phone-001"},
            headers={"x-user-id": "user-click-1"},
        )
        assert res.status_code == 202

    def test_track_clickstream_invalid_event_type(self, client):
        res = client.post(
            "/api/v1/recommendations/track/clickstream",
            json={"eventType": "unknown_type"},
            headers={"x-user-id": "user-click-1"},
        )
        assert res.status_code == 400
