"""
Tests for Kafka event payload compatibility.

Verifies that the Python publisher emits the same JSON payload format and
field names as the TypeScript publishRatesEvent() method so downstream
consumers (payment-service, etc.) are unaffected by the migration.

Expected payload structure (identical to TypeScript):
  {
    "event":        "rates.updated",
    "baseCurrency": "USD",
    "rates":        { "USD": 1.0, ... },
    "updatedAt":    "2026-11-05T08:00:00.000Z"   <- ISO-8601, 3ms precision, trailing Z
  }
"""
from __future__ import annotations

import json
import re
import pytest
from unittest.mock import AsyncMock, MagicMock, patch


ISO8601_Z_RE = re.compile(r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$")


class TestKafkaPayloadFormat:
    """Verify the rates.updated event shape against the TypeScript contract."""

    @pytest.mark.anyio
    async def test_payload_has_required_fields(self):
        """Event must carry event, baseCurrency, rates, updatedAt."""
        captured = []

        async def fake_send_and_wait(topic, payload):
            captured.append((topic, payload))

        mock_producer = MagicMock()
        mock_producer.send_and_wait = AsyncMock(side_effect=fake_send_and_wait)

        from app.events import publisher
        original = publisher._producer
        publisher._producer = mock_producer
        try:
            rates = {"USD": 1.0, "EUR": 0.92, "UGX": 3800.0}
            await publisher.publish_rates_event("USD", rates)
        finally:
            publisher._producer = original

        assert len(captured) == 1
        topic, payload = captured[0]
        assert topic == "currency-events"
        assert payload["event"] == "rates.updated"
        assert payload["baseCurrency"] == "USD"
        assert payload["rates"] == rates
        assert "updatedAt" in payload

    @pytest.mark.anyio
    async def test_updated_at_is_iso8601_with_z(self):
        """updatedAt must be ISO-8601 with millisecond precision and trailing Z."""
        captured = []

        async def fake_send_and_wait(topic, payload):
            captured.append(payload)

        mock_producer = MagicMock()
        mock_producer.send_and_wait = AsyncMock(side_effect=fake_send_and_wait)

        from app.events import publisher
        original = publisher._producer
        publisher._producer = mock_producer
        try:
            await publisher.publish_rates_event("USD", {"USD": 1.0})
        finally:
            publisher._producer = original

        payload = captured[0]
        assert ISO8601_Z_RE.match(payload["updatedAt"]), (
            f"updatedAt '{payload['updatedAt']}' does not match YYYY-MM-DDTHH:MM:SS.mmmZ"
        )

    @pytest.mark.anyio
    async def test_no_producer_does_not_raise(self):
        """When Kafka is unavailable (producer=None) publish_rates_event must not raise."""
        from app.events import publisher
        original = publisher._producer
        publisher._producer = None
        try:
            # Must complete silently
            await publisher.publish_rates_event("USD", {"USD": 1.0})
        finally:
            publisher._producer = original

    @pytest.mark.anyio
    async def test_rates_are_json_serialisable(self):
        """The payload must be JSON-serialisable – same requirement as the TS implementation."""
        captured = []

        async def fake_send_and_wait(topic, payload):
            # Simulate the AIOKafka value_serializer
            serialised = json.dumps(payload).encode()
            captured.append(json.loads(serialised))

        mock_producer = MagicMock()
        mock_producer.send_and_wait = AsyncMock(side_effect=fake_send_and_wait)

        from app.events import publisher
        original = publisher._producer
        publisher._producer = mock_producer
        try:
            rates = {"USD": 1.0, "EUR": 0.92, "KES": 130.0}
            await publisher.publish_rates_event("USD", rates)
        finally:
            publisher._producer = original

        assert captured[0]["rates"] == rates

    @pytest.mark.anyio
    async def test_topic_name_is_currency_events(self):
        """Topic must be 'currency-events' – same as TypeScript."""
        topics = []

        async def fake_send_and_wait(topic, payload):
            topics.append(topic)

        mock_producer = MagicMock()
        mock_producer.send_and_wait = AsyncMock(side_effect=fake_send_and_wait)

        from app.events import publisher
        original = publisher._producer
        publisher._producer = mock_producer
        try:
            await publisher.publish_rates_event("USD", {"USD": 1.0})
        finally:
            publisher._producer = original

        assert topics == ["currency-events"]


class TestRatesCacheJsonSchema:
    """
    Verify the Redis JSON schema is byte-for-byte compatible with the TypeScript
    cache so both services can share the same Redis key during parallel-run.

    TypeScript schema (rates.cache.ts):
      { baseCurrency: string, rates: Record<string, number>,
        fetchedAt: string, source: 'live'|'cache'|'fallback' }
    """

    @pytest.mark.anyio
    async def test_written_snapshot_has_correct_fields(self):
        from app.cache import rates_cache
        from datetime import datetime, timezone
        now = datetime.now(timezone.utc)
        fetched_at = now.strftime("%Y-%m-%dT%H:%M:%S.") + f"{now.microsecond // 1000:03d}Z"
        snapshot = {
            "baseCurrency": "USD",
            "rates": {"USD": 1.0, "UGX": 3800.0},
            "fetchedAt": fetched_at,
            "source": "live",
        }
        await rates_cache.write_rates(snapshot, redis_url="")
        # Read it back via memo
        result = await rates_cache.read_rates(redis_url="")
        assert result is not None
        assert set(result.keys()) == {"baseCurrency", "rates", "fetchedAt", "source"}
        assert result["baseCurrency"] == "USD"
        assert result["rates"]["UGX"] == 3800.0
        assert ISO8601_Z_RE.match(result["fetchedAt"]), (
            f"fetchedAt '{result['fetchedAt']}' is not ISO-8601 with trailing Z"
        )

    @pytest.mark.anyio
    async def test_redis_key_name_constant(self):
        """The Redis key must be 'muni:currency:rates' – same as TypeScript."""
        from app.cache import rates_cache
        assert rates_cache.REDIS_KEY == "muni:currency:rates"

    @pytest.mark.anyio
    async def test_cache_ttl_is_12_hours(self):
        """TTL must be 12 h (43200 s) – same as TypeScript CACHE_TTL_SECONDS."""
        from app.cache import rates_cache
        assert rates_cache.CACHE_TTL_SECONDS == 43200

    @pytest.mark.anyio
    async def test_source_relabelled_live_to_cache_via_redis(self, monkeypatch):
        """
        When a snapshot is read back from Redis (not the in-process memo),
        source is relabelled 'live' → 'cache' to signal another replica fetched it.
        TypeScript: `return { ...snapshot, source: snapshot.source === 'live' ? 'cache' : snapshot.source }`
        """
        from app.cache import rates_cache
        import json

        fake_raw = json.dumps({
            "baseCurrency": "USD",
            "rates": {"USD": 1.0},
            "fetchedAt": "2026-01-01T00:00:00.000Z",
            "source": "live",
        })

        mock_redis = AsyncMock()
        mock_redis.get = AsyncMock(return_value=fake_raw)

        # Inject mock client and ensure clean teardown via monkeypatch
        monkeypatch.setattr(rates_cache, "_client", mock_redis)

        result = await rates_cache.read_rates(redis_url="redis://fake")
        assert result["source"] == "cache", (
            "source should be relabelled 'live' → 'cache' when read from Redis"
        )
        # monkeypatch automatically restores _client after the test
