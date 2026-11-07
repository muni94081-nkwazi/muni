"""Tests for Redis Streams event parsing and Kafka consumer processing."""
from __future__ import annotations

import pytest
from app.consumers.events_consumer import handle_order_delivered_message
from app.consumers.clickstream_consumer import handle_stream_message
from app.services.review_service import review_service
from app.services.affinity_service import user_affinity_service


@pytest.mark.anyio
async def test_kafka_order_delivered_grants_verified_buyer_status():
    user_id = "user-delivered-test"
    product_id = "prod-delivered-test"
    seller_id = "seller-delivered-test"

    assert not review_service.is_verified_buyer(user_id, product_id)
    assert not review_service.is_verified_buyer(user_id, seller_id)

    envelope = {
        "eventType": "order.delivered",
        "userId": user_id,
        "productId": product_id,
        "sellerId": seller_id,
    }
    await handle_order_delivered_message(envelope)

    assert review_service.is_verified_buyer(user_id, product_id)
    assert review_service.is_verified_buyer(user_id, seller_id)


@pytest.mark.anyio
async def test_kafka_order_delivered_with_suborders():
    user_id = "user-suborders-test"
    envelope = {
        "eventType": "order.delivered",
        "userId": user_id,
        "subOrders": [
            {"sellerId": "seller-sub-1"},
            {"sellerId": "seller-sub-2"},
        ],
    }
    await handle_order_delivered_message(envelope)

    assert review_service.is_verified_buyer(user_id, "seller-sub-1")
    assert review_service.is_verified_buyer(user_id, "seller-sub-2")


@pytest.mark.anyio
async def test_clickstream_stream_message_processing():
    import time
    now_ts = str(int(time.time() * 1000))
    msg = {
        "id": f"{now_ts}-0",
        "stream": "stream:clickstream",
        "data": {
            "userId": "user-stream-test",
            "eventType": "category_browse",
            "category": "fashion",
            "timestamp": now_ts,
        },
    }
    await handle_stream_message(msg)

    profile = await user_affinity_service.get_profile("user-stream-test")
    assert "fashion" in profile.categoryAffinity
    assert profile.categoryAffinity["fashion"] == 0.5
