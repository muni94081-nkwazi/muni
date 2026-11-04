import { KafkaConsumer } from '../../../../shared/kafka/consumer.js';
import { Topics } from '../../../../shared/kafka/topics.js';
import env from '../config/env.js';
import logger from '../config/logger.js';
import { recordOrdered, recordDelivered, recordCancelled } from '../services/purchase.service.js';

// ─── Purchase projection consumer ───────────────────────────────────────────
//
// Builds the local record of who bought what, which is what makes the
// verified-purchase check a local lookup instead of a call into order-service
// on every review submission.
//
// Every order lifecycle event shares the single `order-events` topic (see
// shared/kafka/topics.ts), and KafkaConsumer#subscribe starts the run loop, so
// this subscribes once and dispatches on the envelope's topic/eventType field.

interface OrderLine {
  productId: string;
  variantId?: string;
  sellerId?: string;
  vendorId?: string;
  quantity?: number;
}

interface OrderSubOrder {
  subOrderId?: string;
  id?: string;
  sellerId: string;
}

interface OrderEnvelope {
  topic?: string;
  eventType?: string;
  orderId?: string;
  id?: string;
  userId?: string;
  items?: OrderLine[];
  subOrders?: OrderSubOrder[];
  subOrderId?: string;
  sellerId?: string;
  deliveredAt?: string;
  createdAt?: string;
  status?: string;
}

let consumer: KafkaConsumer | null = null;

/** order.created carries the only copy of userId + line items we ever see. */
async function handleCreated(event: OrderEnvelope): Promise<void> {
  const orderId = event.orderId ?? event.id;
  if (!orderId || !event.userId || !event.items?.length) {
    logger.warn('order.created missing fields needed for the purchase projection', { orderId });
    return;
  }

  // Map productId → sub-order via the seller, so a later per-sub-order
  // delivery event can promote exactly the right lines.
  const sellerToSubOrder = new Map<string, string>();
  for (const sub of event.subOrders ?? []) {
    const subId = sub.subOrderId ?? sub.id;
    if (sub.sellerId && subId) sellerToSubOrder.set(sub.sellerId, subId);
  }

  for (const item of event.items) {
    const sellerId = item.sellerId ?? item.vendorId ?? null;
    await recordOrdered({
      userId: event.userId,
      productId: item.productId,
      variantId: item.variantId ?? null,
      orderId,
      subOrderId: sellerId ? (sellerToSubOrder.get(sellerId) ?? null) : null,
      sellerId,
      quantity: item.quantity ?? 1,
      orderedAt: event.createdAt,
    });
  }

  logger.debug('purchase projection updated from order.created', {
    orderId,
    lines: event.items.length,
  });
}

async function handleDelivered(event: OrderEnvelope): Promise<void> {
  const orderId = event.orderId ?? event.id;
  if (!orderId) return;

  const promoted = await recordDelivered({
    orderId,
    subOrderId: event.subOrderId ?? null,
    sellerId: event.sellerId ?? null,
    deliveredAt: event.deliveredAt,
  });

  logger.debug('purchase projection promoted to DELIVERED', { orderId, promoted });
}

async function handleCancelled(event: OrderEnvelope): Promise<void> {
  const orderId = event.orderId ?? event.id;
  if (!orderId) return;
  await recordCancelled(orderId, event.subOrderId ?? null);
}

export async function startOrderConsumer(): Promise<void> {
  try {
    consumer = new KafkaConsumer({
      groupId: env.kafka.groupId,
      serviceName: 'review-service',
    });

    await consumer.subscribe<OrderEnvelope>(Topics.ORDER_EVENTS, async (event) => {
      // Publishers set either `topic` (order-service's own envelope field) or
      // `eventType`; accept both rather than depending on one producer's shape.
      const kind = event.eventType ?? event.topic ?? '';

      switch (kind) {
        case 'order.created':
          await handleCreated(event);
          break;
        case 'order.delivered':
          await handleDelivered(event);
          break;
        case 'order.sub_order_updated':
          // Sub-order transitions carry the status; only delivery matters here.
          if (event.status === 'delivered') await handleDelivered(event);
          break;
        case 'order.cancelled':
          await handleCancelled(event);
          break;
        default:
          break;
      }
    });

    logger.info('order-events consumer started');
  } catch (err) {
    // Non-fatal: without the projection the verified-purchase check falls back
    // to querying order-service directly, which is slower but still correct.
    logger.warn('failed to start order-events consumer; falling back to synchronous lookups', {
      error: (err as Error).message,
    });
  }
}

export async function stopOrderConsumer(): Promise<void> {
  await consumer?.disconnect();
  consumer = null;
}
