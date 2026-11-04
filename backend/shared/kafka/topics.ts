// ─── Kafka Topic Registry ─────────────────────────────────────────────────────
// Single source of truth for all Kafka topic names in the MUNI platform.
// Import from here, never hardcode topic strings.
//
// NOTE: For the full infrastructure-level registry with all 25+ topics,
// see backend/infrastructure/kafka/topics.ts
// This file keeps backward-compatibility for existing services.

export const Topics = {
  // ── Auth & Identity ──────────────────────────────────────────────────────
  AUTH_EVENTS:     'auth-events',
  SELLER_EVENTS:   'seller-events',

  // ── Order Lifecycle ──────────────────────────────────────────────────────
  ORDER_EVENTS:    'order-events',
  // Legacy aliases (kept for backward compat with existing consumers)
  ORDER_CREATED:   'order-events',
  ORDER_PAID:      'payment-events',   // ← payment.succeeded event
  ORDER_SHIPPED:   'order-events',     // ← order.shipped event
  ORDER_DELIVERED: 'order-events',
  ORDER_CANCELLED: 'order-events',

  // ── Commerce ─────────────────────────────────────────────────────────────
  PRODUCT_EVENTS:   'product-events',
  PAYMENT_EVENTS:   'payment-events',
  CART_EVENTS:      'cart-events',
  CHECKOUT_EVENTS:  'checkout-events',
  INVENTORY_EVENTS: 'inventory-events',
  SHIPPING_EVENTS:  'shipping-events',
  RETURN_EVENTS:    'return-events',
  DISPUTE_EVENTS:   'dispute-events',
  BUYER_PROTECTION_EVENTS: 'buyer-protection-events',

  // ── Platform ─────────────────────────────────────────────────────────────
  NOTIFICATION_EVENTS: 'notification-events',
  ANALYTICS_EVENTS:    'analytics-events',
  FRAUD_EVENTS:        'fraud-events',
  MARKETPLACE_EVENTS:  'marketplace-events',
  FULFILLMENT_EVENTS:  'fulfillment-events',
  DISCOUNT_EVENTS:     'discount-events',
  WISHLIST_EVENTS:     'wishlist-events',
  REVIEW_EVENTS:       'review-events',
  MEDIA_EVENTS:        'media-events',
  CURRENCY_EVENTS:     'currency-events',
  CHAT_EVENTS:         'chat-events',
  OFFER_EVENTS:        'offer-events',
  SUPPORT_EVENTS:      'support-events',

  // ── Infrastructure ────────────────────────────────────────────────────────
  DEAD_LETTER_QUEUE: 'dead-letter-queue',
} as const;

export type TopicName = typeof Topics[keyof typeof Topics];

// ─── Event Payload Types ──────────────────────────────────────────────────────
// Legacy types kept for backward compat. New types are in infrastructure/kafka/schemas.ts

export interface OrderCreatedEvent {
  topic:     typeof Topics.ORDER_CREATED;
  orderId:   string;
  userId:    string;
  items:     Array<{ productId: string; quantity: number; price: number }>;
  total:     number;
  currency:  string;
  createdAt: string;
}

export interface OrderPaidEvent {
  topic:     typeof Topics.ORDER_PAID;
  orderId:   string;
  userId:    string;
  paymentId: string;
  amount:    number;
  currency:  string;
  paidAt:    string;
}

export interface OrderShippedEvent {
  topic:          typeof Topics.ORDER_SHIPPED;
  orderId:        string;
  userId:         string;
  trackingNumber: string;
  carrier:        string;
  estimatedAt:    string;
  shippedAt:      string;
}

export interface OrderDeliveredEvent {
  topic:       typeof Topics.ORDER_DELIVERED;
  orderId:     string;
  userId:      string;
  sellerId:    string;
  amount:      number;
  deliveredAt: string;
}

export interface OrderCancelledEvent {
  topic:       typeof Topics.ORDER_CANCELLED;
  orderId:     string;
  userId:      string;
  reason:      string;
  cancelledAt: string;
}

export type OrderEvent =
  | OrderCreatedEvent
  | OrderPaidEvent
  | OrderShippedEvent
  | OrderDeliveredEvent
  | OrderCancelledEvent;
