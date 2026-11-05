"""
Shared pytest fixtures for currency-service tests.

The CurrencyService is constructed with redis_url="" so tests use the
in-process memo (same behaviour as TypeScript tests where REDIS_URL is unset).
"""
from __future__ import annotations

import sys
from pathlib import Path

# Ensure the service root is on sys.path so `from app.xxx import ...` resolves.
_SERVICE_ROOT = str(Path(__file__).resolve().parent.parent)
if _SERVICE_ROOT not in sys.path:
    sys.path.insert(0, _SERVICE_ROOT)

import pytest
from fastapi.testclient import TestClient


@pytest.fixture(autouse=True)
def reset_rates_cache():
    """
    Drop the in-process memo before every test — same seam as TypeScript
    resetRatesCacheForTests() called in beforeEach.
    """
    from app.cache import rates_cache
    rates_cache.reset_for_tests()
    yield
    rates_cache.reset_for_tests()


@pytest.fixture
def service():
    """A CurrencyService with no Redis (uses in-process memo)."""
    from app.services.currency_service import CurrencyService
    return CurrencyService(redis_url="", base_currency="USD")


@pytest.fixture
def client(service):
    """
    FastAPI TestClient wired to a fresh CurrencyService instance.
    Bypasses lifespan so no real Redis/Kafka connections are made.
    """
    from app.main import app
    app.state.currency_service = service
    with TestClient(app, raise_server_exceptions=True) as c:
        yield c


LIVE_RATES = {
    "USD": 1.0,
    "EUR": 0.92,
    "GBP": 0.79,
    "KES": 130.0,
    "UGX": 3800.0,
}
