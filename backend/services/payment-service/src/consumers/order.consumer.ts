import { Kafka, type Consumer, type Producer } from 'kafkajs';
import winston from 'winston';
import { paymentSplitService } from '../services/split.service.js';

const logger = winston.createLogger({
  level:     process.env.LOG_LEVEL ?? 'info',
  format:    winston.format.combine(winston.format.timestamp(), winston.format.json()),
  transports: [new winston.transports.Console()],
});

// The payment intent store that used to live here is now
// src/repositories/payment.repository.ts, backed by Postgres. A Kafka consumer
// module was never the right owner for the service's primary datastore.

const kafka = new Kafka({
  clientId: 'payment-service',
  brokers:  (process.env.KAFKA_BROKERS ?? 'localhost:9092').split(','),
});

const consumer: Consumer = kafka.consumer({ groupId: 'payment-service-order-group' });
const producer: Producer = kafka.producer();

export async function startOrderConsumer(): Promise<void> {
  try {
    await producer.connect();
    await consumer.connect();
    await consumer.subscribe({ topic: 'order-events', fromBeginning: false });

    await consumer.run({
      eachMessage: async ({ topic, message }) => {
        const raw = message.value?.toString();
        if (!raw) return;
        await handleOrderMessage(topic, raw);
      },
    });

    logger.info('✅ Payment service Kafka consumer started');
  } catch (err) {
    logger.warn('Failed to start Payment service Kafka consumer (non-fatal)', { error: err });
  }
}

/**
 * Handle one order-events message.
 *
 * Exported, and deliberately so. This logic used to be an anonymous closure
 * inside `consumer.run`, which meant the only way to exercise it was to stand
 * up Kafka — so nothing did. The delivery check it contained could never match
 * a real message, and no test could see that, because every test called
 * `releaseSubOrderVendorFunds` directly with ids it had seeded itself.
 */
export async function handleOrderMessage(topic: string, raw: string): Promise<void> {
  try {
    const envelope = JSON.parse(raw);
    const { eventType, data, subOrderId, sellerId } = envelope;

    // What order-service actually publishes, versus what this used to look for:
    //
    //   • it sets `topic`, never `eventType`, so `eventType` was always undefined;
    //   • `topic` in this scope is the KAFKA topic from eachMessage, and
    //     Topics.ORDER_DELIVERED resolves to `order-events` — the same string
    //     every other order event uses.
    //
    // So `eventType === 'order.delivered' || topic === 'order.delivered'` could
    // never be true, and vendor funds were never released. The check now matches
    // the messages really on the wire: a delivery either announces itself with
    // `deliveredAt`, or is a sub-order update whose new status is `delivered`.
    const envelopeTopic = String(envelope.topic ?? '');
    const isDelivery =
      eventType === 'order.delivered' ||
      envelopeTopic === 'order.delivered' ||
      Boolean(envelope.deliveredAt ?? data?.deliveredAt) ||
      (envelopeTopic === 'order.sub_order_updated' && envelope.status === 'delivered');

    if (!isDelivery) return;

    // `data?.orderId` is deliberately NOT a fallback. A master order id matches
    // no ledger row, and silently releasing nothing is what hid this defect.
    const targetSubOrderId = subOrderId || data?.subOrderId;
    const targetSellerId   = sellerId   || data?.sellerId;
    if (!targetSubOrderId || !targetSellerId) return;

    const balance = await paymentSplitService.releaseSubOrderVendorFunds(
      targetSubOrderId,
      targetSellerId,
    );

    // A miss is not nothing. It means a delivered sub-order has no ledger row
    // awaiting release — the money is somewhere else, or was never linked — and
    // it has to be visible rather than logged as a success with an undefined
    // balance, which is how this went unnoticed.
    if (balance) {
      logger.info(`[payment-service] 💰 Released vendor funds for sub-order ${targetSubOrderId} to seller ${targetSellerId}`, {
        availableBalance: balance.availableBalance,
      });
    } else {
      logger.warn('[payment-service] delivered sub-order had no pending ledger entry — vendor not credited', {
        subOrderId: targetSubOrderId,
        sellerId:   targetSellerId,
      });
    }
  } catch (err) {
    logger.error('Failed to process message in payment-service consumer', { topic, error: err });
  }
}

export async function stopOrderConsumer(): Promise<void> {
  await consumer.disconnect();
  await producer.disconnect();
}
