import os
import pytest
from sqlalchemy import create_engine, select, text
from sqlalchemy.orm import sessionmaker
from fastapi.testclient import TestClient

from app.models.user import User, Role
from app.models.address import Address, AddressType
from app.models.preference import NotificationPreference
from app.models.seller_trust import SellerTrustStats, SellerStanding
from app.core.database import get_db
from app.core.security import hash_password, sign_access_token
from app.main import app

PG_TEST_URL = os.environ.get(
    "POSTGRES_TEST_DATABASE_URL",
    "postgresql://muni_test:muni_test_secret@localhost:5434/muni_user_test",
)


def is_postgres_available() -> bool:
    try:
        engine = create_engine(PG_TEST_URL, pool_pre_ping=True)
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        return True
    except Exception:
        return False


pytestmark = pytest.mark.skipif(
    not is_postgres_available(),
    reason="PostgreSQL test container is not available",
)


@pytest.fixture(scope="module")
def pg_session():
    engine = create_engine(PG_TEST_URL, pool_pre_ping=True)
    Session = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    session = Session()
    yield session
    session.close()


def test_postgres_enum_role_compatibility(pg_session):
    user = User(
        id="pg-test-user-1",
        firstName="Postgres",
        lastName="User",
        email="pguser@example.com",
        passwordHash=hash_password("Password123"),
        role=Role.SELLER,
    )
    pg_session.merge(user)
    pg_session.commit()

    saved = pg_session.query(User).filter(User.id == "pg-test-user-1").first()
    assert saved is not None
    assert saved.role == Role.SELLER
    assert saved.role.value == "SELLER"


def test_postgres_enum_address_type_compatibility(pg_session):
    addr = Address(
        id="pg-test-addr-1",
        userId="pg-test-user-1",
        type=AddressType.PICKUP_STATION,
        contactName="PG Contact",
        contactPhone="+256701234567",
        country="UG",
        region="Central",
        district="Kampala",
        addressLine="Station Alpha",
        pickupStationId="station-alpha-123",
    )
    pg_session.merge(addr)
    pg_session.commit()

    saved = pg_session.query(Address).filter(Address.id == "pg-test-addr-1").first()
    assert saved is not None
    assert saved.type == AddressType.PICKUP_STATION
    assert saved.type.value == "PICKUP_STATION"


def test_postgres_text_array_badges_persistence(pg_session):
    stats = SellerTrustStats(
        id="pg-test-stats-1",
        userId="pg-test-user-1",
        totalOrders=25,
        onTimeDeliveries=25,
        trustScore=98.0,
        badges=["Top Rated Seller", "Fast Shipper", "Verified Merchant"],
        standing=SellerStanding.GOOD,
    )
    pg_session.merge(stats)
    pg_session.commit()

    # Verify directly with raw SQL that PostgreSQL persisted a true TEXT[] array
    result = pg_session.execute(
        text("SELECT badges, pg_typeof(badges)::text as type_name FROM seller_trust_stats WHERE id = 'pg-test-stats-1'")
    ).fetchone()
    assert result is not None
    badges_val, type_name = result
    assert type_name == "text[]"
    assert "Top Rated Seller" in badges_val
    assert "Verified Merchant" in badges_val

    # Verify through ORM model
    loaded = pg_session.query(SellerTrustStats).filter(SellerTrustStats.id == "pg-test-stats-1").first()
    assert isinstance(loaded.badges, list)
    assert len(loaded.badges) == 3
    assert loaded.badges == ["Top Rated Seller", "Fast Shipper", "Verified Merchant"]

    # Test updating badges array
    loaded.badges.append("Custom Test Badge")
    pg_session.add(loaded)
    pg_session.commit()

    reloaded = pg_session.query(SellerTrustStats).filter(SellerTrustStats.id == "pg-test-stats-1").first()
    assert "Custom Test Badge" in reloaded.badges


def test_postgres_enum_seller_standing_compatibility(pg_session):
    stats = pg_session.query(SellerTrustStats).filter(SellerTrustStats.id == "pg-test-stats-1").first()
    stats.standing = SellerStanding.AT_RISK
    stats.standingReason = "Above target: late shipment rate 5.0%"
    pg_session.commit()

    raw_standing = pg_session.execute(
        text("SELECT standing::text FROM seller_trust_stats WHERE id = 'pg-test-stats-1'")
    ).scalar()
    assert raw_standing == "AT_RISK"


def test_postgres_full_http_api_flow():
    engine = create_engine(PG_TEST_URL, pool_pre_ping=True)
    Session = sessionmaker(autocommit=False, autoflush=False, bind=engine)

    def override_get_db():
        db = Session()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = override_get_db

    with TestClient(app) as client:
        # 1. Register a new user in PostgreSQL
        unique_email = f"pg.admin.{os.urandom(4).hex()}@example.ug"
        reg_payload = {
            "firstName": "Postgres",
            "lastName": "Admin",
            "email": unique_email,
            "password": "Password123",
        }
        resp = client.post("/api/v1/auth/register", json=reg_payload)
        assert resp.status_code == 201
        user_id = resp.json()["data"]["user"]["id"]
        token = resp.json()["data"]["accessToken"]

        # 2. Add an address in PostgreSQL
        addr_payload = {
            "type": "HOME",
            "contactName": "Postgres User",
            "contactPhone": "+256701234567",
            "region": "Central",
            "district": "Kampala",
            "addressLine": "Postgres Lane 10",
        }
        addr_resp = client.post(
            "/api/v1/addresses",
            json=addr_payload,
            headers={"Authorization": f"Bearer {token}"},
        )
        assert addr_resp.status_code == 201
        assert addr_resp.json()["data"]["isDefault"] is True

        # 3. Create a seller trust stats row and record trust events in PostgreSQL
        seller_id = "pg-live-seller-99"
        seller_user = User(
            id=seller_id,
            firstName="Live",
            lastName="Seller",
            email="liveseller@example.com",
            passwordHash=hash_password("Password123"),
            role=Role.SELLER,
        )
        db = Session()
        db.merge(seller_user)
        db.commit()
        db.close()

        seller_token = sign_access_token({"id": seller_id, "email": "liveseller@example.com", "role": "SELLER"})
        event_resp = client.post(
            f"/api/v1/sellers/{seller_id}/trust-events",
            headers={"Authorization": f"Bearer {seller_token}"},
            json={"eventType": "ORDER_DELIVERED_ON_TIME"},
        )
        assert event_resp.status_code == 200
        assert event_resp.json()["data"]["userId"] == seller_id
        assert event_resp.json()["data"]["trustScore"] == 96.0

        # 4. Admin verifies the seller
        admin_token = sign_access_token({"id": user_id, "email": "pg.admin@example.ug", "role": "ADMIN"})
        verify_resp = client.patch(
            f"/api/v1/sellers/{seller_id}/verify",
            headers={"Authorization": f"Bearer {admin_token}"},
            json={"isVerified": True},
        )
        assert verify_resp.status_code == 200
        assert "Verified Merchant" in verify_resp.json()["data"]["badges"]

    app.dependency_overrides.clear()
