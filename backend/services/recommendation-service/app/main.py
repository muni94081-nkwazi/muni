"""FastAPI application entrypoint for recommendation-service."""
from __future__ import annotations

import asyncio
import logging
import os
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from typing import Any, AsyncGenerator, Dict

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, RedirectResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.config import settings
from app.cache.redis_cache import connect_cache, disconnect_cache, is_cache_ready
from app.streams.redis_streams import get_stream_publisher
from app.events import publisher
from app.consumers.events_consumer import start_events_consumer, stop_events_consumer
from app.consumers.clickstream_consumer import start_clickstream_consumer, stop_clickstream_consumer
from app.jobs.precompute_job import (
    start_recommendation_precomputation_job,
    stop_recommendation_precomputation_job,
)
from app.api.routes import router

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s")
logger = logging.getLogger("recommendation-service")


@asynccontextmanager
async def lifespan(_app: FastAPI) -> AsyncGenerator[None, None]:
    is_test = settings.NODE_ENV == "test" or os.environ.get("NODE_ENV") == "test"
    if is_test:
        yield
        return

    # 1. Connect Redis Cache (non-fatal)
    try:
        await connect_cache(settings.REDIS_URL, "recommendation-service")
    except Exception as exc:
        logger.warning("[recommendation-service] Redis unavailable — caching disabled: %s", exc)

    # 2. Connect Kafka Producer & Consumer (non-fatal)
    try:
        await publisher.connect_producer(settings.KAFKA_BROKERS)
    except Exception as exc:
        logger.warning("[recommendation-service] Kafka producer failed to start (non-fatal): %s", exc)

    try:
        await start_events_consumer(settings.KAFKA_BROKERS)
    except Exception as exc:
        logger.warning("[recommendation-service] Kafka consumer failed to start (non-fatal): %s", exc)

    # 3. Redis Streams Publisher & Consumer (non-fatal)
    try:
        await get_stream_publisher().connect()
    except Exception as exc:
        logger.warning("[recommendation-service] Redis Streams publisher unavailable (non-fatal): %s", exc)

    try:
        await start_clickstream_consumer(settings.REDIS_URL)
    except Exception as exc:
        logger.warning("[recommendation-service] Clickstream consumer failed to start (non-fatal): %s", exc)

    # 4. Background recommendation pre-computation job
    start_recommendation_precomputation_job()

    yield

    # 5. Graceful shutdown
    stop_recommendation_precomputation_job()
    await stop_events_consumer()
    await stop_clickstream_consumer()
    try:
        await get_stream_publisher().disconnect()
    except Exception:
        pass
    try:
        await publisher.disconnect_producer()
    except Exception:
        pass
    await disconnect_cache()


app = FastAPI(
    title="Muni Recommendation Service",
    description="AI-Powered Recommendation and Review System for Muni Marketplace",
    version="1.0.0",
    lifespan=lifespan,
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(StarletteHTTPException)
async def starlette_http_exception_handler(_req: Request, exc: StarletteHTTPException) -> JSONResponse:
    if isinstance(exc.detail, dict):
        return JSONResponse(status_code=exc.status_code, content=exc.detail)
    return JSONResponse(status_code=exc.status_code, content={"success": False, "message": str(exc.detail)})


# ─── Health Checks ─────────────────────────────────────────────────────────────


@app.get("/health/live")
async def health_live() -> Dict[str, Any]:
    now = (
        datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.")
        + f"{datetime.now(timezone.utc).microsecond // 1000:03d}Z"
    )
    return {
        "service": "recommendation-service",
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
        "service": "recommendation-service",
        "ready": True,
        "redis": "up" if is_cache_ready() else "degraded",
        "ts": now,
    }


@app.get("/health", include_in_schema=False)
async def health_redirect() -> RedirectResponse:
    return RedirectResponse(url="/health/live", status_code=307)


# Include API routes
app.include_router(router)
