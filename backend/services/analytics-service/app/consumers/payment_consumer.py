"""Kafka payment consumer tracking revenue, refunds, and payment methods."""
from __future__ import annotations

import asyncio
import json
import logging
from datetime import datetime, timezone
from typing import Any, Dict, Optional
from aiokafka import AIOKafkaConsumer

logger = logging.getLogger("analytics-service")

revenue_total: float = 0.0
revenue_by_day: Dict[str, float] = {}
refund_total: float = 0.0
payments_by_method: Dict[str, int] = {}
failed_payment_count: int = 0

_consumer: Optional[AIOKafkaConsumer] = None
_consumer_task: Optional[asyncio.Task] = None


def get_revenue_metrics() -> Dict[str, Any]:
    return {
        "revenueTotal": revenue_total,
        "revenueByDay": dict(revenue_by_day),
        "refundTotal": refund_total,
        "paymentsByMethod": dict(payments_by_method),
        "failedPaymentCount": failed_payment_count,
    }


def process_payment_message(raw_msg: str) -> None:
    global revenue_total, refund_total, failed_payment_count
    try:
        envelope = json.loads(raw_msg)
        event_type = envelope.get("eventType")
        data = envelope.get("data", {})

        if event_type == "payment.succeeded":
            amount = float(data.get("amount", 0) or 0)
            revenue_total += amount

            date_str = datetime.now(timezone.utc).strftime("%Y-%m-%d")
            revenue_by_day[date_str] = revenue_by_day.get(date_str, 0.0) + amount

            method = str(data.get("method") or "unknown")
            payments_by_method[method] = payments_by_method.get(method, 0) + 1
        elif event_type == "payment.failed":
            failed_payment_count += 1
        elif event_type == "payment.refunded":
            refund_total += float(data.get("amount", 0) or 0)
    except Exception as exc:
        logger.error("[analytics-service] Failed to process payment message: %s", exc)


async def _run_consumer() -> None:
    global _consumer
    if not _consumer:
        return
    try:
        async for msg in _consumer:
            raw = msg.value.decode("utf-8") if isinstance(msg.value, (bytes, bytearray)) else str(msg.value)
            process_payment_message(raw)
    except asyncio.CancelledError:
        pass
    except Exception as exc:
        logger.warning("[analytics-service] Payment consumer loop error: %s", exc)


async def start_payment_consumer(brokers: str = "localhost:9092") -> None:
    global _consumer, _consumer_task
    try:
        _consumer = AIOKafkaConsumer(
            "payment-events",
            bootstrap_servers=brokers.split(","),
            client_id="analytics-service-payment",
            group_id="analytics-service-payments",
            auto_offset_reset="latest",
            enable_auto_commit=True,
        )
        await _consumer.start()
        _consumer_task = asyncio.create_task(_run_consumer())
        logger.info("[analytics-service] ✅ Kafka payment analytics consumer started")
    except Exception as exc:
        logger.warning("[analytics-service] Failed to start Kafka payment analytics consumer: %s", exc)


async def stop_payment_consumer() -> None:
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


def reset_payment_consumer_for_tests() -> None:
    global revenue_total, refund_total, failed_payment_count
    revenue_total = 0.0
    revenue_by_day.clear()
    refund_total = 0.0
    payments_by_method.clear()
    failed_payment_count = 0
