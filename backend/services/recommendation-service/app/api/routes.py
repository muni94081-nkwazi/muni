"""Route handlers for recommendation strategies, clickstream events, and reviews."""
from __future__ import annotations

import logging
from typing import Any, Dict, Optional
from fastapi import APIRouter, Depends, Header, HTTPException, Query, Request, Response, status
from fastapi.responses import JSONResponse

from app.models.recommendation import ClickstreamEventType
from app.services.recommendation_engine_service import recommendation_engine_service
from app.services.review_service import (
    review_service,
    CreateProductReviewInput,
    CreateSellerReviewInput,
)
from app.services.reputation_service import seller_reputation_service
from app.streams.redis_streams import get_stream_publisher, STREAMS

logger = logging.getLogger("recommendation-service")
router = APIRouter()

CLICKSTREAM_EVENT_TYPES = {"product_view", "category_browse", "add_to_cart", "wishlist"}


# ─── Recommendation Strategy Routes ──────────────────────────────────────────


@router.get("/api/v1/recommendations/also-viewed/{product_id}")
async def get_customers_also_viewed(
    product_id: str,
    limit: int = Query(default=6),
) -> Dict[str, Any]:
    clamped_limit = min(20, max(1, limit))
    data = await recommendation_engine_service.get_customers_also_viewed(product_id, clamped_limit)
    return {"success": True, "data": data, "strategy": "customers_also_viewed"}


@router.get("/api/v1/recommendations/similar/{product_id}")
async def get_similar_legacy(
    product_id: str,
    limit: int = Query(default=6),
) -> Dict[str, Any]:
    clamped_limit = min(20, max(1, limit))
    data = await recommendation_engine_service.get_customers_also_viewed(product_id, clamped_limit)
    return {"success": True, "data": data, "strategy": "customers_also_viewed"}


@router.get("/api/v1/recommendations/also-bought/{product_id}")
async def get_customers_also_bought(
    product_id: str,
    limit: int = Query(default=6),
) -> Dict[str, Any]:
    clamped_limit = min(20, max(1, limit))
    data = await recommendation_engine_service.get_customers_also_bought(product_id, clamped_limit)
    return {"success": True, "data": data, "strategy": "customers_who_bought_this_also_bought"}


@router.get("/api/v1/recommendations/frequently-bought-together/{product_id}")
async def get_frequently_bought_together(product_id: str) -> Dict[str, Any]:
    data = await recommendation_engine_service.get_frequently_bought_together(product_id)
    return {"success": True, "data": data, "strategy": "frequently_bought_together"}


async def _handle_personalized(user_id_param: Optional[str], x_user_id: Optional[str], limit: int) -> Dict[str, Any]:
    user_id = user_id_param or x_user_id or "user-123"
    clamped_limit = min(50, max(1, limit))
    data = await recommendation_engine_service.get_personalized_for_user(user_id, clamped_limit)
    return {
        "success": True,
        "data": data,
        "strategy": "personalized_for_you",
        "userId": user_id,
    }


@router.get("/api/v1/recommendations/personalized")
async def get_personalized_v1(
    user_id: Optional[str] = Query(default=None),
    x_user_id: Optional[str] = Header(default=None),
    limit: int = Query(default=10),
) -> Dict[str, Any]:
    return await _handle_personalized(user_id, x_user_id, limit)


@router.get("/api/recommendations/personalized")
async def get_personalized_alias(
    user_id: Optional[str] = Query(default=None),
    x_user_id: Optional[str] = Header(default=None),
    limit: int = Query(default=10),
) -> Dict[str, Any]:
    return await _handle_personalized(user_id, x_user_id, limit)


@router.get("/api/v1/recommendations/products")
async def get_products_legacy(
    user_id: Optional[str] = Query(default=None),
    x_user_id: Optional[str] = Header(default=None),
    limit: int = Query(default=10),
) -> Dict[str, Any]:
    return await _handle_personalized(user_id, x_user_id, limit)


@router.get("/api/v1/recommendations/trending")
async def get_trending_now(limit: int = Query(default=10)) -> Dict[str, Any]:
    clamped_limit = min(50, max(1, limit))
    data = await recommendation_engine_service.get_trending_now(clamped_limit)
    return {"success": True, "data": data, "strategy": "trending_now"}


async def _handle_home_feed(user_id_param: Optional[str], x_user_id: Optional[str], limit: int) -> Dict[str, Any]:
    user_id = user_id_param or x_user_id or "user-123"
    clamped_limit = min(20, max(1, limit))
    data = await recommendation_engine_service.get_home_feed(user_id, clamped_limit)
    return {"success": True, "data": data}


