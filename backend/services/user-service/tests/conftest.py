import os
import sys
from pathlib import Path

# Add backend/services/user-service to sys.path so 'app' is importable
service_dir = Path(__file__).resolve().parent.parent
if str(service_dir) not in sys.path:
    sys.path.insert(0, str(service_dir))

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

os.environ["NODE_ENV"] = "test"
os.environ["DATABASE_URL"] = "sqlite:///:memory:"
os.environ["JWT_ACCESS_SECRET"] = "test-access-secret-minimum-length-needed-here-12345"
os.environ["JWT_REFRESH_SECRET"] = "test-refresh-secret-minimum-length-needed-here-12345"
os.environ["INTERNAL_IDENTITY_SECRET"] = "test-internal-identity-secret-at-least-32-chars"
os.environ["PASSWORD_RESET_TOKEN_TTL_MINUTES"] = "30"

from app.core.config import settings
settings.DATABASE_URL = "sqlite:///:memory:"
settings.JWT_ACCESS_SECRET = "test-access-secret-minimum-length-needed-here-12345"
settings.JWT_REFRESH_SECRET = "test-refresh-secret-minimum-length-needed-here-12345"
settings.INTERNAL_IDENTITY_SECRET = "test-internal-identity-secret-at-least-32-chars"

from app.core.database import Base, get_db
from app.main import app
from app.core.security import sign_access_token

test_engine = create_engine(
    "sqlite:///:memory:",
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=test_engine)


@pytest.fixture(scope="session", autouse=True)
def setup_db():
    Base.metadata.create_all(bind=test_engine)
    yield
    Base.metadata.drop_all(bind=test_engine)


@pytest.fixture
def db():
    connection = test_engine.connect()
    transaction = connection.begin()
    session = TestingSessionLocal(bind=connection)

    yield session

    session.close()
    transaction.rollback()
    connection.close()


@pytest.fixture
def client(db):
    def override_get_db():
        try:
            yield db
        finally:
            pass

    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()


@pytest.fixture
def make_token():
    def _make(user_id: str, role: str = "CUSTOMER", email: str = None):
        user_dict = {
            "id": user_id,
            "role": role,
            "email": email or f"{user_id}@example.test",
        }
        return sign_access_token(user_dict)
    return _make
