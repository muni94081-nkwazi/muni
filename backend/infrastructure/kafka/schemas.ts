/**
 * MUNI Platform — Kafka Typed Event Schemas
 * All event payloads are typed here. Services should import and use these types.
 */

import type { EVENTS } from './topics.js';

// ─── Base Event Envelope ──────────────────────────────────────────────────────

export interface KafkaEventEnvelope<T = unknown> {
  eventId:    string;   // UUID
  eventType:  string;   // e.g. 'order.created'
  service:    string;   // originating service
  version:    string;   // '1.0'
  occurredAt: string;   // ISO 8601
  data:       T;
}

// ─── Auth Events ──────────────────────────────────────────────────────────────

export interface UserRegisteredEvent {
  userId:    string;
  email:     string;
  firstName: string;
  lastName:  string;
  roles:     string[];
}

export interface SellerApprovedEvent {
  sellerId:    string;
  userId:      string;
  storeName:   string;
  email:       string;
  adminId:     string;
  approvedAt:  string;
}

export interface SellerRejectedEvent {
  sellerId:   string;
  userId:     string;
  email:      string;
  reason:     string;
  adminId:    string;
  rejectedAt: string;
}

// ─── Product Events ───────────────────────────────────────────────────────────

export interface ProductCreatedEvent {
  productId:  string;
  sellerId:   string;
  name:       string;
  price:      number;
  currency:   string;
  categoryId: string;
  stock:      number;
}

export interface ProductPriceUpdatedEvent {
  productId: string;
  sellerId:  string;
  oldPrice:  number;
  newPrice:  number;
  currency:  string;
}

export interface ProductViewedEvent {
  productId: string;
  userId?:   string;
  sessionId: string;
  source:    string; // 'search'|'category'|'direct'|'recommendation'
}

// ─── Inventory Events ─────────────────────────────────────────────────────────

export interface InventoryReservedEvent {
  reservationId: string;
  orderId:       string;
  userId:        string;
  items:         Array<{ productId: string; variantId?: string; quantity: number }>;
  expiresAt:     string;
}

export interface InventoryReleasedEvent {
  reservationId: string;
  orderId:       string;
  reason:        'checkout_completed' | 'checkout_expired' | 'order_cancelled';
}

export interface StockLowEvent {
  productId:  string;
  variantId?: string;
  sellerId:   string;
  remaining:  number;
  threshold:  number;
}

// ─── Cart Events ──────────────────────────────────────────────────────────────

export interface CartItemAddedEvent {
  userId:     string;
  productId:  string;
  sellerId:   string;
  quantity:   number;
  price:      number;
}

export interface CartCheckoutStartedEvent {
  userId:     string;
  itemCount:  number;
  cartValue:  number;
  currency:   string;
}

// ─── Order Events ─────────────────────────────────────────────────────────────

export interface OrderCreatedEvent {
  orderId:    string;
  userId:     string;
  subOrders:  Array<{ subOrderId: string; sellerId: string; subtotal: number }>;
  total:      number;
  currency:   string;
  createdAt:  string;
}

export interface OrderStatusUpdatedEvent {
  orderId:    string;
  userId:     string;
  oldStatus:  string;
  newStatus:  string;
  updatedAt:  string;
}

// ─── Payment Events ───────────────────────────────────────────────────────────

export interface PaymentInitiatedEvent {
  paymentId:       string;
  orderId:         string;
  userId:          string;
  amount:          number;
  currency:        string;
  paymentMethod:   string;
  billingAddress?: Record<string, string>;
  ipAddress?:      string;
}

export interface PaymentSucceededEvent {
  paymentId:        string;
  orderId:          string;
  userId:           string;
  amount:           number;
  currency:         string;
  transactionId:    string;
  sellerId:         string;
  platformFee:      number;
  sellerPayout:     number;
}

export interface PaymentFailedEvent {
  paymentId:    string;
  orderId:      string;
  userId:       string;
  amount:       number;
  currency:     string;
  failureCode:  string;
  failureMsg:   string;
}

export interface RefundInitiatedEvent {
  refundId:       string;
  orderId:        string;
  userId:         string;
  amount:         number;
  currency:       string;
  reason:         string;
  initiatedBy:    'buyer' | 'seller' | 'admin' | 'system';
}

// ─── Shipping Events ──────────────────────────────────────────────────────────

export interface ShipmentCreatedEvent {
  shipmentId:       string;
  orderId:          string;
  sellerId:         string;
  carrier:          string;
  trackingNumber:   string;
  estimatedDelivery: string;
}

// ─── Fraud Events ─────────────────────────────────────────────────────────────

export interface FraudScoredEvent {
  orderId:        string;
  userId:         string;
  score:          number;
  decision:       'ALLOW' | 'REVIEW' | 'BLOCK';
  triggeredRules: string[];
}

// ─── Notification Events ──────────────────────────────────────────────────────

export interface NotificationSendEvent {
  userId:    string;
  type:      string;
  title:     string;
  body:      string;
  channels:  Array<'email' | 'sms' | 'push' | 'in_app'>;
  data?:     Record<string, unknown>;
}

// ─── Analytics Events ─────────────────────────────────────────────────────────

export interface AnalyticsEventTracked {
  eventName:  string;
  userId?:    string;
  sessionId:  string;
  properties: Record<string, unknown>;
  timestamp:  string;
}

// ─── Helper: create standard event envelope ───────────────────────────────────

import { randomUUID } from 'node:crypto';

export function createEvent<T>(
  eventType: string,
  service:   string,
  data:      T,
): KafkaEventEnvelope<T> {
  return {
    eventId:    randomUUID(),
    eventType,
    service,
    version:    '1.0',
    occurredAt: new Date().toISOString(),
    data,
  };
}

// ─── Helper: publish event via shared producer ────────────────────────────────

import type { Producer } from 'kafkajs';

export async function publishEvent<T>(
  producer:  Producer,
  topic:     string,
  eventType: string,
  service:   string,
  data:      T,
  key?:      string,
): Promise<void> {
  const envelope = createEvent(eventType, service, data);
  await producer.send({
    topic,
    messages: [{
      key:   key ?? envelope.eventId,
      value: JSON.stringify(envelope),
      headers: { eventType, service, version: '1.0' },
    }],
  });
}
