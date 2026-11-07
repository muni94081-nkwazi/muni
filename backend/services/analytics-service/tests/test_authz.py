"""Tests for authentication, authorization, and IDOR protection.

Directly mirrors backend/services/analytics-service/src/__tests__/analytics.authz.test.ts
to guarantee 100% security and authorization contract equivalence.
"""
from __future__ import annotations

import pytest
from app.core.internal_identity import sign_identity

SELLER_A = "seller-a"
SELLER_B = "seller-b"
ADMIN = "admin-1"
SIGNING_SECRET = "test-internal-identity-secret-32-chars-plus"


def as_user(user_id: str, roles: list[str] | None = None) -> dict[str, str]:
    if roles is None:
        roles = ["ROLE_SELLER"]
    return {
        "x-user-id": user_id,
        "x-user-roles": ",".join(roles),
    }


# ─── The IDOR ─────────────────────────────────────────────────────────────────


class TestSellerDashboardOwnership:
    """A seller dashboard belongs to that seller."""

    def test_401_with_no_identity(self, client):
        """401s with no identity, rather than answering as seller-001."""
        res = client.get(f"/api/v1/analytics/dashboard/seller/{SELLER_A}")
        assert res.status_code == 401
        data = res.json()
        assert data["success"] is False
        assert data.get("code") == "UNAUTHORIZED"

    def test_lets_a_seller_read_their_own(self, client):
        """Lets a seller read their own dashboard."""
        res = client.get(
            f"/api/v1/analytics/dashboard/seller/{SELLER_A}",
            headers=as_user(SELLER_A),
        )
        assert res.status_code == 200
        data = res.json()
        assert data["success"] is True
        assert data["data"]["sellerId"] == SELLER_A
        assert data["data"]["revenue"]["currency"] == "UGX"

    def test_403_seller_reading_competitor(self, client):
        """403s a seller reading a competitor's by editing the path."""
        res = client.get(
            f"/api/v1/analytics/dashboard/seller/{SELLER_A}",
            headers=as_user(SELLER_B),
        )
        assert res.status_code == 403
        data = res.json()
        assert data["success"] is False
        assert data["message"] == "You can only view your own analytics."

    def test_closes_vendor_id_path_too(self, client):
        """Closes the /analytics/seller/:vendorId path too — same handler, same hole."""
        res = client.get(
            f"/api/v1/analytics/seller/{SELLER_A}",
            headers=as_user(SELLER_B),
        )
        assert res.status_code == 403
        assert res.json()["message"] == "You can only view your own analytics."

    def test_closes_alias_as_well(self, client):
        """Closes the /api/analytics alias as well."""
        res = client.get(
            f"/api/analytics/dashboard/seller/{SELLER_A}",
            headers=as_user(SELLER_B),
        )
        assert res.status_code == 403
        assert res.json()["message"] == "You can only view your own analytics."

    def test_lets_staff_read_any_seller(self, client):
        """Lets staff (ROLE_ADMIN) read any seller's dashboard."""
        res = client.get(
            f"/api/v1/analytics/dashboard/seller/{SELLER_A}",
            headers=as_user(ADMIN, ["ROLE_ADMIN"]),
        )
        assert res.status_code == 200
        data = res.json()
        assert data["success"] is True
        assert data["data"]["sellerId"] == SELLER_A

    def test_lets_super_admin_read_any_seller(self, client):
        """Lets staff (ROLE_SUPER_ADMIN) read any seller's dashboard."""
        res = client.get(
            f"/api/v1/analytics/dashboard/seller/{SELLER_A}",
            headers=as_user(ADMIN, ["ROLE_SUPER_ADMIN"]),
        )
        assert res.status_code == 200
        assert res.json()["data"]["sellerId"] == SELLER_A


# ─── Platform figures ─────────────────────────────────────────────────────────


