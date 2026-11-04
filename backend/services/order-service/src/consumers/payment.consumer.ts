import { logger } from '../utils/logger.js';
import {
  createRabbitMQConsumer,
  ROUTING_KEYS,
  type ManagedRabbitConsumer,
  type EventEnvelope,
  type PaymentCompletedPayload,
} from '../../../../shared/rabbitmq/index.js';
import { settlePaidOrder } from '../services/settlement.service.js';

// ─── payment.completed consumer ───────────────────────────────────────────────
//
// payment-service has published `payment.completed` all along and nothing
// listened. That was the missing half of the direct order path: `POST /orders`
// reserved stock and then never settled it, so the hold lapsed on its TTL and
// the stock silently returned to the shelf after the customer had paid.
//
// The saga path is unaffected — it deducts its own reservations as its final
// step, and `settlePaidOrder` skips orders it created (see `settlementPath`).
// Both paths raise this event, so that check is what keeps stock from being
// taken off the shelf twice.

const QUEUE = 'order-service.payment-events';

let consumer: ManagedRabbitConsumer | null = null;

async function onMessage(envelope: EventEnvelope, routingKey: string): Promise<void> {
  if (routingKey !== ROUTING_KEYS.PAYMENT_COMPLETED) return;

  const payload = envelope.payload as PaymentCompletedPayload;
  const { orderId, paymentId } = payload;

  if (!orderId) {
    logger.warn('payment.completed with no orderId — ignoring');
    return;
  }

  // `paymentId` doubles as the refund reference on the compensation path.
  const outcome = await settlePaidOrder(orderId, paymentId);

  switch (outcome.status) {
    case 'settled':
      logger.info(
        `[order-service:rabbitmq] order ${orderId} paid — settled ${outcome.deducted.length} line(s) of stock`,
      );
      return;

    case 'skipped':
      logger.info(`order ${orderId} needs no settlement (${outcome.reason})`);
      return;

    case 'failed':
      // Deliberately not rethrown. The compensation inside settlePaidOrder has
      // already run — money refunded, order marked failed, order.failed
      // emitted — so letting the consumer retry would re-attempt a deduction
      // against an order that is now closed, and eventually DLQ a message
      // whose work is done.
      logger.error('paid order could not be fulfilled', { detail: {
        orderId,
        reason: outcome.reason,
        refunded: outcome.refunded,
      } });
      return;
  }
}

export async function startPaymentConsumer(): Promise<void> {
  consumer = createRabbitMQConsumer({
    queue:       QUEUE,
    routingKeys: [ROUTING_KEYS.PAYMENT_COMPLETED],
    service:     'order-service',
    maxRetries:  3,
    onMessage,
  });
  await consumer.start();
}

export async function stopPaymentConsumer(): Promise<void> {
  await consumer?.stop();
  consumer = null;
}
