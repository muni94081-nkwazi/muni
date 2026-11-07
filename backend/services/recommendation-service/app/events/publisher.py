"""Kafka event publisher for review events matching shared Kafka producer."""
from __future__ import annotations

import json
import logging
from typing import Any, Dict, Optional
from aiokafka import AIOKafkaProducer

logger = logging.getLogger("recommendation-service")

_producer: Optional[AIOKafkaProducer] = None


async def connect_producer(brokers: str = "localhost:9092") -> None:
    global _producer
    try:
        _producer = AIOKafkaProducer(
            bootstrap_servers=brokers.split(","),
            value_serializer=lambda v: json.dumps(v).encode("utf-8"),
            key_serializer=lambda k: k.encode("utf-8") if k else None,
        )
        await _producer.start()
        logger.info("[recommendation-service] ✅ Kafka producer connected")
    except Exception as exc:
        logger.warning("[recommendation-service] Kafka producer unavailable: %s", exc)
        _producer = None


async def disconnect_producer() -> None:
    global _producer
    if _producer:
        try:
            await _producer.stop()
        except Exception:
            pass
        _producer = None


async def publish(topic: str, event: Dict[str, Any], key: Optional[str] = None) -> None:
    global _producer
    if not _producer:
        logger.info("[recommendation-service] Kafka unavailable — skipped publishing on %s: %s", topic, event)
        return
    try:
        await _producer.send_and_wait(topic, event, key=key)
    except Exception as exc:
        logger.warning("[recommendation-service] Failed to publish event on %s: %s", topic, exc)