class TestPlatformFiguresAdminOnly:
    """Platform-wide figures are admin-only."""

    @pytest.mark.parametrize(
        "path",
        [
            "/api/v1/analytics/dashboard/admin",
            "/api/analytics/dashboard/admin",
            "/api/v1/analytics/overview",
            "/api/v1/analytics/gmv",
            "/api/v1/analytics/sellers",
            "/api/v1/analytics/products",
            "/api/v1/analytics/events",
        ],
    )
    def test_401_with_no_identity(self, client, path):
        res = client.get(path)
        assert res.status_code == 401
        assert res.json()["code"] == "UNAUTHORIZED"

    @pytest.mark.parametrize(
        "path",
        [
            "/api/v1/analytics/dashboard/admin",
            "/api/analytics/dashboard/admin",
            "/api/v1/analytics/overview",
            "/api/v1/analytics/gmv",
            "/api/v1/analytics/sellers",
            "/api/v1/analytics/events",
        ],
    )
    def test_403_seller_asking_for_platform_figures(self, client, path):
        res = client.get(path, headers=as_user(SELLER_A))
        assert res.status_code == 403
        data = res.json()
        assert data["success"] is False
        assert data["code"] == "FORBIDDEN"

    def test_lets_admin_read_overview(self, client):
        res = client.get("/api/v1/analytics/overview", headers=as_user(ADMIN, ["ROLE_ADMIN"]))
        assert res.status_code == 200
        assert "data" in res.json()
        assert "gmv" in res.json()["data"]


# ─── Seller-facing, non-cross-seller ──────────────────────────────────────────


class TestSellerFacingPendingEndpoints:
    """The pending seller endpoints still need a session."""

    @pytest.mark.parametrize(
        "path",
        [
            "/api/v1/analytics/sales",
            "/api/v1/analytics/top-products",
        ],
    )
    def test_401_with_no_identity(self, client, path):
        res = client.get(path)
        assert res.status_code == 401

    @pytest.mark.parametrize(
        "path",
        [
            "/api/v1/analytics/sales",
            "/api/v1/analytics/top-products",
        ],
    )
    def test_answers_a_signed_in_seller(self, client, path):
        res = client.get(path, headers=as_user(SELLER_A))
        assert res.status_code == 200
        assert res.json()["meta"]["pending"] is True


# ─── Signed identity mode ─────────────────────────────────────────────────────


class TestSignedIdentityMode:
    """With INTERNAL_IDENTITY_SECRET set, a raw header buys nothing."""

    @pytest.fixture(autouse=True)
    def configure_secret(self, monkeypatch):
        monkeypatch.setenv("INTERNAL_IDENTITY_SECRET", SIGNING_SECRET)

    def test_401_forged_x_user_id(self, client):
        """In signed mode, raw x-user-id is ignored and returns 401."""
        res = client.get(
            f"/api/v1/analytics/dashboard/seller/{SELLER_A}",
            headers=as_user(SELLER_A),
        )
        assert res.status_code == 401

    def test_forged_header_cannot_override_signed_identity(self, client):
        """A valid signed token for SELLER_B cannot be overridden with x-user-id: SELLER_A."""
        signed_token = sign_identity(SELLER_B, ["ROLE_SELLER"])
        res = client.get(
            f"/api/v1/analytics/dashboard/seller/{SELLER_A}",
            headers={
                "x-internal-identity": signed_token,
                "x-user-id": SELLER_A,
            },
        )
        assert res.status_code == 403
        assert res.json()["message"] == "You can only view your own analytics."

    def test_ignores_hand_written_x_user_roles_claiming_admin(self, client):
        """A handwritten x-user-roles header claiming admin is ignored when token says ROLE_SELLER."""
        signed_token = sign_identity(SELLER_A, ["ROLE_SELLER"])
        res = client.get(
            "/api/v1/analytics/overview",
            headers={
                "x-internal-identity": signed_token,
                "x-user-roles": "ROLE_ADMIN",
            },
        )
        assert res.status_code == 403
        assert res.json()["code"] == "FORBIDDEN"

    def test_allows_signed_admin(self, client):
        """Signed admin token allows access to executive overview."""
        signed_token = sign_identity(ADMIN, ["ROLE_ADMIN"])
        res = client.get(
            "/api/v1/analytics/overview",
            headers={"x-internal-identity": signed_token},
        )
        assert res.status_code == 200
        assert "data" in res.json()
