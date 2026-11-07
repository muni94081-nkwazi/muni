"""FastAPI application entrypoint for analytics-service."""
from __future__ import annotations

import asyncio
import logging
import os
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from typing import Any, AsyncGenerator, Dict

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import RedirectResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.config import settings, assert_internal_identity_configured
from app.core.exceptions import (
    AnalyticsError,
    analytics_error_handler,
    starlette_http_exception_handler,
)
from app.cache.redis_cache import connect_cache, disconnect_cache, is_cache_ready
from app.consumers.events_consumer import start_events_consumer, stop_events_consumer
from app.consumers.order_consumer import start_order_consumer, stop_order_consumer
from app.consumers.payment_consumer import start_payment_consumer, stop_payment_consumer
from app.jobs.aggregator_job import start_analytics_aggregator_job, stop_analytics_aggregator_job
from app.api.routes import router

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s")
logger = logging.getLogger("analytics-service")


@asynccontextmanager
async def lifespan(_app: FastAPI) -> AsyncGenerator[None, None]:
    # 1. Startup validation
    assert_internal_identity_configured("analytics-service")

    is_test = settings.NODE_ENV == "test" or os.environ.get("NODE_ENV") == "test"
    if is_test:
        yield
        return

    # 2. Connect Redis cache (non-fatal)
    try:
        await connect_cache(settings.REDIS_URL, "analytics-service")
    except Exception as exc:
        logger.warning("[analytics-service] Redis unavailable — caching disabled: %s", exc)

    # 3. Start Kafka consumers (non-fatal)
    consumer_starts = [
        start_events_consumer(settings.KAFKA_BROKERS),
        start_order_consumer(settings.KAFKA_BROKERS),
        start_payment_consumer(settings.KAFKA_BROKERS),
    ]
    results = await asyncio.gather(*consumer_starts, return_exceptions=True)
    for idx, res in enumerate(results):
        if isinstance(res, Exception):
            logger.warning("[analytics-service] Consumer %d failed to start (non-fatal): %s", idx, res)

    # 4. Start background aggregator job
    start_analytics_aggregator_job()

    yield

    # 5. Graceful shutdown
    stop_analytics_aggregator_job()
    await asyncio.gather(
        stop_events_consumer(),
        stop_order_consumer(),
        stop_payment_consumer(),
        disconnect_cache(),
        return_exceptions=True,
    )


app = FastAPI(
    title="Muni Analytics Service",
    description="Analytics and Business Intelligence Service for Muni Marketplace",
    version="1.0.0",
    lifespan=lifespan,
)

# Exception handlers matching Express responses
app.add_exception_handler(AnalyticsError, analytics_error_handler)
app.add_exception_handler(StarletteHTTPException, starlette_http_exception_handler)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ─── Health Checks ─────────────────────────────────────────────────────────────


@app.get("/health/live")
async def health_live() -> Dict[str, Any]:
    now = (
        datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.")
        + f"{datetime.now(timezone.utc).microsecond // 1000:03d}Z"
    )
    return {
        "service": "analytics-service",
        "status": "up",
        "ts": now,
    }


@app.get("/health/ready")
async def health_ready() -> Dict[str, Any]:
    now = (
        datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.")
        + f"{datetime.now(timezone.utc).microsecond // 1000:03d}Z"
    )
    return {
        "service": "analytics-service",
        "ready": True,
        "redis": "up" if is_cache_ready() else "degraded",
        "ts": now,
    }


@app.get("/health", include_in_schema=False)
async def health_redirect() -> RedirectResponse:
    return RedirectResponse(url="/health/live", status_code=307)


# Include API routes
app.include_router(router)
