"""API route handlers matching Express app.ts in TypeScript analytics-service."""
from __future__ import annotations

import logging
import random
from typing import Any, Dict, List, Optional
from fastapi import APIRouter, Depends, Query, Request, Response, status

from app.api.deps import UserIdentity, require_auth, require_admin, optional_auth, is_staff
from app.core.exceptions import AnalyticsError
from app.models.analytics import TimePeriod
from app.cache.redis_cache import cache
from app.services.seller_analytics import seller_analytics_service
from app.services.admin_analytics import admin_analytics_service
from app.consumers.events_consumer import counters, event_log
from app.consumers.order_consumer import get_order_metrics
from app.consumers.payment_consumer import get_revenue_metrics

logger = logging.getLogger("analytics-service")

router = APIRouter()
FIVE_MINUTES = 5 * 60  # 300 seconds TTL


# ─── Seller BI Dashboard ────────────────────────────────────────────────────────


async def _handle_seller_dashboard(
    seller_id: str,
    caller: UserIdentity,
    period: TimePeriod = "month",
) -> Dict[str, Any]:
    # IDOR Protection
    if seller_id and seller_id != caller.user_id and not is_staff(caller):
        raise AnalyticsError.seller_idor()

    target_seller = seller_id or caller.user_id
    cache_key = f"analytics:seller:{target_seller}:{period}"

    data = await cache.get_or_set(
        cache_key,
        FIVE_MINUTES,
        lambda: seller_analytics_service.get_seller_dashboard(target_seller, period),
    )
    return {"success": True, "data": data}


@router.get("/api/v1/analytics/dashboard/seller/{seller_id}")
async def get_seller_dashboard_v1(
    seller_id: str,
    caller: UserIdentity = Depends(require_auth),
    period: TimePeriod = Query(default="month"),
) -> Dict[str, Any]:
    return await _handle_seller_dashboard(seller_id, caller, period)


@router.get("/api/analytics/dashboard/seller/{seller_id}")
async def get_seller_dashboard_alias(
    seller_id: str,
    caller: UserIdentity = Depends(require_auth),
    period: TimePeriod = Query(default="month"),
) -> Dict[str, Any]:
    return await _handle_seller_dashboard(seller_id, caller, period)


@router.get("/api/v1/analytics/seller/{vendor_id}")
async def get_seller_dashboard_vendor_alias(
    vendor_id: str,
    caller: UserIdentity = Depends(require_auth),
    period: TimePeriod = Query(default="month"),
) -> Dict[str, Any]:
    return await _handle_seller_dashboard(vendor_id, caller, period)


# ─── Platform Executive Admin Dashboard ─────────────────────────────────────────


async def _handle_admin_dashboard(period: TimePeriod = "month") -> Dict[str, Any]:
    cache_key = f"analytics:admin:{period}"
    data = await cache.get_or_set(
        cache_key,
        FIVE_MINUTES,
        lambda: admin_analytics_service.get_admin_dashboard(period),
    )
    return {"success": True, "data": data}


@router.get("/api/v1/analytics/dashboard/admin")
async def get_admin_dashboard_v1(
    _admin: UserIdentity = Depends(require_admin),
    period: TimePeriod = Query(default="month"),
) -> Dict[str, Any]:
    return await _handle_admin_dashboard(period)


@router.get("/api/analytics/dashboard/admin")
async def get_admin_dashboard_alias(
    _admin: UserIdentity = Depends(require_admin),
    period: TimePeriod = Query(default="month"),
) -> Dict[str, Any]:
    return await _handle_admin_dashboard(period)


# ─── Legacy Overview & Analytics Endpoints ──────────────────────────────────────


