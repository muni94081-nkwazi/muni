"""Item-to-item cosine similarity and market-basket association rule mining."""
from __future__ import annotations

import math
from typing import Dict, List, Set
from pydantic import BaseModel
from app.models.recommendation import AssociationRule
from app.store.event_store import purchase_events


class SimilarityScore(BaseModel):
    productId: str
    score: float


class ItemSimilarityService:
    """Computes cosine similarity and market basket association rules."""

    def _build_product_user_index(self) -> Dict[str, Set[str]]:
        index: Dict[str, Set[str]] = {}
        for p in purchase_events:
            if p.productId not in index:
                index[p.productId] = set()
            index[p.productId].add(p.userId)
        return index

    def _build_order_index(self) -> Dict[str, Set[str]]:
        index: Dict[str, Set[str]] = {}
        for p in purchase_events:
            if p.orderId not in index:
                index[p.orderId] = set()
            index[p.orderId].add(p.productId)
        return index

    def get_similar_products(self, product_id: str, limit: int = 6) -> List[SimilarityScore]:
        """
        Item-item cosine similarity: sim(i,j) = |U_i ∩ U_j| / sqrt(|U_i| * |U_j|)
        where U_x is the set of users who purchased product x.
        """
        index = self._build_product_user_index()
        target_users = index.get(product_id)
        if not target_users or len(target_users) == 0:
            return []

        scores: List[SimilarityScore] = []
        for pid, users in index.items():
            if pid == product_id:
                continue
            intersection = len(target_users.intersection(users))
            if intersection == 0:
                continue

            score = intersection / math.sqrt(len(target_users) * len(users))
            scores.append(SimilarityScore(productId=pid, score=round(score * 1000) / 1000))

        scores.sort(key=lambda x: x.score, reverse=True)
        return scores[:limit]

    def get_association_rules(self, product_id: str, top_n: int = 2) -> List[AssociationRule]:
        """
        Association rules for product_id -> other products co-purchased in the same order.
          support(A,B) = orders containing both / total orders
          confidence(A->B) = orders containing both / orders containing A
          lift(A->B) = confidence(A->B) / support(B)
        """
        order_index = self._build_order_index()
        total_orders = len(order_index)
        if total_orders == 0:
            return []

        orders_with_a = [items for items in order_index.values() if product_id in items]
        if len(orders_with_a) == 0:
            return []

        co_counts: Dict[str, int] = {}
        for items in orders_with_a:
            for pid in items:
                if pid == product_id:
                    continue
                co_counts[pid] = co_counts.get(pid, 0) + 1

        order_count_by_product: Dict[str, int] = {}
        for items in order_index.values():
            for pid in items:
                order_count_by_product[pid] = order_count_by_product.get(pid, 0) + 1

        rules: List[AssociationRule] = []
        for pid, co_occurrences in co_counts.items():
            confidence = co_occurrences / len(orders_with_a)
            support = co_occurrences / total_orders
            support_b = order_count_by_product.get(pid, 0) / total_orders
            lift = (confidence / support_b) if support_b > 0 else 0.0

            rules.append(
                AssociationRule(
                    productId=pid,
                    coOccurrences=co_occurrences,
                    support=support,
                    confidence=confidence,
                    lift=lift,
                )
            )

        rules.sort(key=lambda r: r.confidence, reverse=True)
        return rules[:top_n]


item_similarity_service = ItemSimilarityService()


def compute_bundle_discount_percent(avg_confidence: float) -> float:
    """
    Auto-calculate the bundle discount from how confidently the items are
    bought together:
      >= 0.6 -> 15%
      >= 0.3 -> 10%
      else -> 5%
    """
    if avg_confidence >= 0.6:
        return 15.0
    if avg_confidence >= 0.3:
        return 10.0
    return 5.0
