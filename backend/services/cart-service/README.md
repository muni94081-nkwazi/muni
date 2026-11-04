# Cart Service

Redis-based shopping cart split from order-service. Supports multi-seller carts, quantity management, coupon application.

## Ports
4017

## Storage
Redis with keys pattern: cart:{userId} — stored as JSON string, TTL 24 hours (86400 seconds).

## Kafka
- Topic: `cart-events` (Events: `cart.item_added`, `cart.item_removed`, `cart.cleared`, `cart.checkout_started`)