@router.get("/api/v1/analytics/overview")
async def get_overview(_admin: UserIdentity = Depends(require_admin)) -> Dict[str, Any]:
    order_metrics = get_order_metrics()
    revenue_metrics = get_revenue_metrics()
    return {
        "data": {
            "live": {
                **counters,
                "ordersCreated": order_metrics["totalOrdersCount"],
                "revenueTotal": revenue_metrics["revenueTotal"],
                "refundTotal": revenue_metrics["refundTotal"],
            },
            "gmv": {
                "total": 284_500_000 + revenue_metrics["revenueTotal"],
                "currency": "UGX",
                "growthPercent": 18.5,
            },
            "orders": {
                "total": 8_931 + order_metrics["totalOrdersCount"],
                "today": 47,
                "fulfillmentRate": 0.94,
                "byStatus": order_metrics["ordersByStatus"],
            },
            "users": {
                "total": 12_847,
                "customers": 12_505,
                "sellers": 342,
            },
            "revenue": {
                "commission": 28_450_000,
                "currency": "UGX",
                "byMethod": revenue_metrics["paymentsByMethod"],
            },
        }
    }


@router.get("/api/v1/analytics/gmv")
async def get_gmv(_admin: UserIdentity = Depends(require_admin)) -> Dict[str, Any]:
    periods = ["Jan", "Feb", "Mar", "Apr", "May", "Jun"]
    data = [
        {
            "period": p,
            "gmv": random.randint(10_000_000, 60_000_000),
            "orders": random.randint(200, 1200),
        }
        for p in periods
    ]
    return {"data": data}


@router.get("/api/v1/analytics/sellers")
async def get_sellers(_admin: UserIdentity = Depends(require_admin)) -> Dict[str, Any]:
    return {
        "data": [
            {
                "vendorId": "ven-001",
                "name": "Kampala Electronics",
                "gmv": 45_000_000,
                "orders": 1_200,
                "fulfillmentRate": 0.98,
                "rating": 4.8,
            },
            {
                "vendorId": "ven-002",
                "name": "Fresh Groceries",
                "gmv": 32_000_000,
                "orders": 4_500,
                "fulfillmentRate": 0.95,
                "rating": 4.6,
            },
        ]
    }


@router.get("/api/v1/analytics/products")
async def get_products(_admin: UserIdentity = Depends(require_admin)) -> Dict[str, Any]:
    return {
        "data": [
            {
                "productId": "prod-001",
                "name": "Samsung Galaxy S24",
                "revenue": 15_000_000,
                "unitsSold": 5,
                "views": 1_200,
            },
            {
                "productId": "prod-002",
                "name": "Nike Air Max",
                "revenue": 8_000_000,
                "unitsSold": 40,
                "views": 3_500,
            },
        ]
    }


# ─── Seller Analytics (Pending) ─────────────────────────────────────────────────


@router.get("/api/v1/analytics/sales")
async def get_seller_sales(_seller: UserIdentity = Depends(require_auth)) -> Dict[str, Any]:
    return {
        "data": [],
        "meta": {
            "pending": True,
            "reason": "Per-seller daily aggregation is not implemented; analytics-service has no persistent store.",
        },
    }


@router.get("/api/v1/analytics/top-products")
async def get_seller_top_products(_seller: UserIdentity = Depends(require_auth)) -> Dict[str, Any]:
    return {
        "data": [],
        "meta": {
            "pending": True,
            "reason": "Per-seller product aggregation is not implemented; analytics-service has no persistent store.",
        },
    }


# ─── Events Log & Ingestion ─────────────────────────────────────────────────────


@router.get("/api/v1/analytics/events")
async def get_events(_admin: UserIdentity = Depends(require_admin)) -> Dict[str, Any]:
    # Return last 100 events reversed
    return {"data": list(reversed(event_log[-100:]))}


@router.post("/api/v1/analytics/events", status_code=status.HTTP_204_NO_CONTENT)
async def post_event(
    request: Request,
    _caller: Optional[UserIdentity] = Depends(optional_auth),
) -> Response:
    try:
        body = await request.json()
        logger.info("[ANALYTICS] Tracked event: %s", body)
    except Exception:
        pass
    return Response(status_code=status.HTTP_204_NO_CONTENT)
