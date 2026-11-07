"""Redis cache wrapper matching Muni shared cache semantics."""
from __future__ import annotations

import inspect
import json
import logging
from typing import Any, Callable, Optional
import redis.asyncio as aioredis

logger = logging.getLogger("analytics-service")

_client: Optional[aioredis.Redis] = None
_ready: bool = False


async def connect_cache(redis_url: str = "redis://localhost:6379", service_name: str = "analytics-service") -> None:
    global _client, _ready
    try:
        _client = aioredis.from_url(
            redis_url,
            socket_connect_timeout=2,
            socket_timeout=2,
            retry_on_timeout=False,
            decode_responses=True,
        )
        await _client.ping()
        _ready = True
        logger.info("[cache:%s] ✅ Redis ready", service_name)
    except Exception as exc:
        _ready = False
        logger.warning("[cache:%s] Connection failed: %s", service_name, exc)


async def disconnect_cache() -> None:
    global _client, _ready
    if _client is not None:
        try:
            await _client.aclose()
        except Exception:
            pass
    _client = None
    _ready = False


def is_cache_ready() -> bool:
    return _ready


class Cache:
    """Helper mimicking the shared TypeScript cache object."""

    async def get_or_set(self, key: str, ttl_sec: int, fetcher: Callable[[], Any]) -> Any:
        global _client, _ready
        if _client and _ready:
            try:
                cached = await _client.get(key)
                if cached is not None:
                    return json.loads(cached)
            except Exception as exc:
                logger.warning("[cache] Redis GET failed for '%s': %s", key, exc)

        if inspect.iscoroutinefunction(fetcher):
            val = await fetcher()
        else:
            val = fetcher()
            if inspect.iscoroutine(val):
                val = await val

        # Handle Pydantic models by converting to dict
        serializable_val = val.model_dump(by_alias=True) if hasattr(val, "model_dump") else val

        if _client and _ready:
            try:
                await _client.set(key, json.dumps(serializable_val), ex=ttl_sec)
            except Exception as exc:
                logger.warning("[cache] Redis SET failed for '%s': %s", key, exc)

        return serializable_val

    async def get(self, key: str) -> Optional[Any]:
        global _client, _ready
        if not _client or not _ready:
            return None
        try:
            raw = await _client.get(key)
            return json.loads(raw) if raw else None
        except Exception as exc:
            logger.warning("[cache] Redis GET failed for '%s': %s", key, exc)
            return None

    async def set(self, key: str, value: Any, ttl_sec: int) -> None:
        global _client, _ready
        if not _client or not _ready:
            return
        try:
            serializable_val = value.model_dump(by_alias=True) if hasattr(value, "model_dump") else value
            await _client.set(key, json.dumps(serializable_val), ex=ttl_sec)
        except Exception as exc:
            logger.warning("[cache] Redis SET failed for '%s': %s", key, exc)


cache = Cache()


def reset_for_tests() -> None:
    """Test seam to clear client and ready state."""
    global _client, _ready
    _client = None
    _ready = False
