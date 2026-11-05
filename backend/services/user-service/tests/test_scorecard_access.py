from app.models.seller_trust import SellerTrustStats, SellerStanding
from app.models.user import User, Role


def test_who_may_read_a_seller_scorecard(client, db, make_token):
    # Setup seller user and stats
    seller = User(
        id="seller-1",
        firstName="Test",
        lastName="Seller",
        email="seller1@example.com",
        passwordHash="fake",
        role=Role.SELLER,
    )
    stats = SellerTrustStats(
        userId="seller-1",
        standing=SellerStanding.AT_RISK,
        standingReason="Above target: late shipment rate 6.0% (target 4.0%)",
        badges=[],
    )
    db.add(seller)
    db.add(stats)
    db.commit()

    # 1. Serves the seller their own
    seller_token = make_token("seller-1", role="SELLER")
    resp = client.get(
        "/api/v1/sellers/seller-1/scorecard",
        headers={"Authorization": f"Bearer {seller_token}"},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["success"] is True
    assert body["data"]["standing"] == "AT_RISK"

    # 2. Serves an admin
    admin_token = make_token("admin-9", role="ADMIN")
    resp_admin = client.get(
        "/api/v1/sellers/seller-1/scorecard",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert resp_admin.status_code == 200

    # 3. Refuses a different seller (403)
    diff_seller_token = make_token("seller-2", role="SELLER")
    resp_diff = client.get(
        "/api/v1/sellers/seller-1/scorecard",
        headers={"Authorization": f"Bearer {diff_seller_token}"},
    )
    assert resp_diff.status_code == 403
    assert resp_diff.json()["message"] == "You can only view your own scorecard"

    # 4. Refuses a signed-in customer (403)
    cust_token = make_token("cust-3", role="CUSTOMER")
    resp_cust = client.get(
        "/api/v1/sellers/seller-1/scorecard",
        headers={"Authorization": f"Bearer {cust_token}"},
    )
    assert resp_cust.status_code == 403


def test_admin_seller_verification(client, db, make_token):
    admin_token = make_token("admin-1", role="ADMIN")
    seller_token = make_token("seller-2", role="SELLER")

    # Non-admin forbidden
    forbidden = client.patch(
        "/api/v1/sellers/seller-2/verify",
        headers={"Authorization": f"Bearer {seller_token}"},
        json={"isVerified": True},
    )
    assert forbidden.status_code == 403
    assert forbidden.json()["message"] == "Insufficient permissions"

    # Admin allowed
    allowed = client.patch(
        "/api/v1/sellers/seller-2/verify",
        headers={"Authorization": f"Bearer {admin_token}"},
        json={"isVerified": True},
    )
    assert allowed.status_code == 200
    body = allowed.json()
    assert body["success"] is True
    assert "Verified Merchant" in body["data"]["badges"]


def test_admin_update_standing(client, db, make_token):
    admin_token = make_token("admin-1", role="ADMIN")
    seller_token = make_token("seller-3", role="SELLER")

    # Non-admin forbidden
    forbidden = client.patch(
        "/api/v1/sellers/seller-3/standing",
        headers={"Authorization": f"Bearer {seller_token}"},
        json={"standing": "SUSPENDED", "reason": "Policy breach"},
    )
    assert forbidden.status_code == 403

    # Admin allowed
    allowed = client.patch(
        "/api/v1/sellers/seller-3/standing",
        headers={"Authorization": f"Bearer {admin_token}"},
        json={"standing": "SUSPENDED", "reason": "Policy breach"},
    )
    assert allowed.status_code == 200
    body = allowed.json()
    assert body["success"] is True
    assert body["data"]["standing"] == "SUSPENDED"
    assert body["data"]["standingReason"] == "Policy breach"
