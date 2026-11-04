import { Kafka, type Consumer } from 'kafkajs';
import { reviewService } from '../services/review.service.js';

const kafka = new Kafka({
  clientId: 'recommendation-service',
  brokers:  (process.env.KAFKA_BROKERS ?? 'localhost:9092').split(','),
});

const consumer: Consumer = kafka.consumer({ groupId: 'recommendation-service-events-group' });

export async function startEventsConsumer(): Promise<void> {
  try {
    await consumer.connect();
    await consumer.subscribe({ topic: 'order-events', fromBeginning: false });

    await consumer.run({
      eachMessage: async ({ topic: _topic, message }) => {
        const raw = message.value?.toString();
        if (!raw) return;
        try {
          const envelope = JSON.parse(raw);
          const { eventType, userId, productId, sellerId, subOrders } = envelope;

          if (eventType === 'order.delivered' || envelope.topic === 'order.delivered') {
            if (userId) {
              if (productId) reviewService.recordDeliveredPurchase(userId, productId);
              if (sellerId) reviewService.recordDeliveredPurchase(userId, undefined, sellerId);
              if (subOrders && Array.isArray(subOrders)) {
                for (const so of subOrders) {
                  if (so.sellerId) reviewService.recordDeliveredPurchase(userId, undefined, so.sellerId);
                }
              }
            }
          }
        } catch (err) {
          console.warn('[recommendation-service] Error processing Kafka event:', (err as Error).message);
        }
      },
    });

    console.log('✅ Recommendation service Kafka consumer started');
  } catch (err) {
    console.warn('Failed to start Recommendation service Kafka consumer (non-fatal)', err);
  }
}

export async function stopEventsConsumer(): Promise<void> {
  await consumer.disconnect();
}
