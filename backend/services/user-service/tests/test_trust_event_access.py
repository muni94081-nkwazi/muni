from app.core.internal_identity import (
    sign_identity,
    sign_service_identity,
    INTERNAL_IDENTITY_HEADER,
)


SELLER_ID = "seller-user-1"
OTHER_SELLER_ID = "seller-user-2"


class TestUnauthenticatedCallers:
    def test_rejects_request_with_no_credentials(self, client):
        resp = client.post(
            f"/api/v1/sellers/{SELLER_ID}/trust-events",
            json={"eventType": "ORDER_DELIVERED_ON_TIME"},
        )
        assert resp.status_code == 401
        assert resp.json()["message"] == "Missing or malformed Authorization header"

    def test_rejects_malformed_authorization_header(self, client):
        resp = client.post(
            f"/api/v1/sellers/{SELLER_ID}/trust-events",
            headers={"Authorization": "stub-token-without-a-scheme"},
            json={"eventType": "ORDER_DELIVERED_ON_TIME"},
        )
        assert resp.status_code == 401

    def test_rejects_invalid_or_expired_bearer_token(self, client):
        resp = client.post(
            f"/api/v1/sellers/{SELLER_ID}/trust-events",
            headers={"Authorization": "Bearer invalid.token.value"},
            json={"eventType": "ORDER_DELIVERED_ON_TIME"},
        )
        assert resp.status_code == 401

    def test_rejects_forged_internal_identity_header(self, client):
        resp = client.post(
            f"/api/v1/sellers/{SELLER_ID}/trust-events",
            headers={INTERNAL_IDENTITY_HEADER: "not.a.real.assertion"},
            json={"eventType": "ORDER_DELIVERED_ON_TIME"},
        )
        assert resp.status_code == 401


class TestCrossSellerRejections:
    def test_refuses_events_aimed_at_different_seller(self, client, make_token):
        token = make_token(OTHER_SELLER_ID, role="SELLER")
        resp = client.post(
            f"/api/v1/sellers/{SELLER_ID}/trust-events",
            headers={"Authorization": f"Bearer {token}"},
            json={"eventType": "ORDER_DELIVERED_ON_TIME"},
        )
        assert resp.status_code == 403
        assert resp.json()["message"] == "You can only record trust events for your own seller account"

    def test_refuses_signed_in_customer(self, client, make_token):
        token = make_token("customer-9", role="CUSTOMER")
        resp = client.post(
            f"/api/v1/sellers/{SELLER_ID}/trust-events",
            headers={"Authorization": f"Bearer {token}"},
            json={"eventType": "ORDER_DELIVERED_ON_TIME"},
        )
        assert resp.status_code == 403

    def test_refuses_gateway_signed_shopper_without_svc(self, client):
        shopper_assertion = sign_identity("customer-9", ["ROLE_CUSTOMER"])
        assert shopper_assertion is not None

        resp = client.post(
            f"/api/v1/sellers/{SELLER_ID}/trust-events",
            headers={INTERNAL_IDENTITY_HEADER: shopper_assertion},
            json={"eventType": "ORDER_DELIVERED_ON_TIME"},
        )
        assert resp.status_code == 401


class TestAuthorizedCallers:
    def test_allows_seller_against_own_id(self, client, make_token):
        token = make_token(SELLER_ID, role="SELLER")
        resp = client.post(
            f"/api/v1/sellers/{SELLER_ID}/trust-events",
            headers={"Authorization": f"Bearer {token}"},
            json={"eventType": "ORDER_DELIVERED_ON_TIME"},
        )
        assert resp.status_code == 200
        assert resp.json()["success"] is True

    def test_allows_admin_against_any_seller(self, client, make_token):
        token = make_token("admin-1", role="ADMIN")
        resp = client.post(
            f"/api/v1/sellers/{SELLER_ID}/trust-events",
            headers={"Authorization": f"Bearer {token}"},
            json={"eventType": "ORDER_DELIVERED_ON_TIME"},
        )
        assert resp.status_code == 200

    def test_allows_peer_services(self, client):
        for service in ["dispute-service", "buyer-protection-service"]:
            assertion = sign_service_identity(SELLER_ID, [], service)
            assert assertion is not None

            resp = client.post(
                f"/api/v1/sellers/{SELLER_ID}/trust-events",
                headers={INTERNAL_IDENTITY_HEADER: assertion},
                json={"eventType": "ORDER_DELIVERED_ON_TIME"},
            )
            assert resp.status_code == 200, f"Failed for {service}"

    def test_does_not_require_bearer_token_from_peer_service(self, client):
        assertion = sign_service_identity(OTHER_SELLER_ID, [], "dispute-service")
        resp = client.post(
            f"/api/v1/sellers/{SELLER_ID}/trust-events",
            headers={INTERNAL_IDENTITY_HEADER: assertion},
            json={"eventType": "ORDER_DELIVERED_ON_TIME"},
        )
        assert resp.status_code == 200
