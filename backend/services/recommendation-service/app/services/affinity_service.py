"""Real-time user affinity profile building with exponential recency decay."""
from __future__ import annotations

import math
import time
from datetime import datetime, timezone
from typing import Dict, List, Optional
from app.models.recommendation import ClickstreamEvent, ClickstreamEventType, UserAffinityProfile
from app.cache.redis_cache import cache

EVENT_WEIGHTS: Dict[ClickstreamEventType, float] = {
    "add_to_cart": 4.0,
    "wishlist": 2.5,
    "product_view": 1.0,
    "category_browse": 0.5,
}

HALF_LIFE_HOURS = 6.0  # score halves every 6 hours
PROFILE_TTL_SEC = 7 * 24 * 60 * 60  # 7 days


def _decay(state: Dict[str, any], now: int) -> None:
    updated_at = state.get("updatedAt", now)
    elapsed_hours = (now - updated_at) / (1000.0 * 60.0 * 60.0)
    if elapsed_hours <= 0:
        return

    factor = math.pow(0.5, elapsed_hours / HALF_LIFE_HOURS)
    for cat in list(state["categoryScores"].keys()):
        state["categoryScores"][cat] *= factor
    for pid in list(state["productScores"].keys()):
        state["productScores"][pid] *= factor


def _empty_state(now: int) -> Dict[str, any]:
    return {"categoryScores": {}, "productScores": {}, "updatedAt": now}


class UserAffinityService:
    """Manages dynamic per-user preference profiles."""

    def __init__(self):
        self._profiles: Dict[str, Dict[str, any]] = {}

    def _profile_key(self, user_id: str) -> str:
        return f"affinity:user:{user_id}"

    async def _load_state(self, user_id: str) -> Dict[str, any]:
        state = self._profiles.get(user_id)
        if state is not None:
            return state

        cached = await cache.get(self._profile_key(user_id))
        if cached is not None and isinstance(cached, dict):
            state = cached
        else:
            state = _empty_state(int(time.time() * 1000))

        self._profiles[user_id] = state
        return state

    async def record_event(self, event: ClickstreamEvent | Dict[str, any]) -> None:
        if isinstance(event, dict):
            user_id = event["userId"]
            event_type = event["eventType"]
            category = event.get("category")
            product_id = event.get("productId")
            raw_ts = event.get("timestamp")
        else:
            user_id = event.userId
            event_type = event.eventType
            category = event.category
            product_id = event.productId
            raw_ts = event.timestamp

        now = raw_ts if raw_ts else int(time.time() * 1000)
        state = await self._load_state(user_id)
        _decay(state, now)

        weight = EVENT_WEIGHTS.get(event_type, 1.0)
        if category:
            state["categoryScores"][category] = state["categoryScores"].get(category, 0.0) + weight
        if product_id:
            state["productScores"][product_id] = state["productScores"].get(product_id, 0.0) + weight

        state["updatedAt"] = now

        await cache.set(self._profile_key(user_id), state, PROFILE_TTL_SEC)
        await cache.del_key(
            f"recommendations:home-feed:{user_id}",
            f"recommendations:user:{user_id}:personalized",
        )

    async def get_profile(self, user_id: str) -> UserAffinityProfile:
        state = await self._load_state(user_id)
        now = int(time.time() * 1000)
        _decay(state, now)

        updated_dt = datetime.fromtimestamp(state["updatedAt"] / 1000.0, timezone.utc)
        iso_str = updated_dt.strftime("%Y-%m-%dT%H:%M:%S.") + f"{updated_dt.microsecond // 1000:03d}Z"

        return UserAffinityProfile(
            userId=user_id,
            categoryAffinity=dict(state["categoryScores"]),
            productAffinity=dict(state["productScores"]),
            updatedAt=iso_str,
        )

    def has_signal(self, profile: UserAffinityProfile) -> bool:
        return len(profile.categoryAffinity) > 0 or len(profile.productAffinity) > 0

    def top_categories(self, profile: UserAffinityProfile, n: int = 3) -> List[str]:
        sorted_cats = sorted(profile.categoryAffinity.items(), key=lambda x: x[1], reverse=True)
        return [cat for cat, _score in sorted_cats[:n]]

    def reset_for_tests(self) -> None:
        self._profiles.clear()


user_affinity_service = UserAffinityService()
