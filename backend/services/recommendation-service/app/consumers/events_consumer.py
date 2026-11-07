"""Kafka event consumer for recommendation-service, tracking delivered orders for verified purchase reviews."""
from __future__ import annotations

import asyncio
import json
import logging
from typing import Any, Dict, Optional
from aiokafka import AIOKafkaConsumer
from app.services.review_service import review_service

logger = logging.getLogger("recommendation-service")

_consumer: Optional[AIOKafkaConsumer] = None
_consumer_task: Optional[asyncio.Task] = None


async def handle_order_delivered_message(envelope: Dict[str, Any]) -> None:
    event_type = envelope.get("eventType")
    topic = envelope.get("topic")

    if event_type == "order.delivered" or topic == "order.delivered":
        user_id = envelope.get("userId")
        product_id = envelope.get("productId")
        seller_id = envelope.get("sellerId")
        sub_orders = envelope.get("subOrders")

        if user_id:
            if product_id:
                review_service.record_delivered_purchase(user_id, product_id=product_id)
            if seller_id:
                review_service.record_delivered_purchase(user_id, seller_id=seller_id)
            if sub_orders and isinstance(sub_orders, list):
                for so in sub_orders:
                    if isinstance(so, dict) and so.get("sellerId"):
                        review_service.record_delivered_purchase(user_id, seller_id=so["sellerId"])


async def _run_consumer() -> None:
    global _consumer
    if not _consumer:
        return
    try:
        async for msg in _consumer:
            raw = msg.value.decode("utf-8") if isinstance(msg.value, (bytes, bytearray)) else str(msg.value)
            if not raw:
                continue
            try:
                envelope = json.loads(raw)
                await handle_order_delivered_message(envelope)
            except Exception as exc:
                logger.warning("[recommendation-service] Error processing Kafka event: %s", exc)
    except asyncio.CancelledError:
        pass
    except Exception as exc:
        logger.warning("[recommendation-service] Events consumer loop encountered error: %s", exc)


async def start_events_consumer(brokers: str = "localhost:9092") -> None:
    global _consumer, _consumer_task
    try:
        _consumer = AIOKafkaConsumer(
            "order-events",
            bootstrap_servers=brokers.split(","),
            client_id="recommendation-service",
            group_id="recommendation-service-events-group",
            auto_offset_reset="latest",
            enable_auto_commit=True,
        )
        await _consumer.start()
        _consumer_task = asyncio.create_task(_run_consumer())
        logger.info("[recommendation-service] ✅ Kafka order events consumer started")
    except Exception as exc:
        logger.warning("[recommendation-service] Kafka consumer failed to start (non-fatal): %s", exc)


async def stop_events_consumer() -> None:
    global _consumer, _consumer_task
    if _consumer_task:
        _consumer_task.cancel()
        try:
            await _consumer_task
        except asyncio.CancelledError:
            pass
        _consumer_task = None
    if _consumer:
        try:
            await _consumer.stop()
        except Exception:
            pass
        _consumer = None
