"""Unit tests for Kafka event handling in analytics-service consumers."""
from __future__ import annotations

import json
import pytest

from app.consumers.events_consumer import handle_event, counters, event_log
from app.consumers.order_consumer import process_order_message, get_order_metrics
from app.consumers.payment_consumer import process_payment_message, get_revenue_metrics


@pytest.mark.anyio
async def test_events_consumer_order_created():
    event = {
        "topic": "order-events",
        "orderId": "ord-101",
        "total": 50000,
        "currency": "UGX",
    }
    await handle_event(event)
    assert counters["ordersCreated"] == 1
    assert len(event_log) == 1
    assert event_log[0]["orderId"] == "ord-101"


@pytest.mark.anyio
async def test_events_consumer_order_paid():
    event = {
        "topic": "payment-events",
        "orderId": "ord-102",
        "amount": 75000,
        "currency": "UGX",
    }
    await handle_event(event)
    assert counters["ordersPaid"] == 1
    assert counters["revenueTotal"] == 75000.0


@pytest.mark.anyio
async def test_events_consumer_lifecycle():
    await handle_event({"topic": "order-events", "eventType": "order.shipped", "orderId": "ord-1"})
    await handle_event({"topic": "order-events", "eventType": "order.delivered", "orderId": "ord-1"})
    await handle_event({"topic": "order-events", "eventType": "order.cancelled", "orderId": "ord-2"})

    assert counters["ordersShipped"] == 1
    assert counters["ordersDelivered"] == 1
    assert counters["ordersCancelled"] == 1


def test_order_consumer_message_processing():
    msg = json.dumps({
        "eventType": "order.created",
        "data": {
            "id": "order-abc",
            "userId": "user-123",
            "total": 120000,
        },
    })
    process_order_message(msg)

    metrics = get_order_metrics()
    assert metrics["totalOrdersCount"] == 1
    assert metrics["ordersByStatus"].get("order.created") == 1
    assert len(metrics["recentOrders"]) == 1
    assert metrics["recentOrders"][0]["id"] == "order-abc"

    # Confirm order
    update_msg = json.dumps({
        "eventType": "order.confirmed",
        "data": {"id": "order-abc"},
    })
    process_order_message(update_msg)
    metrics = get_order_metrics()
    assert metrics["ordersByStatus"].get("order.confirmed") == 1
    assert metrics["recentOrders"][0]["status"] == "order.confirmed"


def test_payment_consumer_message_processing():
    succeeded_msg = json.dumps({
        "eventType": "payment.succeeded",
        "data": {
            "amount": 250000,
            "method": "MTN_MOMO",
        },
    })
    process_payment_message(succeeded_msg)

    refunded_msg = json.dumps({
        "eventType": "payment.refunded",
        "data": {
            "amount": 50000,
        },
    })
    process_payment_message(refunded_msg)

    failed_msg = json.dumps({
        "eventType": "payment.failed",
        "data": {},
    })
    process_payment_message(failed_msg)

    metrics = get_revenue_metrics()
    assert metrics["revenueTotal"] == 250000.0
    assert metrics["refundTotal"] == 50000.0
    assert metrics["failedPaymentCount"] == 1
    assert metrics["paymentsByMethod"].get("MTN_MOMO") == 1
