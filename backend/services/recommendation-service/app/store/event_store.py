"""In-memory interaction store and seed data for recommendations."""
from __future__ import annotations

import time
import uuid
from typing import Dict, List, Optional
from pydantic import BaseModel
from app.models.recommendation import ProductViewEvent, ProductPurchaseEvent


class CartAddEvent(BaseModel):
    id: str
    userId: str
    productId: str
    timestamp: int


PRODUCT_CATALOG: Dict[str, Dict[str, any]] = {
    "phone-001": {
        "name": "Samsung Galaxy S24 Ultra",
        "price": 4200000.0,
        "category": "electronics",
        "imageUrl": "https://images.unsplash.com/photo-1610945265064-0e34e5519bbf",
    },
    "phone-002": {
        "name": "iPhone 15 Pro Max",
        "price": 4800000.0,
        "category": "electronics",
        "imageUrl": "https://images.unsplash.com/photo-1592750475338-74b7b21085ab",
    },
    "case-001": {
        "name": "Silicone Protective Case",
        "price": 45000.0,
        "category": "electronics",
        "imageUrl": "https://images.unsplash.com/photo-1601784551446-20c9e07cdbdb",
    },
    "charger-001": {
        "name": "45W Fast Wall Charger",
        "price": 85000.0,
        "category": "electronics",
        "imageUrl": "https://images.unsplash.com/photo-1583863788434-e58a36330cf0",
    },
    "buds-001": {
        "name": "Wireless Earbuds Pro",
        "price": 350000.0,
        "category": "electronics",
        "imageUrl": "https://images.unsplash.com/photo-1590658268037-6bf12165a8df",
    },
    "food-001": {
        "name": "Organic Coffee Beans 1kg",
        "price": 45000.0,
        "category": "groceries",
        "imageUrl": "https://images.unsplash.com/photo-1559056199-641a0ac8b55e",
    },
    "food-002": {
        "name": "Pure Bee Honey 500g",
        "price": 25000.0,
        "category": "groceries",
        "imageUrl": "https://images.unsplash.com/photo-1587049352847-4a222e784d38",
    },
    "fashion-001": {
        "name": "Cotton Crewneck T-Shirt",
        "price": 35000.0,
        "category": "fashion",
        "imageUrl": "https://images.unsplash.com/photo-1521572267360-ee0c2909d518",
    },
}

view_events: List[ProductViewEvent] = []
purchase_events: List[ProductPurchaseEvent] = []
cart_add_events: List[CartAddEvent] = []


def record_view(user_id: str, product_id: str, category: Optional[str] = None, timestamp: Optional[int] = None) -> None:
    ts = timestamp if timestamp is not None else int(time.time() * 1000)
    view_events.append(
        ProductViewEvent(
            id=str(uuid.uuid4()),
            userId=user_id,
            productId=product_id,
            category=category,
            timestamp=ts,
        )
    )


def record_purchase(user_id: str, product_id: str, order_id: str, timestamp: Optional[int] = None) -> None:
    ts = timestamp if timestamp is not None else int(time.time() * 1000)
    purchase_events.append(
        ProductPurchaseEvent(
            id=str(uuid.uuid4()),
            userId=user_id,
            productId=product_id,
            orderId=order_id,
            timestamp=ts,
        )
    )


def record_cart_add(user_id: str, product_id: str, timestamp: Optional[int] = None) -> None:
    ts = timestamp if timestamp is not None else int(time.time() * 1000)
    cart_add_events.append(
        CartAddEvent(
            id=str(uuid.uuid4()),
            userId=user_id,
            productId=product_id,
            timestamp=ts,
        )
    )


def seed_historical_data() -> None:
    view_events.clear()
    purchase_events.clear()
    cart_add_events.clear()

    now = int(time.time() * 1000)
    one_hour = 60 * 60 * 1000

    # Users co-viewing phone-001 with case-001, charger-001, buds-001
    users = ["user-101", "user-102", "user-103", "user-104", "user-105"]
    for u in users:
        record_view(u, "phone-001", "electronics", now - 30 * 60 * 1000)
        record_view(u, "case-001", "electronics", now - 25 * 60 * 1000)
        record_view(u, "charger-001", "electronics", now - 20 * 60 * 1000)

    # Users co-purchasing phone-001 with case-001 and charger-001
    for i in range(4):
        order_id = f"ord-seed-{i}"
        record_purchase(users[i], "phone-001", order_id, now - 2 * one_hour)
        record_purchase(users[i], "case-001", order_id, now - 2 * one_hour)
        record_purchase(users[i], "charger-001", order_id, now - 2 * one_hour)

    # Recent cart adds — feeds trending velocity
    record_cart_add("user-101", "buds-001", now - 15 * 60 * 1000)
    record_cart_add("user-102", "buds-001", now - 10 * 60 * 1000)

    # Recent views for user-123
    record_view("user-123", "phone-001", "electronics", now - 10 * 60 * 1000)  # 10 min ago (< 24h)
    record_view("user-123", "food-001", "groceries", now - 3 * 24 * one_hour)  # 3 days ago
    record_purchase("user-123", "food-001", "ord-prev-1", now - 2 * 24 * one_hour)  # Already bought food-001


# Seed on load
seed_historical_data()
