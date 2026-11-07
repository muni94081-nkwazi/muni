"""Redis Streams consumer for real-time clickstream events."""
from __future__ import annotations

import logging
import os
import time
from typing import Any, Dict, Optional
from app.streams.redis_streams import RedisStreamConsumer, STREAMS
from app.services.affinity_service import user_affinity_service
from app.services.recommendation_engine_service import recommendation_engine_service
from app.store.event_store import record_cart_add
from app.models.recommendation import ClickstreamEventType

logger = logging.getLogger("recommendation-service")

CLICKSTREAM_EVENT_TYPES = {"product_view", "category_browse", "add_to_cart", "wishlist"}
_consumer: Optional[RedisStreamConsumer] = None


async def handle_stream_message(message: Dict[str, Any]) -> None:
    data = message.get("data", {})
    user_id = data.get("userId")
    event_type = data.get("eventType")
    product_id = data.get("productId")
    category = data.get("category")
    raw_ts = data.get("timestamp")

    if not user_id or event_type not in CLICKSTREAM_EVENT_TYPES:
        return

    ts = int(raw_ts) if raw_ts else int(time.time() * 1000)

    await user_affinity_service.record_event({
        "userId": user_id,
        "eventType": event_type,
        "productId": product_id or None,
        "category": category or None,
        "timestamp": ts,
    })

    if event_type == "product_view" and product_id:
        await recommendation_engine_service.track_view(user_id, product_id, category or None)
    elif event_type == "add_to_cart" and product_id:
        record_cart_add(user_id, product_id, ts)


async def start_clickstream_consumer(redis_url: Optional[str] = None) -> None:
    global _consumer
    try:
        pid = os.getpid()
        _consumer = RedisStreamConsumer("recommendation-service-clickstream", f"reco-{pid}", redis_url=redis_url)
        _consumer.on(STREAMS.CLICKSTREAM, handle_stream_message)
        await _consumer.connect()
        await _consumer.start()
        logger.info("[recommendation-service] ✅ Clickstream Redis Streams consumer started")
    except Exception as exc:
        logger.warning("[recommendation-service] Clickstream consumer failed to start (non-fatal): %s", exc)


async def stop_clickstream_consumer() -> None:
    global _consumer
    if _consumer:
        try:
            await _consumer.stop()
        except Exception:
            pass
        _consumer = None