@router.get("/api/v1/recommendations/home-feed")
async def get_home_feed_v1(
    user_id: Optional[str] = Query(default=None),
    x_user_id: Optional[str] = Header(default=None),
    limit: int = Query(default=8),
) -> Dict[str, Any]:
    return await _handle_home_feed(user_id, x_user_id, limit)


@router.get("/recommendations/home-feed")
async def get_home_feed_spec_alias(
    user_id: Optional[str] = Query(default=None),
    x_user_id: Optional[str] = Header(default=None),
    limit: int = Query(default=8),
) -> Dict[str, Any]:
    return await _handle_home_feed(user_id, x_user_id, limit)


# ─── Event Tracking Endpoints ────────────────────────────────────────────────


async def _handle_track_view(body: Dict[str, Any], x_user_id: Optional[str]) -> JSONResponse:
    product_id = body.get("productId")
    if not product_id:
        return JSONResponse(status_code=400, content={"success": False, "message": "productId is required"})

    user_id = body.get("userId") or x_user_id or "anonymous"
    category = body.get("category")
    await recommendation_engine_service.track_view(user_id, product_id, category)
    return JSONResponse(status_code=status.HTTP_202_ACCEPTED, content={"success": True, "message": "View event tracked"})


@router.post("/api/v1/recommendations/track/view")
async def track_view_event(
    body: Dict[str, Any],
    x_user_id: Optional[str] = Header(default=None),
) -> JSONResponse:
    return await _handle_track_view(body, x_user_id)


@router.post("/api/v1/recommendations/events")
async def track_view_legacy(
    body: Dict[str, Any],
    x_user_id: Optional[str] = Header(default=None),
) -> JSONResponse:
    return await _handle_track_view(body, x_user_id)


@router.post("/api/v1/recommendations/track/purchase")
async def track_purchase_event(
    body: Dict[str, Any],
    x_user_id: Optional[str] = Header(default=None),
) -> JSONResponse:
    product_id = body.get("productId")
    order_id = body.get("orderId")
    if not product_id or not order_id:
        return JSONResponse(
            status_code=400,
            content={"success": False, "message": "productId and orderId are required"},
        )

    user_id = body.get("userId") or x_user_id or "anonymous"
    await recommendation_engine_service.track_purchase(user_id, product_id, order_id)
    return JSONResponse(status_code=status.HTTP_202_ACCEPTED, content={"success": True, "message": "Purchase event tracked"})


@router.post("/api/v1/recommendations/track/clickstream")
async def track_clickstream_event(
    body: Dict[str, Any],
    x_user_id: Optional[str] = Header(default=None),
) -> JSONResponse:
    event_type = body.get("eventType")
    product_id = body.get("productId")
    category = body.get("category")
    user_id = body.get("userId") or x_user_id

    if not user_id or event_type not in CLICKSTREAM_EVENT_TYPES:
        return JSONResponse(
            status_code=400,
            content={
                "success": False,
                "message": "userId and a valid eventType (product_view, category_browse, add_to_cart, wishlist) are required",
            },
        )

    try:
        import time
        await get_stream_publisher().publish(
            STREAMS.CLICKSTREAM,
            {
                "userId": user_id,
                "eventType": event_type,
                "productId": product_id or "",
                "category": category or "",
                "timestamp": int(time.time() * 1000),
            },
        )
        return JSONResponse(
            status_code=status.HTTP_202_ACCEPTED,
            content={"success": True, "message": "Clickstream event published"},
        )
    except Exception as exc:
        return JSONResponse(status_code=500, content={"success": False, "message": str(exc)})


# ─── Verified Product & Seller Review Routes (Phase 9) ───────────────────────


@router.post("/api/v1/products/{product_id}/reviews")
async def create_product_review(
    product_id: str,
    body: Dict[str, Any],
    request: Request,
    x_user_id: Optional[str] = Header(default=None),
) -> JSONResponse:
    if not x_user_id:
        return JSONResponse(status_code=401, content={"success": False, "message": "Authentication required"})

    rating = body.get("rating")
    title = body.get("title")
    review_body = body.get("body")

    if not rating or not title or not review_body:
        return JSONResponse(
            status_code=400,
            content={"success": False, "message": "rating, title, and body are required"},
        )

    try:
        review = await review_service.create_product_review(
            CreateProductReviewInput(
                productId=product_id,
                sellerId=body.get("sellerId"),
                userId=x_user_id,
                userName=body.get("userName") or "Customer",
                rating=int(rating),
                title=title,
                body=review_body,
                userAccountCreatedAt=body.get("userAccountCreatedAt"),
                userIp=request.client.host if request.client else None,
            )
        )
        return JSONResponse(status_code=201, content={"success": True, "data": review.model_dump(by_alias=True)})
    except Exception as exc:
        st = getattr(exc, "status", 500)
        return JSONResponse(status_code=st, content={"success": False, "message": str(exc)})


