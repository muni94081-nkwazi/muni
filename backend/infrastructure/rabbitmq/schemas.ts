/**
 * MUNI Platform — RabbitMQ Typed Event Payloads
 * Payload shapes carried in EventEnvelope.payload for each key in ROUTING_KEYS.
 */

// ─── order.created ────────────────────────────────────────────────────────────

export interface OrderCreatedPayload {
  orderId:   string;
  userId:    string;
  // `variantId` identifies the row stock actually lives on — a product with
  // several variants has no single ProductVariant to decrement from
  // `productId` alone. `reservationId` names the hold taken during order
  // creation, so a consumer can settle exactly that hold rather than
  // re-deriving one. Both are optional: events published before order-service
  // carried them are still valid on the queue.
  items:     Array<{ productId: string; variantId?: string; quantity: number; reservationId?: string }>;
  subOrders: Array<{ subOrderId: string; sellerId: string; subtotal: number }>;
  total:     number;
  currency:  string;
  createdAt: string;
}

// ─── order.cancelled ──────────────────────────────────────────────────────────

export interface OrderCancelledPayload {
  orderId:     string;
  userId:      string;
  reason:      string;
  cancelledAt: string;
}

// ─── payment.completed ────────────────────────────────────────────────────────

// ─── order.failed ─────────────────────────────────────────────────────────────

export interface OrderFailedPayload {
  orderId:  string;
  userId:   string;
  /** Machine-readable cause, e.g. 'inventory_settlement_failed'. */
  reason:   string;
  /** Human-readable detail for support and the customer notification. */
  detail:   string;
  /** True when the customer's money was handed back as part of the failure. */
  refunded: boolean;
  failedAt: string;
}

export interface PaymentCompletedPayload {
  paymentId:             string;
  orderId:               string;
  amount:                number;
  currency:              string;
  provider:              string | null;
  providerTransactionId: string | null;
  paidAt:                string;
}

// ─── inventory.low_stock ──────────────────────────────────────────────────────

export interface InventoryLowStockPayload {
  variantId:      string;
  sku:            string;
  productId:      string;
  sellerId:       string | undefined;
  availableStock: number;
  threshold:      number;
}
