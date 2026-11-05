"""
Shared Redis cache for exchange rates.

Design mirrors the TypeScript cache/rates.cache.ts exactly:

- One shared Redis key: ``muni:currency:rates``
- TTL: 12 hours (CACHE_TTL_SECONDS)
- An in-process ``memo`` serves reads when Redis is unavailable
- ``source`` is re-labelled from ``live`` → ``cache`` when a snapshot is read
  back out of Redis (meaning another replica fetched it, not this process)
- ``reset_for_tests()`` drops both memo and client – same seam as TypeScript's
  ``resetRatesCacheForTests()``

JSON schema written to Redis:
  {
    "baseCurrency": "USD",
    "rates":        { "USD": 1, "EUR": 0.92, ... },
    "fetchedAt":    "2026-11-05T08:00:00.000Z",
    "source":       "live"
  }

This schema is **shared** with the TypeScript service: both processes read and
write the same Redis key, so neither the key name nor the field names may change.
"""
from __future__ import annotations

import json
import logging
import math
import time
from typing import Optional

import redis.asyncio as aioredis

logger = logging.getLogger("currency-service")

REDIS_KEY = "muni:currency:rates"          # Must match TypeScript exactly
CACHE_TTL_SECONDS = 12 * 60 * 60          # 12 hours – twice the refresh interval

# In-process fallback: last snapshot this process has seen.
# Serves reads when Redis is unreachable, just as TypeScript does.
_memo: Optional[dict] = None
_client: Optional[aioredis.Redis] = None


def _get_client(redis_url: str) -> Optional[aioredis.Redis]:
    """Return (and lazily create) the Redis client, or None if REDIS_URL is unset."""
    global _client
    if _client is not None:
        return _client
    if not redis_url:
        logger.warning("[rates-cache] REDIS_URL not set — rates will not be shared between replicas")
        return None
    _client = aioredis.from_url(
        redis_url,
        socket_connect_timeout=2,
        socket_timeout=2,
        retry_on_timeout=False,
        decode_responses=True,
    )
    return _client


async def connect_rates_cache(redis_url: str) -> None:
    """
    Attempt to open the Redis connection.  Non-fatal: rates have a built-in
    fallback table so a missing Redis degrades conversion rather than stopping it.
    """
    client = _get_client(redis_url)
    if client is None:
        return
    try:
        await client.ping()
        logger.info("[rates-cache] ✅ Redis connected")
    except Exception as exc:
        logger.warning(
            "[rates-cache] Redis unavailable — falling back to per-process rates: %s", exc
        )


async def disconnect_rates_cache() -> None:
    global _client
    if _client is None:
        return
    try:
        await _client.aclose()
    except Exception:
        pass
    _client = None


async def read_rates(redis_url: str) -> Optional[dict]:
    """
    Read the shared snapshot.

    - Tries Redis first; on hit, re-labels ``source`` from ``live`` → ``cache``
      (another replica fetched it; this process did not).
    - Falls back to the in-process memo when Redis is unreachable.
    - Returns ``None`` if neither has a snapshot yet.
    """
    global _memo
    client = _get_client(redis_url)
    if client is not None:
        try:
            raw = await client.get(REDIS_KEY)
            if raw:
                snapshot = json.loads(raw)
                _memo = snapshot
                # Re-label: a snapshot fetched by another replica is 'cache' here.
                if snapshot.get("source") == "live":
                    snapshot = {**snapshot, "source": "cache"}
                return snapshot
        except Exception as exc:
            logger.warning("[rates-cache] Read failed — using last known rates: %s", exc)
    return _memo


async def write_rates(snapshot: dict, redis_url: str) -> None:
    """Publish a freshly fetched snapshot for every replica to use."""
    global _memo
    _memo = snapshot
    client = _get_client(redis_url)
    if client is None:
        return
    try:
        await client.set(REDIS_KEY, json.dumps(snapshot), ex=CACHE_TTL_SECONDS)
    except Exception as exc:
        logger.warning("[rates-cache] Write failed — this replica will use its own rates: %s", exc)


def age_seconds(snapshot: dict) -> int:
    """Age of a snapshot in seconds, for staleness reporting."""
    fetched_at = snapshot.get("fetchedAt", "1970-01-01T00:00:00.000Z")
    try:
        # Parse ISO-8601 with Z suffix
        from datetime import datetime, timezone
        dt = datetime.fromisoformat(fetched_at.replace("Z", "+00:00"))
        elapsed = time.time() - dt.timestamp()
        return max(0, math.floor(elapsed))
    except Exception:
        return 0


def reset_for_tests() -> None:
    """Drop memo and client — test seam matching TypeScript's resetRatesCacheForTests()."""
    global _memo, _client
    _memo = None
    _client = None
