import { Kafka, type Consumer } from 'kafkajs';
import env from '../config/env.js';
import logger from '../config/logger.js';
import { dispatch } from '../services/dispatch.service.js';

// ─── Order & payment events ─────────────────────────────────────────────────
//
// The same events this consumer always read; what changed is what happens
// next. Previously each case appended to an in-process Map. Now each is
// dispatched through the template + provider pipeline, so the buyer is
// actually told.
//
// Both topics are subscribed before a single run() call — kafkajs rejects a
// second run() on the same consumer instance.

const kafka = new Kafka({
  clientId: `${env.kafka.clientId}-order`,
  brokers: env.kafka.brokers,
  retry: { initialRetryTime: 300, retries: 5 },
});

const consumer: Consumer = kafka.consumer({ groupId: 'notification-service-order-group' });

interface OrderEnvelope {
  topic?: string;
  eventType?: string;
  orderId?: string;
  id?: string;
  subOrderId?: string;
  orderNumber?: string;
  userId?: string;
  sellerId?: string;
  status?: string;
  total?: number;
  amount?: number;
  currency?: string;
  trackingNumber?: string;
  reason?: string;
  data?: Record<string, unknown>;
}

/**
 * Producers on this platform disagree about envelope shape: order-service puts
 * the event name in `topic` with the fields at the root, while the older
 * publishers use `{ eventType, data }`. Normalising here keeps that
 * inconsistency out of the dispatch pipeline.
 */
function normalise(envelope: OrderEnvelope): { eventType: string; data: Record<string, unknown> } {
  const eventType = envelope.eventType ?? envelope.topic ?? '';
  const data = envelope.data ?? (envelope as unknown as Record<string, unknown>);
  return { eventType, data };
}

/** Maps sub-order transitions onto the buyer-facing events that have templates. */
const SUB_ORDER_STATUS_EVENTS: Record<string, string> = {
  picked_up: 'order.shipped',
  in_transit: 'order.shipped',
  out_for_delivery: 'order.out_for_delivery',
  delivered: 'order.delivered',
  cancelled: 'order.cancelled',
};

export async function startOrderConsumer(): Promise<void> {
  try {
    await consumer.connect();
    await consumer.subscribe({ topic: 'order-events', fromBeginning: false });
    await consumer.subscribe({ topic: 'payment-events', fromBeginning: false });

    await consumer.run({
      eachMessage: async ({ topic, message }) => {
        const raw = message.value?.toString();
        if (!raw) return;

        let envelope: OrderEnvelope;
        try {
          envelope = JSON.parse(raw) as OrderEnvelope;
        } catch {
          logger.warn('invalid JSON on order topic — dropping', { topic });
          return;
        }

        const { eventType, data } = normalise(envelope);
        const userId = (data.userId as string) ?? envelope.userId;
        const orderId = (data.orderId as string) ?? envelope.orderId ?? envelope.id;

        // A sub-order transition names a status rather than a buyer-facing
        // event; translate before dispatching.
        let resolvedEvent = eventType;
        if (eventType === 'order.sub_order_updated') {
          const status = (data.status as string) ?? envelope.status ?? '';
          const mapped = SUB_ORDER_STATUS_EVENTS[status];
          if (!mapped) return;
          resolvedEvent = mapped;
        }

        if (!userId) {
          // order.delivered carries sellerId but no userId (see order-service).
          // There is no recipient to notify from this event alone.
          logger.debug('order event without userId — no recipient to notify', {
            eventType: resolvedEvent,
            orderId,
          });
          return;
        }

        try {
          await dispatch({
            userId,
            eventType: resolvedEvent,
            data,
            // One notification per (event, order, recipient), however many
            // times the broker redelivers it.
            dedupeKey: orderId ? `${resolvedEvent}:${orderId}:${userId}` : undefined,
          });
        } catch (err) {
          // Rethrowing hands the message back to kafkajs, which retries it —
          // the right behaviour for a transient DB or provider failure.
          logger.error('failed to dispatch order notification', {
            eventType: resolvedEvent,
            orderId,
            error: (err as Error).message,
          });
          throw err;
        }
      },
    });

    logger.info('order/payment events consumer started');
  } catch (err) {
    logger.warn('failed to start order consumer — service will still boot', {
      error: (err as Error).message,
    });
  }
}

export async function stopOrderConsumer(): Promise<void> {
  await consumer.disconnect().catch(() => undefined);
}
