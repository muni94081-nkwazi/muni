"""Background recommendation precomputation worker matching precompute.job.ts."""
from __future__ import annotations

import asyncio
import logging
import time
from typing import Optional
from app.services.recommendation_engine_service import recommendation_engine_service

logger = logging.getLogger("recommendation-service")

_job_task: Optional[asyncio.Task] = None


async def run_precomputation() -> None:
    try:
        start_ms = time.time() * 1000

        # 1. Pre-compute Trending Now
        trending = await recommendation_engine_service.get_trending_now(10)

        # 2. Pre-compute Frequently Bought Together / item-similarity caches for key products
        sample_products = ["phone-001", "food-001", "fashion-001"]
        for pid in sample_products:
            await recommendation_engine_service.get_frequently_bought_together(pid)
            await recommendation_engine_service.get_customers_also_viewed(pid)
            await recommendation_engine_service.get_customers_also_bought(pid)

        elapsed_ms = int(time.time() * 1000 - start_ms)
        logger.info(
            "[recommendation-service] ✅ Pre-computed recommendations in %dms (Trending: %d items). Redis cache warmed.",
            elapsed_ms,
            len(trending),
        )
    except Exception as exc:
        logger.error("[recommendation-service] Error during recommendation pre-computation: %s", exc)


async def _worker_loop() -> None:
    await run_precomputation()
    while True:
        try:
            await asyncio.sleep(60 * 60)  # Hourly
            await run_precomputation()
        except asyncio.CancelledError:
            break
        except Exception as exc:
            logger.error("[recommendation-service] Pre-computation worker error: %s", exc)


def start_recommendation_precomputation_job() -> None:
    global _job_task
    logger.info("[recommendation-service] 🔄 Starting background recommendation pre-computation job (runs hourly)...")
    _job_task = asyncio.create_task(_worker_loop())


def stop_recommendation_precomputation_job() -> None:
    global _job_task
    if _job_task:
        _job_task.cancel()
        _job_task = None
