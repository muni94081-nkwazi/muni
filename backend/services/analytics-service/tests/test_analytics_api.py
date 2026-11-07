"""Integration tests for all HTTP API endpoints in analytics-service."""
from __future__ import annotations

import pytest

ADMIN_HEADERS = {"x-user-id": "admin-1", "x-user-roles": "ROLE_ADMIN"}
SELLER_HEADERS = {"x-user-id": "seller-001", "x-user-roles": "ROLE_SELLER"}


class TestHealthEndpoints:
    def test_health_live(self, client):
        res = client.get("/health/live")
        assert res.status_code == 200
        data = res.json()
        assert data["service"] == "analytics-service"
        assert data["status"] == "up"
        assert "ts" in data

    def test_health_ready_degraded_when_no_redis(self, client):
        res = client.get("/health/ready")
        assert res.status_code == 200
        data = res.json()
        assert data["service"] == "analytics-service"
        assert data["ready"] is True
        assert data["redis"] in ("up", "degraded")

    def test_health_redirect(self, client):
        res = client.get("/health", follow_redirects=False)
        assert res.status_code in (302, 307)
        assert res.headers["location"] == "/health/live"


class TestAdminDashboardEndpoint:
    def test_get_admin_dashboard(self, client):
        res = client.get("/api/v1/analytics/dashboard/admin", headers=ADMIN_HEADERS)
        assert res.status_code == 200
        data = res.json()
        assert data["success"] is True
        d = data["data"]
        assert d["period"] == "month"
        assert d["gmv"]["monthly"] == 385400000
        assert d["platformRevenue"]["commissionRatePercent"] == 12.5
        assert d["platformRevenue"]["commissionCollected"] == 48175000
        assert len(d["topSellers"]) == 3

    def test_get_admin_dashboard_with_period_query(self, client):
        res = client.get("/api/v1/analytics/dashboard/admin?period=week", headers=ADMIN_HEADERS)
        assert res.status_code == 200
        assert res.json()["data"]["period"] == "week"


class TestSellerDashboardEndpoint:
    def test_get_seller_dashboard(self, client):
        res = client.get("/api/v1/analytics/dashboard/seller/seller-001", headers=SELLER_HEADERS)
        assert res.status_code == 200
        data = res.json()
        assert data["success"] is True
        d = data["data"]
        assert d["sellerId"] == "seller-001"
        assert d["period"] == "month"
        assert d["revenue"]["month"] == 32875000
        assert len(d["orderValueDistribution"]) == 4
        assert len(d["topSellingProducts"]["byRevenue"]) == 3
        assert len(d["topSellingProducts"]["byQuantity"]) == 3
        assert d["inventoryHealth"]["fastMovingCount"] == 14

    def test_get_seller_dashboard_with_period(self, client):
        res = client.get(
            "/api/v1/analytics/dashboard/seller/seller-001?period=year",
            headers=SELLER_HEADERS,
        )
        assert res.status_code == 200
        assert res.json()["data"]["period"] == "year"


class TestLegacyEndpoints:
    def test_overview_endpoint(self, client):
        res = client.get("/api/v1/analytics/overview", headers=ADMIN_HEADERS)
        assert res.status_code == 200
        data = res.json()["data"]
        assert "live" in data
        assert "gmv" in data
        assert "orders" in data
        assert "users" in data
        assert "revenue" in data
        assert data["gmv"]["currency"] == "UGX"

    def test_gmv_endpoint(self, client):
        res = client.get("/api/v1/analytics/gmv", headers=ADMIN_HEADERS)
        assert res.status_code == 200
        data = res.json()["data"]
        assert len(data) == 6
        assert data[0]["period"] == "Jan"
        assert "gmv" in data[0]
        assert "orders" in data[0]

    def test_sellers_endpoint(self, client):
        res = client.get("/api/v1/analytics/sellers", headers=ADMIN_HEADERS)
        assert res.status_code == 200
        data = res.json()["data"]
        assert len(data) == 2
        assert data[0]["vendorId"] == "ven-001"
        assert data[1]["vendorId"] == "ven-002"

    def test_products_endpoint(self, client):
        res = client.get("/api/v1/analytics/products", headers=ADMIN_HEADERS)
        assert res.status_code == 200
        data = res.json()["data"]
        assert len(data) == 2
        assert data[0]["productId"] == "prod-001"
        assert data[1]["productId"] == "prod-002"


class TestEventsEndpoints:
    def test_post_event_unauthenticated(self, client):
        """POST /api/v1/analytics/events is optionalAuth and returns 204."""
        res = client.post("/api/v1/analytics/events", json={"event": "page_view", "url": "/items"})
        assert res.status_code == 204
        assert res.text == ""

    def test_post_event_authenticated(self, client):
        res = client.post(
            "/api/v1/analytics/events",
            json={"event": "click", "button": "checkout"},
            headers=SELLER_HEADERS,
        )
        assert res.status_code == 204

    def test_get_events_admin(self, client):
        res = client.get("/api/v1/analytics/events", headers=ADMIN_HEADERS)
        assert res.status_code == 200
        assert isinstance(res.json()["data"], list)
