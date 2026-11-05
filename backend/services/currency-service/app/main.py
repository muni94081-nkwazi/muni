"""
FastAPI application entry point for the Python currency-service.

Startup sequence mirrors TypeScript bootstrap() in app.ts:
  1. Connect Redis rate cache (non-fatal)
  2. Connect Kafka producer (non-fatal, logged as warning)
  3. Start periodic rate refresh (fetches immediately, then every interval)
  4. Listen on PORT

Health endpoints mirror TypeScript exactly:
  GET /health        → { "service": "currency-service", "status": "up" }
  GET /health/live   → { "service": "currency-service", "status": "up" }
  GET /health/ready  → { "service": "currency-service", "ready": true,
                         "rates": { "source": "...", "ageSeconds": N, "stale": bool } }

Error handler:
  Validation (422):  { "message": "Validation failed", "issues": [...] }
  Other errors (N):  { "message": "<text>" }
"""
from __future__ import annotations

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

from app.api.routes import router
from app.cache import rates_cache
from app.config import settings
from app.events import publisher
from app.services.currency_service import CurrencyService

logging.basicConfig(
    level=getattr(logging, settings.log_level.upper(), logging.INFO),
    format='{"time": "%(asctime)s", "level": "%(levelname)s", "service": "currency-service", "message": "%(message)s"}',
)
logger = logging.getLogger("currency-service")


@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Startup / shutdown lifecycle.

    Redis and Kafka failures are non-fatal: rates fall back to the built-in
    table so conversion answers at all rather than taking checkout down.
    """
    svc = CurrencyService(
        redis_url=settings.redis_url,
        base_currency=settings.base_currency,
    )
    app.state.currency_service = svc

    # Non-fatal: Redis
    await rates_cache.connect_rates_cache(settings.redis_url)

    # Non-fatal: Kafka
    try:
        await publisher.connect_producer(settings.kafka_brokers)
    except Exception as exc:
        logger.warning("[currency-service] Kafka unavailable: %s", exc)

    # Initial fetch + schedule periodic refresh
    await svc.start_rate_refresh(settings.rate_refresh_interval_ms)

    logger.info("Currency Service (Python) listening on port %s", settings.port)
    yield

    # ── Shutdown ──────────────────────────────────────────────────────────────
    svc.stop_rate_refresh()
    try:
        await publisher.disconnect_producer()
    except Exception:
        pass
    await rates_cache.disconnect_rates_cache()
    logger.info("[currency-service] Shutdown complete")


app = FastAPI(
    title="Muni Currency Service",
    version="1.0.0",
    lifespan=lifespan,
    # Disable default /docs redirect that could confuse health checks
    docs_url="/docs",
    redoc_url=None,
)

# ── Routes ────────────────────────────────────────────────────────────────────

app.include_router(router)


# ── Health endpoints ──────────────────────────────────────────────────────────

@app.get("/health")
@app.get("/health/live")
async def health_live():
    return {"service": "currency-service", "status": "up"}


@app.get("/health/ready")
async def health_ready(request: Request):
    svc: CurrencyService = request.app.state.currency_service
    view = await svc.get_all_rates()
    return {
        "service": "currency-service",
        "ready": True,
        "rates": {
            "source": view.source,
            "ageSeconds": view.ageSeconds,
            "stale": view.stale,
        },
    }


# ── Error handlers ────────────────────────────────────────────────────────────

@app.exception_handler(RequestValidationError)
async def validation_exception_handler(_request: Request, exc: RequestValidationError):
    """
    Mirrors TypeScript ZodError handler:
      res.status(422).json({ message: "Validation failed", issues: error.issues })
    """
    return JSONResponse(
        status_code=422,
        content={"message": "Validation failed", "issues": exc.errors()},
    )


@app.exception_handler(Exception)
async def generic_exception_handler(_request: Request, exc: Exception):
    logger.error("Unhandled error: %s", exc)
    return JSONResponse(
        status_code=500,
        content={"message": str(exc) or "Internal server error"},
    )
