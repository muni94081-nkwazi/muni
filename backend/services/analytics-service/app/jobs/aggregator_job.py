"""Background hourly analytics pre-aggregation worker matching aggregator.job.ts."""
from __future__ import annotations

import asyncio
import logging
import time
from typing import Optional
from app.services.seller_analytics import seller_analytics_service
from app.services.admin_analytics import admin_analytics_service
from app.cache.redis_cache import cache

logger = logging.getLogger("analytics-service")

FIVE_MINUTES = 5 * 60  # 300 seconds TTL
_job_task: Optional[asyncio.Task] = None


async def run_preaggregation() -> None:
    try:
        start_ms = time.time() * 1000

        # 1. Pre-aggregate Admin Dashboard
        admin_data = await admin_analytics_service.get_admin_dashboard("month")
        await cache.set("analytics:admin:month", admin_data, FIVE_MINUTES)

        # 2. Pre-aggregate Top Seller Dashboards
        sample_sellers = ["seller-001", "seller-002", "ven-001", "ven-002"]
        for seller_id in sample_sellers:
            seller_data = await seller_analytics_service.get_seller_dashboard(seller_id, "month")
            await cache.set(f"analytics:seller:{seller_id}:month", seller_data, FIVE_MINUTES)

        elapsed_ms = int(time.time() * 1000 - start_ms)
        logger.info(
            "[analytics-service] ✅ Hourly analytics pre-aggregation completed in %dms. Redis cache warmed (5-minute TTL).",
            elapsed_ms,
        )
    except Exception as exc:
        logger.error("[analytics-service] Error during analytics pre-aggregation: %s", exc)


async def _worker_loop() -> None:
    # Run once immediately on startup
    await run_preaggregation()
    while True:
        try:
            await asyncio.sleep(60 * 60)  # Hourly
            await run_preaggregation()
        except asyncio.CancelledError:
            break
        except Exception as exc:
            logger.error("[analytics-service] Pre-aggregation worker error: %s", exc)


def start_analytics_aggregator_job() -> None:
    global _job_task
    logger.info("[analytics-service] 🔄 Starting background hourly analytics pre-aggregation worker...")
    _job_task = asyncio.create_task(_worker_loop())


def stop_analytics_aggregator_job() -> None:
    global _job_task
    if _job_task:
        _job_task.cancel()
        _job_task = None
