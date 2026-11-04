/**
 * MUNI Platform — Kafka Topic Registry
 * Central source of truth for all Kafka topics and their event schemas.
 * Import from this file in any service producer/consumer.
 */

// ─── Topic Names ──────────────────────────────────────────────────────────────

export const TOPICS = {
  // Auth & Identity
  AUTH:        'auth-events',
  SELLER:      'seller-events',

  // Commerce
  PRODUCT:     'product-events',
  INVENTORY:   'inventory-events',
  CART:        'cart-events',
  CHECKOUT:    'checkout-events',
  ORDER:       'order-events',
  PAYMENT:     'payment-events',
  SHIPPING:    'shipping-events',
  RETURN:      'return-events',
  DISPUTE:     'dispute-events',
  FULFILLMENT: 'fulfillment-events',

  // Value-add
  DISCOUNT:    'discount-events',
  WISHLIST:    'wishlist-events',
  REVIEW:      'review-events',
  SEARCH:      'search-events',
  MEDIA:       'media-events',

  // Platform
  FRAUD:         'fraud-events',
  MARKETPLACE:   'marketplace-events',
  NOTIFICATION:  'notification-events',
  ANALYTICS:     'analytics-events',
  CURRENCY:      'currency-events',

  // Infrastructure
  DLQ: 'dead-letter-queue',
} as const;

export type KafkaTopic = typeof TOPICS[keyof typeof TOPICS];

// ─── Event Keys ───────────────────────────────────────────────────────────────

export const EVENTS = {
  // Auth
  USER_REGISTERED:         'user.registered',
  USER_PASSWORD_CHANGED:   'user.password_changed',

  // Seller
  SELLER_REGISTERED:       'seller.registered',
  SELLER_APPROVED:         'seller.approved',
  SELLER_REJECTED:         'seller.rejected',
  SELLER_SUSPENDED:        'seller.suspended',

  // Product
  PRODUCT_CREATED:         'product.created',
  PRODUCT_UPDATED:         'product.updated',
  PRODUCT_DELETED:         'product.deleted',
  PRODUCT_PRICE_UPDATED:   'product.price_updated',
  PRODUCT_VIEWED:          'product.viewed',

  // Inventory
  INVENTORY_RESERVED:      'inventory.reserved',
  INVENTORY_RELEASED:      'inventory.released',
  INVENTORY_DEPLETED:      'inventory.depleted',
  INVENTORY_RESTOCKED:     'inventory.restocked',
  STOCK_LOW:               'inventory.stock_low',

  // Cart
  CART_ITEM_ADDED:         'cart.item_added',
  CART_ITEM_REMOVED:       'cart.item_removed',
  CART_CLEARED:            'cart.cleared',
  CART_CHECKOUT_STARTED:   'cart.checkout_started',

  // Checkout
  CHECKOUT_INITIATED:      'checkout.initiated',
  CHECKOUT_COMPLETED:      'checkout.completed',
  CHECKOUT_FAILED:         'checkout.failed',
  CHECKOUT_ABANDONED:      'checkout.abandoned',

  // Order
  ORDER_CREATED:           'order.created',
  ORDER_CONFIRMED:         'order.confirmed',
  ORDER_PAYMENT_CONFIRMED: 'order.payment_confirmed',
  ORDER_PROCESSING:        'order.processing',
  ORDER_SHIPPED:           'order.shipped',
  ORDER_DELIVERED:         'order.delivered',
  ORDER_CANCELLED:         'order.cancelled',

  // Payment
  PAYMENT_INITIATED:       'payment.initiated',
  PAYMENT_SUCCEEDED:       'payment.succeeded',
  PAYMENT_FAILED:          'payment.failed',
  PAYMENT_REFUNDED:        'payment.refunded',
  REFUND_INITIATED:        'refund.initiated',

  // Shipping
  SHIPMENT_CREATED:        'shipment.created',
  SHIPMENT_DISPATCHED:     'shipment.dispatched',
  SHIPMENT_IN_TRANSIT:     'shipment.in_transit',
  SHIPMENT_DELIVERED:      'shipment.delivered',
  SHIPMENT_FAILED:         'shipment.failed',

  // Return
  RETURN_REQUESTED:        'return.requested',
  RETURN_APPROVED:         'return.approved',
  RETURN_REJECTED:         'return.rejected',
  RETURN_RECEIVED:         'return.item_received',
  RETURN_REFUNDED:         'return.refunded',

  // Dispute
  DISPUTE_OPENED:          'dispute.opened',
  DISPUTE_RESPONDED:       'dispute.seller_responded',
  DISPUTE_RESOLVED:        'dispute.resolved',
  DISPUTE_ESCALATED:       'dispute.escalated',

  // Fulfillment
  FULFILLMENT_CREATED:     'fulfillment.created',
  FULFILLMENT_UPDATED:     'fulfillment.status_updated',
  FULFILLMENT_COMPLETED:   'fulfillment.completed',
  FULFILLMENT_FAILED:      'fulfillment.failed',

  // Discount
  DISCOUNT_APPLIED:        'discount.applied',
  DISCOUNT_EXPIRED:        'discount.expired',

  // Wishlist
  WISHLIST_ITEM_ADDED:     'wishlist.item_added',
  WISHLIST_ITEM_REMOVED:   'wishlist.item_removed',
  WISHLIST_PRICE_DROP:     'wishlist.price_drop_alert',

  // Review
  REVIEW_CREATED:          'review.created',
  REVIEW_FLAGGED:          'review.flagged',
  REVIEW_APPROVED:         'review.approved',
  REVIEW_DELETED:          'review.deleted',

  // Media
  MEDIA_UPLOADED:          'media.uploaded',
  MEDIA_DELETED:           'media.deleted',

  // Fraud
  FRAUD_BLOCKED:           'fraud.blocked',
  FRAUD_FLAGGED:           'fraud.flagged_for_review',
  FRAUD_CLEARED:           'fraud.cleared',

  // Marketplace
  STORE_CREATED:           'marketplace.store_created',
  STORE_SUSPENDED:         'marketplace.store_suspended',

  // Notification
  NOTIFICATION_SEND:       'notification.send',
  EMAIL_SEND:              'notification.email_send',
  SMS_SEND:                'notification.sms_send',
  PUSH_SEND:               'notification.push_send',

  // Analytics
  EVENT_TRACKED:           'analytics.event_tracked',
  REVENUE_RECORDED:        'analytics.revenue_recorded',

  // Currency
  RATES_UPDATED:           'currency.rates_updated',
} as const;

export type KafkaEventKey = typeof EVENTS[keyof typeof EVENTS];
