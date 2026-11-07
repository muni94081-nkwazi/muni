"""Kafka order consumer tracking order metrics by status, day, and recent orders."""
from __future__ import annotations

import asyncio
import json
import logging
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional
from aiokafka import AIOKafkaConsumer

logger = logging.getLogger("analytics-service")

orders_by_status: Dict[str, int] = {}
orders_by_day: Dict[str, int] = {}
total_orders_count: int = 0
recent_orders: List[Dict[str, Any]] = []

_consumer: Optional[AIOKafkaConsumer] = None
_consumer_task: Optional[asyncio.Task] = None


def get_order_metrics() -> Dict[str, Any]:
    return {
        "ordersByStatus": dict(orders_by_status),
        "ordersByDay": dict(orders_by_day),
        "totalOrdersCount": total_orders_count,
        "recentOrders": list(recent_orders),
    }


def process_order_message(raw_msg: str) -> None:
    global total_orders_count
    try:
        envelope = json.loads(raw_msg)
        event_type = envelope.get("eventType")
        data = envelope.get("data", {})

        if event_type in ("order.created", "order.confirmed", "order.cancelled", "order.delivered"):
            orders_by_status[event_type] = orders_by_status.get(event_type, 0) + 1

            if event_type == "order.created":
                total_orders_count += 1
                date_str = datetime.now(timezone.utc).strftime("%Y-%m-%d")
                orders_by_day[date_str] = orders_by_day.get(date_str, 0) + 1

                order_id = data.get("id") or data.get("orderId")
                recent_orders.insert(0, {
                    "id": order_id,
                    "userId": data.get("userId"),
                    "total": data.get("total"),
                    "status": event_type,
                    "createdAt": datetime.now(timezone.utc).isoformat(),
                })
                if len(recent_orders) > 50:
                    recent_orders.pop()
            else:
                order_id = data.get("id") or data.get("orderId")
                for ro in recent_orders:
                    if ro.get("id") == order_id:
                        ro["status"] = event_type
                        break
    except Exception as exc:
        logger.error("[analytics-service] Failed to process order message: %s", exc)


async def _run_consumer() -> None:
    global _consumer
    if not _consumer:
        return
    try:
        async for msg in _consumer:
            raw = msg.value.decode("utf-8") if isinstance(msg.value, (bytes, bytearray)) else str(msg.value)
            process_order_message(raw)
    except asyncio.CancelledError:
        pass
    except Exception as exc:
        logger.warning("[analytics-service] Order consumer loop error: %s", exc)


async def start_order_consumer(brokers: str = "localhost:9092") -> None:
    global _consumer, _consumer_task
    try:
        _consumer = AIOKafkaConsumer(
            "order-events",
            bootstrap_servers=brokers.split(","),
            client_id="analytics-service-order",
            group_id="analytics-service-orders",
            auto_offset_reset="latest",
            enable_auto_commit=True,
        )
        await _consumer.start()
        _consumer_task = asyncio.create_task(_run_consumer())
        logger.info("[analytics-service] ✅ Kafka order analytics consumer started")
    except Exception as exc:
        logger.warning("[analytics-service] Failed to start Kafka order analytics consumer: %s", exc)


async def stop_order_consumer() -> None:
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


def reset_order_consumer_for_tests() -> None:
    global total_orders_count
    orders_by_status.clear()
    orders_by_day.clear()
    total_orders_count = 0
    recent_orders.clear()
