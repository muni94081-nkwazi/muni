"""Events Kafka consumer subscribing to order lifecycle events for real-time analytics aggregation."""
from __future__ import annotations

import asyncio
import json
import logging
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional
from aiokafka import AIOKafkaConsumer

logger = logging.getLogger("analytics-service")

event_log: List[Dict[str, Any]] = []

counters: Dict[str, Any] = {
    "ordersCreated": 0,
    "ordersPaid": 0,
    "ordersShipped": 0,
    "ordersDelivered": 0,
    "ordersCancelled": 0,
    "revenueTotal": 0.0,
}

_consumer: Optional[AIOKafkaConsumer] = None
_consumer_task: Optional[asyncio.Task] = None


async def handle_event(event: Dict[str, Any]) -> None:
    now = (
        datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.")
        + f"{datetime.now(timezone.utc).microsecond // 1000:03d}Z"
    )

    topic = event.get("topic") or ""
    order_id = str(event.get("orderId") or event.get("id") or "")

    event_log.append({
        "topic": topic,
        "orderId": order_id,
        "receivedAt": now,
        "data": event,
    })
    if len(event_log) > 10_000:
        event_log.pop(0)

    # In Muni's TypeScript codebase, topic can identify the event type
    # or eventType is in payload.
    event_type = event.get("eventType") or ""
    if topic == "payment-events" or event_type in ("order.paid", "payment.succeeded"):
        counters["ordersPaid"] += 1
        amt = float(event.get("amount", 0) or 0)
        counters["revenueTotal"] += amt
        logger.info("[analytics] ORDER_PAID orderId=%s amount=%s", order_id, amt)
    elif event_type == "order.shipped" or topic == "order-events" and event.get("carrier"):
        counters["ordersShipped"] += 1
    elif event_type == "order.delivered" or topic == "order-events" and "deliveredAt" in event:
        counters["ordersDelivered"] += 1
    elif event_type == "order.cancelled" or topic == "order-events" and "cancelledAt" in event:
        counters["ordersCancelled"] += 1
    elif topic == "order-events" or event_type in ("order.created", "ORDER_CREATED"):
        counters["ordersCreated"] += 1
        logger.info("[analytics] ORDER_CREATED orderId=%s", order_id)


async def _run_consumer() -> None:
    global _consumer
    if not _consumer:
        return
    try:
        async for msg in _consumer:
            try:
                raw = msg.value.decode("utf-8") if isinstance(msg.value, (bytes, bytearray)) else str(msg.value)
                payload = json.loads(raw)
                if not payload.get("topic"):
                    payload["topic"] = msg.topic
                await handle_event(payload)
            except Exception as exc:
                logger.error("[analytics-service] Events consumer message processing failed: %s", exc)
    except asyncio.CancelledError:
        pass
    except Exception as exc:
        logger.warning("[analytics-service] Events consumer loop encountered error: %s", exc)


async def start_events_consumer(brokers: str = "localhost:9092") -> None:
    global _consumer, _consumer_task
    try:
        _consumer = AIOKafkaConsumer(
            "order-events",
            "payment-events",
            bootstrap_servers=brokers.split(","),
            group_id="analytics-service-events-group",
            auto_offset_reset="latest",
            enable_auto_commit=True,
        )
        await _consumer.start()
        _consumer_task = asyncio.create_task(_run_consumer())
        logger.info("[analytics-service] ✅ Events consumer started (all order topics)")
    except Exception as exc:
        logger.warning("[analytics-service] Events consumer failed to start (non-fatal): %s", exc)


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


def reset_events_consumer_for_tests() -> None:
    global event_log, counters
    event_log.clear()
    counters["ordersCreated"] = 0
    counters["ordersPaid"] = 0
    counters["ordersShipped"] = 0
    counters["ordersDelivered"] = 0
    counters["ordersCancelled"] = 0
    counters["revenueTotal"] = 0.0