@router.get("/api/v1/products/{product_id}/reviews")
async def get_product_reviews(
    product_id: str,
    include_flagged: bool = Query(default=False, alias="includeFlagged"),
) -> Dict[str, Any]:
    reviews = review_service.get_product_reviews(product_id, include_flagged)
    return {"success": True, "data": [r.model_dump(by_alias=True) for r in reviews]}


@router.post("/api/v1/sellers/{seller_id}/reviews")
async def create_seller_review(
    seller_id: str,
    body: Dict[str, Any],
    x_user_id: Optional[str] = Header(default=None),
) -> JSONResponse:
    if not x_user_id:
        return JSONResponse(status_code=401, content={"success": False, "message": "Authentication required"})

    overall_rating = body.get("overallRating")
    review_body = body.get("body")
    if not overall_rating or not review_body:
        return JSONResponse(
            status_code=400,
            content={"success": False, "message": "overallRating and body are required"},
        )

    comm = body.get("communicationRating") or overall_rating
    ship = body.get("shippingSpeedRating") or overall_rating
    item_acc = body.get("itemAccuracyRating") or overall_rating

    try:
        review = await review_service.create_seller_review(
            CreateSellerReviewInput(
                sellerId=seller_id,
                userId=x_user_id,
                userName=body.get("userName") or "Customer",
                communicationRating=int(comm),
                shippingSpeedRating=int(ship),
                itemAccuracyRating=int(item_acc),
                overallRating=int(overall_rating),
                body=review_body,
                userAccountCreatedAt=body.get("userAccountCreatedAt"),
            )
        )
        return JSONResponse(status_code=201, content={"success": True, "data": review.model_dump(by_alias=True)})
    except Exception as exc:
        st = getattr(exc, "status", 500)
        return JSONResponse(status_code=st, content={"success": False, "message": str(exc)})


@router.get("/api/v1/sellers/{seller_id}/reviews")
async def get_seller_reviews(seller_id: str) -> Dict[str, Any]:
    reviews = review_service.get_seller_reviews(seller_id)
    return {"success": True, "data": [r.model_dump(by_alias=True) for r in reviews]}


# ─── Seller 4-Factor Reputation Score ────────────────────────────────────────


@router.get("/api/v1/sellers/{seller_id}/reputation")
async def get_seller_reputation(seller_id: str) -> Dict[str, Any]:
    reputation = seller_reputation_service.get_reputation(seller_id)
    return {"success": True, "data": reputation.model_dump(by_alias=True)}


# ─── Admin Review Moderation & Seller Replies ────────────────────────────────


@router.get("/api/v1/admin/reviews/flagged")
async def list_flagged_reviews() -> Dict[str, Any]:
    flagged = review_service.get_flagged_reviews()
    return {
        "success": True,
        "data": {
            "productReviews": [r.model_dump(by_alias=True) for r in flagged["productReviews"]],
            "sellerReviews": [r.model_dump(by_alias=True) for r in flagged["sellerReviews"]],
        },
    }


@router.patch("/api/v1/admin/reviews/{review_id}/moderate")
async def moderate_review(review_id: str, body: Dict[str, Any]) -> JSONResponse:
    action = body.get("action")
    if not action or action not in ("approve", "reject"):
        return JSONResponse(
            status_code=400,
            content={"success": False, "message": 'Action must be "approve" or "reject"'},
        )

    try:
        updated = review_service.moderate_review(review_id, action)
        return JSONResponse(status_code=200, content={"success": True, "data": updated.model_dump(by_alias=True)})
    except Exception as exc:
        st = getattr(exc, "status", 500)
        return JSONResponse(status_code=st, content={"success": False, "message": str(exc)})


@router.post("/api/v1/seller/reviews/{review_id}/reply")
async def add_seller_reply(
    review_id: str,
    body: Dict[str, Any],
    x_user_id: Optional[str] = Header(default=None),
) -> JSONResponse:
    seller_id = x_user_id or body.get("sellerId")
    reply_body = body.get("replyBody")

    if not reply_body:
        return JSONResponse(status_code=400, content={"success": False, "message": "replyBody is required"})

    try:
        updated = review_service.add_seller_reply(review_id, str(seller_id), reply_body)
        return JSONResponse(status_code=200, content={"success": True, "data": updated.model_dump(by_alias=True)})
    except Exception as exc:
        st = getattr(exc, "status", 500)
        return JSONResponse(status_code=st, content={"success": False, "message": str(exc)})
