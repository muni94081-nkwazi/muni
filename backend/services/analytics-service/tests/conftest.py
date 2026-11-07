"""Pytest fixtures for analytics-service."""
from __future__ import annotations

import os
import pytest
from starlette.testclient import TestClient

from app.main import app
from app.cache import redis_cache
from app.consumers.events_consumer import reset_events_consumer_for_tests
from app.consumers.order_consumer import reset_order_consumer_for_tests
from app.consumers.payment_consumer import reset_payment_consumer_for_tests


@pytest.fixture(autouse=True)
def clean_test_environment(monkeypatch):
    """Reset in-memory state and ensure clean environment for each test."""
    monkeypatch.setenv("NODE_ENV", "test")
    monkeypatch.delenv("INTERNAL_IDENTITY_SECRET", raising=False)
    redis_cache.reset_for_tests()
    reset_events_consumer_for_tests()
    reset_order_consumer_for_tests()
    reset_payment_consumer_for_tests()
    yield
    redis_cache.reset_for_tests()
    reset_events_consumer_for_tests()
    reset_order_consumer_for_tests()
    reset_payment_consumer_for_tests()


@pytest.fixture
def client():
    """Test client for HTTP requests (skipping lifespan consumer startup in tests)."""
    with TestClient(app, raise_server_exceptions=False) as c:
        yield c
