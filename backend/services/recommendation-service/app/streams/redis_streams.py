"""Redis Streams Event Bus implementation in Python matching backend/infrastructure/redis/streams.ts."""
from __future__ import annotations

import asyncio
import logging
import os
from typing import Any, Callable, Coroutine, Dict, Optional
import redis.asyncio as aioredis

logger = logging.getLogger("recommendation-service")


class STREAMS:
    CART_UPDATES = "stream:cart-updates"
    ORDER_TRACKING = "stream:order-tracking"
    FRAUD_ALERTS = "stream:fraud-alerts"
    PRICE_DROPS = "stream:price-drops"
    STOCK_ALERTS = "stream:stock-alerts"
    CHAT_MESSAGES = "stream:dispute-chat"
    CLICKSTREAM = "stream:clickstream"


class RedisStreamPublisher:
    """Publishes key/value events to Redis Streams with auto-trimming."""

    def __init__(self, redis_url: Optional[str] = None):
        self.redis_url = redis_url or os.environ.get("REDIS_URL", "redis://localhost:6379")
        self.client: Optional[aioredis.Redis] = None
        self.connected = False

    async def connect(self) -> None:
        try:
            self.client = aioredis.from_url(
                self.redis_url,
                socket_connect_timeout=2,
                socket_timeout=2,
                retry_on_timeout=False,
                decode_responses=True,
            )
            await self.client.ping()
            self.connected = True
            logger.info("[stream:publisher] ✅ Connected")
        except Exception as exc:
            self.connected = False
            logger.warning("[stream:publisher] Connection failed: %s", exc)

    async def publish(
        self,
        stream: str,
        event: Dict[str, Any],
        max_len: int = 10_000,
    ) -> str:
        if not self.connected or not self.client:
            logger.warning("[stream:publisher] Not connected — dropping event on %s", stream)
            return ""

        fields = {str(k): str(v) for k, v in event.items()}
        try:
            msg_id = await self.client.xadd(
                stream,
                fields,
                maxlen=max_len,
                approximate=True,
            )
            return str(msg_id)
        except Exception as exc:
            logger.error("[stream:publisher] Publish failed on %s: %s", stream, exc)
            return ""

    async def disconnect(self) -> None:
        if self.client:
            try:
                await self.client.aclose()
            except Exception:
                pass
        self.connected = False
        self.client = None


class RedisStreamConsumer:
    """Consumer Group worker consuming messages from Redis Streams."""

    def __init__(
        self,
        group_name: str,
        consumer_name: str,
        redis_url: Optional[str] = None,
    ):
        self.group_name = group_name
        self.consumer_name = consumer_name
        self.redis_url = redis_url or os.environ.get("REDIS_URL", "redis://localhost:6379")
        self.client: Optional[aioredis.Redis] = None
        self.handlers: Dict[str, Callable[[Dict[str, Any]], Coroutine[Any, Any, None]]] = {}
        self.running = False
        self._task: Optional[asyncio.Task] = None

    async def connect(self) -> None:
        try:
            self.client = aioredis.from_url(
                self.redis_url,
                socket_connect_timeout=2,
                socket_timeout=2,
                retry_on_timeout=False,
                decode_responses=True,
            )
            await self.client.ping()
            logger.info("[stream:consumer:%s] ✅ Connected", self.group_name)
        except Exception as exc:
            logger.warning("[stream:consumer:%s] Connect error: %s", self.group_name, exc)

    def on(self, stream: str, handler: Callable[[Dict[str, Any]], Coroutine[Any, Any, None]]) -> RedisStreamConsumer:
        self.handlers[stream] = handler
        return self

    async def start(self) -> None:
        if not self.client:
            return

        streams = list(self.handlers.keys())
        for stream in streams:
            try:
                await self.client.xgroup_create(stream, self.group_name, id="$", mkstream=True)
            except Exception:
                # Group already exists
                pass

        self.running = True
        logger.info("[stream:consumer:%s] Consuming: %s", self.group_name, ", ".join(streams))
        self._task = asyncio.create_task(self._poll(streams))

    async def _poll(self, streams: list[str]) -> None:
        while self.running and self.client:
            try:
                stream_dict = {s: ">" for s in streams}
                results = await self.client.xreadgroup(
                    groupname=self.group_name,
                    consumername=self.consumer_name,
                    streams=stream_dict,
                    count=10,
                    block=2000,
                )
                if not results:
                    continue

                for stream_name, messages in results:
                    handler = self.handlers.get(stream_name)
                    if not handler:
                        continue

                    for msg_id, message_data in messages:
                        try:
                            msg_obj = {
                                "id": msg_id,
                                "stream": stream_name,
                                "data": message_data,
                            }
                            await handler(msg_obj)
                            await self.client.xack(stream_name, self.group_name, msg_id)
                        except Exception as exc:
                            logger.error(
                                "[stream:consumer:%s] Handler failed for %s:%s: %s",
                                self.group_name,
                                stream_name,
                                msg_id,
                                exc,
                            )
            except asyncio.CancelledError:
                break
            except Exception as exc:
                if self.running:
                    logger.error("[stream:consumer:%s] Poll error: %s", self.group_name, exc)
                    await asyncio.sleep(1)

    async def stop(self) -> None:
        self.running = False
        if self._task:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
            self._task = None
        if self.client:
            try:
                await self.client.aclose()
            except Exception:
                pass
            self.client = None
        logger.info("[stream:consumer:%s] Stopped", self.group_name)


_default_publisher: Optional[RedisStreamPublisher] = None


def get_stream_publisher() -> RedisStreamPublisher:
    global _default_publisher
    if _default_publisher is None:
        _default_publisher = RedisStreamPublisher()
    return _default_publisher
