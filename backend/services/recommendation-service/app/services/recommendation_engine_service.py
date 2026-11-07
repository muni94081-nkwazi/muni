"""Core Recommendation Engine implementing 6 recommendation strategies."""
from __future__ import annotations

import time
from datetime import datetime, timezone
from typing import List
from app.models.recommendation import (
    RecommendationItem,
    BundleRecommendation,
    BundleItem,
    HomeFeedResponse,
    HomeFeedSection,
)
from app.cache.redis_cache import cache
from app.store.event_store import (
    PRODUCT_CATALOG,
    view_events,
    purchase_events,
    cart_add_events,
    record_view,
    record_purchase,
)
from app.services.similarity_service import item_similarity_service, compute_bundle_discount_percent
from app.services.affinity_service import user_affinity_service

CACHE_TTL_SEC = 60 * 60  # 1 hour


class RecommendationEngineService:
    async def track_view(self, user_id: str, product_id: str, category: str | None = None) -> None:
        record_view(user_id, product_id, category)
        await cache.del_key(
            f"recommendations:user:{user_id}:personalized",
            f"recommendations:home-feed:{user_id}",
        )

    async def track_purchase(self, user_id: str, product_id: str, order_id: str) -> None:
        record_purchase(user_id, product_id, order_id)
        await cache.del_key(
            f"recommendations:user:{user_id}:personalized",
            f"recommendations:home-feed:{user_id}",
        )

    # ─── Strategy 1: "Customers Also Viewed" ─────────────────────────────────────

    async def get_customers_also_viewed(self, product_id: str, limit: int = 6) -> List[RecommendationItem]:
        cache_key = f"recommendations:also-viewed:{product_id}"

        async def _loader() -> List[RecommendationItem]:
            users_who_viewed_target = {v.userId for v in view_events if v.productId == product_id}
            if not users_who_viewed_target:
                return await self.get_trending_now(limit)

            co_view_counts: dict[str, int] = {}
            for event in view_events:
                if event.userId in users_who_viewed_target and event.productId != product_id:
                    co_view_counts[event.productId] = co_view_counts.get(event.productId, 0) + 1

            sorted_views = sorted(co_view_counts.items(), key=lambda x: x[1], reverse=True)[:limit]
            if not sorted_views:
                return await self.get_trending_now(limit)

            max_count = sorted_views[0][1]
            items: List[RecommendationItem] = []
            for pid, count in sorted_views:
                meta = PRODUCT_CATALOG.get(pid, {})
                items.append(
                    RecommendationItem(
                        productId=pid,
                        score=round((count / max_count) * 100) / 100,
                        reason="also_viewed",
                        name=meta.get("name", f"Product {pid}"),
                        price=meta.get("price", 50000.0),
                        category=meta.get("category", "general"),
                        imageUrl=meta.get("imageUrl"),
                    )
                )
            return items

        return await cache.get_or_set(cache_key, CACHE_TTL_SEC, _loader)

    # ─── Strategy 2: "Customers Who Bought This Also Bought" ─────────────────────

    async def get_customers_also_bought(self, product_id: str, limit: int = 6) -> List[RecommendationItem]:
        cache_key = f"recommendations:also-bought:{product_id}"

        async def _loader() -> List[RecommendationItem]:
            similar = item_similarity_service.get_similar_products(product_id, limit)
            if not similar:
                return await self.get_trending_now(limit)

            items: List[RecommendationItem] = []
            for s in similar:
                meta = PRODUCT_CATALOG.get(s.productId, {})
                items.append(
                    RecommendationItem(
                        productId=s.productId,
                        score=s.score,
                        reason="also_bought",
                        name=meta.get("name", f"Product {s.productId}"),
                        price=meta.get("price", 50000.0),
                        category=meta.get("category", "general"),
                        imageUrl=meta.get("imageUrl"),
                    )
                )
            return items

        return await cache.get_or_set(cache_key, CACHE_TTL_SEC, _loader)

    # ─── Strategy 3: "Frequently Bought Together" ────────────────────────────────

    async def get_frequently_bought_together(self, product_id: str) -> BundleRecommendation:
        cache_key = f"recommendations:fbt:{product_id}"

        async def _loader() -> BundleRecommendation:
            rules = item_similarity_service.get_association_rules(product_id, 2)
            bundle_pids = [r.productId for r in rules] if rules else ["case-001", "charger-001"]

            primary_meta = PRODUCT_CATALOG.get(product_id, {"name": f"Product {product_id}", "price": 100000.0})
            bundle_items: List[BundleItem] = []
            for pid in bundle_pids:
                meta = PRODUCT_CATALOG.get(pid, {"name": f"Item {pid}", "price": 45000.0})
                bundle_items.append(
                    BundleItem(
                        productId=pid,
                        name=meta["name"],
                        price=meta["price"],
                        imageUrl=meta.get("imageUrl"),
                    )
                )

            original_total = primary_meta["price"] + sum(item.price for item in bundle_items)
            avg_conf = sum(r.confidence for r in rules) / len(rules) if rules else 0.0
            discount_pct = compute_bundle_discount_percent(avg_conf)
            discount_price = round(original_total * (1 - discount_pct / 100.0))
            savings = original_total - discount_price

            return BundleRecommendation(
                primaryProductId=product_id,
                bundleItems=bundle_items,
                originalTotalPrice=original_total,
                bundleDiscountPercent=discount_pct,
                bundleDiscountPrice=discount_price,
                savingsAmount=savings,
                reason=f"Buy this with these items and save {int(discount_pct)}%",
            )

        return await cache.get_or_set(cache_key, CACHE_TTL_SEC, _loader)

    # ─── Strategy 4: "Personalized For You" ──────────────────────────────────────

    async def get_personalized_for_user(self, user_id: str, limit: int = 10) -> List[RecommendationItem]:
        cache_key = f"recommendations:user:{user_id}:personalized"

        async def _loader() -> List[RecommendationItem]:
            now = int(time.time() * 1000)
            twenty_four_hours = 24 * 60 * 60 * 1000
            seven_days = 7 * 24 * 60 * 60 * 1000

            purchased_ids = {p.productId for p in purchase_events if p.userId == user_id}

            category_scores: dict[str, float] = {}
            product_scores: dict[str, float] = {}

            for view in [v for v in view_events if v.userId == user_id]:
                if view.productId in purchased_ids:
                    continue

                age_ms = now - view.timestamp
                weight = 0.5
                if age_ms < twenty_four_hours:
                    weight = 3.0
                elif age_ms < seven_days:
                    weight = 1.5

                if view.category:
                    category_scores[view.category] = category_scores.get(view.category, 0.0) + weight
                product_scores[view.productId] = product_scores.get(view.productId, 0.0) + weight

            affinity = await user_affinity_service.get_profile(user_id)
            for cat, score in affinity.categoryAffinity.items():
                category_scores[cat] = category_scores.get(cat, 0.0) + score
            for pid, score in affinity.productAffinity.items():
                product_scores[pid] = product_scores.get(pid, 0.0) + score

            top_cats = [cat for cat, _ in sorted(category_scores.items(), key=lambda x: x[1], reverse=True)]

            candidates: List[RecommendationItem] = []
            for pid, meta in PRODUCT_CATALOG.items():
                if pid in purchased_ids:
                    continue

                score = product_scores.get(pid, 0.2)
                if meta.get("category") in top_cats:
                    score += 1.5

                candidates.append(
                    RecommendationItem(
                        productId=pid,
                        score=min(1.0, round(score * 10) / 100),
                        reason="personalized",
                        name=meta["name"],
                        price=meta["price"],
                        category=meta.get("category"),
                        imageUrl=meta.get("imageUrl"),
                    )
                )

            candidates.sort(key=lambda x: x.score, reverse=True)
            return candidates[:limit]

        return await cache.get_or_set(cache_key, CACHE_TTL_SEC, _loader)

    # ─── Strategy 5: "Trending Now" ──────────────────────────────────────────────

    async def get_trending_now(self, limit: int = 10) -> List[RecommendationItem]:
        cache_key = "recommendations:trending"

        async def _loader() -> List[RecommendationItem]:
            now = int(time.time() * 1000)
            twenty_four_hours = 24 * 60 * 60 * 1000

            recent_views = [v for v in view_events if now - v.timestamp < twenty_four_hours]
            recent_purchases = [p for p in purchase_events if now - p.timestamp < twenty_four_hours]
            recent_cart_adds = [c for c in cart_add_events if now - c.timestamp < twenty_four_hours]

            view_counts: dict[str, int] = {}
            for v in recent_views:
                view_counts[v.productId] = view_counts.get(v.productId, 0) + 1

            purchase_counts: dict[str, int] = {}
            for p in recent_purchases:
                purchase_counts[p.productId] = purchase_counts.get(p.productId, 0) + 1

            cart_counts: dict[str, int] = {}
            for c in recent_cart_adds:
                cart_counts[c.productId] = cart_counts.get(c.productId, 0) + 1

            trending_list: List[RecommendationItem] = []
            for pid, meta in PRODUCT_CATALOG.items():
                views = view_counts.get(pid, 1)
                buys = purchase_counts.get(pid, 0)
                cart_adds = cart_counts.get(pid, 0)
                conversion_rate = buys / views
                velocity_score = views * 0.4 + cart_adds * 0.8 + conversion_rate * 10.0

                trending_list.append(
                    RecommendationItem(
                        productId=pid,
                        score=min(1.0, round(velocity_score * 10) / 100),
                        reason="trending",
                        name=meta.get("name", f"Product {pid}"),
                        price=meta.get("price", 50000.0),
                        category=meta.get("category", "electronics"),
                        imageUrl=meta.get("imageUrl"),
                    )
                )

            trending_list.sort(key=lambda x: x.score, reverse=True)
            return trending_list[:limit]

        return await cache.get_or_set(cache_key, CACHE_TTL_SEC, _loader)

    # ─── Strategy 6: Real-Time Home Feed ─────────────────────────────────────────

    async def get_home_feed(self, user_id: str, limit: int = 8) -> HomeFeedResponse:
        cache_key = f"recommendations:home-feed:{user_id}"

        async def _loader() -> HomeFeedResponse:
            sections: List[HomeFeedSection] = []
            affinity = await user_affinity_service.get_profile(user_id)

            if user_affinity_service.has_signal(affinity):
                top_cats = user_affinity_service.top_categories(affinity, 1)
                if top_cats:
                    top_category = top_cats[0]
                    purchased = {p.productId for p in purchase_events if p.userId == user_id}
                    category_items: List[RecommendationItem] = []
                    for pid, meta in PRODUCT_CATALOG.items():
                        if meta.get("category") == top_category and pid not in purchased:
                            score = min(
                                1.0,
                                round((affinity.productAffinity.get(pid, 0.2) * 10)) / 100,
                            )
                            category_items.append(
                                RecommendationItem(
                                    productId=pid,
                                    score=score,
                                    reason="personalized",
                                    name=meta["name"],
                                    price=meta["price"],
                                    category=meta.get("category"),
                                    imageUrl=meta.get("imageUrl"),
                                )
                            )

                    category_items.sort(key=lambda x: x.score, reverse=True)
                    if category_items:
                        sections.append(
                            HomeFeedSection(
                                key="because-you-browsed",
                                title=f"Because you browsed {top_category}",
                                reason="category_affinity",
                                items=category_items[:limit],
                            )
                        )

                personalized_items = await self.get_personalized_for_user(user_id, limit)
                sections.append(
                    HomeFeedSection(
                        key="picked-for-you",
                        title="Picked For You",
                        reason="personalized",
                        items=personalized_items,
                    )
                )

            trending_items = await self.get_trending_now(limit)
            sections.append(
                HomeFeedSection(
                    key="trending-now",
                    title="Trending Now",
                    reason="trending",
                    items=trending_items,
                )
            )

            now_iso = (
                datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.")
                + f"{datetime.now(timezone.utc).microsecond // 1000:03d}Z"
            )
            return HomeFeedResponse(userId=user_id, sections=sections, generatedAt=now_iso)

        return await cache.get_or_set(cache_key, CACHE_TTL_SEC, _loader)


recommendation_engine_service = RecommendationEngineService()
