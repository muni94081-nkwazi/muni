import { logger } from '../utils/logger.js';
/**
 * MUNI Platform — Inventory RabbitMQ Order Consumer
 *
 * Observes order.created / order.cancelled from order-service over the shared
 * RabbitMQ event bus, and exercises the idempotency + retry + DLQ middleware
 * in infrastructure/rabbitmq/consumer.ts.
 *
 * ── Why this handler does NOT move stock ─────────────────────────────────────
 *
 * checkout-service's saga owns the whole reservation lifecycle and does it
 * synchronously over HTTP against this service's Prisma-backed endpoints:
 *
 *   RESERVE_INVENTORY  POST /api/v1/inventory/:variantId/reserve   (+ release
 *                      pushed onto the saga's compensation stack)
 *   DEDUCT             POST /api/v1/inventory/:variantId/deduct
 *
 * By the time order.created reaches this queue the stock is already reserved
 * and, a step later, deducted. Reserving again here would double-count every
 * line on every order.
 *
 * It also could not do so correctly even if it were the right place to: stock
 * lives on ProductVariant, and OrderCreatedPayload carries only
 * `{ productId, quantity }`. A product with several variants has no single
 * row to decrement. Making an event-driven path viable means adding
 * `variantId` to the order line items order-service publishes — until then
 * the HTTP path is the only one that can be correct.
 */

import {
  createRabbitMQConsumer,
  ROUTING_KEYS,
  type ManagedRabbitConsumer,
  type EventEnvelope,
  type OrderCreatedPayload,
  type OrderCancelledPayload,
} from '../../../../shared/rabbitmq/index.js';

const QUEUE = 'inventory-service.order-events';

let consumer: ManagedRabbitConsumer | null = null;

async function onMessage(envelope: EventEnvelope, routingKey: string): Promise<void> {
  if (routingKey === ROUTING_KEYS.ORDER_CREATED) {
    const { orderId, items } = envelope.payload as OrderCreatedPayload;
    logger.info(
      `[inventory-service:rabbitmq] order ${orderId} created (${items.length} line(s)) — ` +
      'stock already reserved and deducted by the checkout saga; no action taken',
    );
    return;
  }

  if (routingKey === ROUTING_KEYS.ORDER_CANCELLED) {
    const { orderId } = envelope.payload as OrderCancelledPayload;
    // order.cancelled carries no line items, so there is nothing to address
    // even if releasing here were correct. Reservations that were never
    // settled fall away on their TTL via the expiry worker; stock already
    // deducted against a completed order is a restock, which belongs to the
    // return/refund flow rather than to cancellation.
    logger.info(`order ${orderId} cancelled — no stock action`);
    return;
  }
}

export async function startRabbitMQOrderConsumer(): Promise<void> {
  consumer = createRabbitMQConsumer({
    queue:       QUEUE,
    routingKeys: [ROUTING_KEYS.ORDER_CREATED, ROUTING_KEYS.ORDER_CANCELLED],
    service:     'inventory-service',
    maxRetries:  3,
    onMessage,
  });
  await consumer.start();
}

export async function stopRabbitMQOrderConsumer(): Promise<void> {
  await consumer?.stop();
  consumer = null;
}
