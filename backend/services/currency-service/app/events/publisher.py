"""
Kafka producer for currency-service.

Publishes ``rates.updated`` events to the ``currency-events`` topic after each
successful rate refresh.  Mirrors the TypeScript publishRatesEvent() method.

Event payload (identical to TypeScript):
  {
    "event":        "rates.updated",
    "baseCurrency": "USD",
    "rates":        { "USD": 1, "EUR": 0.92, ... },
    "updatedAt":    "2026-11-05T08:00:00.000Z"
  }
"""
from __future__ import annotations

import json
import logging
from datetime import datetime, timezone
from typing import Optional

logger = logging.getLogger("currency-service")

_producer = None  # aiokafka.AIOKafkaProducer – imported lazily to avoid hard dep in tests


async def connect_producer(brokers: str) -> None:
    """Connect the Kafka producer.  Non-fatal – rates still work without Kafka."""
    global _producer
    if not brokers:
        return
    try:
        from aiokafka import AIOKafkaProducer  # type: ignore
        _producer = AIOKafkaProducer(
            bootstrap_servers=brokers,
            value_serializer=lambda v: json.dumps(v).encode(),
        )
        await _producer.start()
        logger.info("[currency-service] Kafka producer connected")
    except Exception as exc:
        logger.warning("[currency-service] Kafka unavailable: %s", exc)
        _producer = None


async def disconnect_producer() -> None:
    global _producer
    if _producer is None:
        return
    try:
        await _producer.stop()
    except Exception:
        pass
    _producer = None


async def publish_rates_event(base_currency: str, rates: dict[str, float]) -> None:
    """
    Publish a ``rates.updated`` event.

    Timestamp format: ``YYYY-MM-DDTHH:MM:SS.mmmZ``
    (matches TypeScript ``new Date().toISOString()``)
    """
    if _producer is None:
        return
    now = datetime.now(timezone.utc)
    updated_at = now.strftime("%Y-%m-%dT%H:%M:%S.") + f"{now.microsecond // 1000:03d}Z"
    payload = {
        "event": "rates.updated",
        "baseCurrency": base_currency,
        "rates": rates,
        "updatedAt": updated_at,
    }
    try:
        await _producer.send_and_wait("currency-events", payload)
        logger.info("[currency-service] Published rates.updated event")
    except Exception as exc:
        logger.error("[currency-service] Failed to publish rates updated event: %s", exc)


def get_producer():
    return _producer
