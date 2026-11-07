"""Pytest fixtures and environment initialization for recommendation-service."""
from __future__ import annotations

import os
import pytest
from starlette.testclient import TestClient

from app.main import app
from app.cache import redis_cache
from app.store import event_store
from app.services.affinity_service import user_affinity_service
from app.services.reputation_service import seller_reputation_service
from app.services.review_service import review_service


@pytest.fixture(autouse=True)
def clean_environment(monkeypatch):
    monkeypatch.setenv("NODE_ENV", "test")
    redis_cache.reset_for_tests()
    event_store.seed_historical_data()
    user_affinity_service.reset_for_tests()
    seller_reputation_service.reset_for_tests()
    review_service.reset_for_tests()
    yield
    redis_cache.reset_for_tests()
    event_store.seed_historical_data()
    user_affinity_service.reset_for_tests()
    seller_reputation_service.reset_for_tests()
    review_service.reset_for_tests()


@pytest.fixture
def client():
    with TestClient(app, raise_server_exceptions=False) as c:
        yield c
