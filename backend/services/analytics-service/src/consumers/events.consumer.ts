import { KafkaConsumer } from '../../../../shared/kafka/consumer.js';
import {
  Topics,
  type OrderCreatedEvent,
  type OrderPaidEvent,
  type OrderShippedEvent,
  type OrderDeliveredEvent,
  type OrderCancelledEvent,
  type OrderEvent,
} from '../../../../shared/kafka/topics.js';

// ─── Analytics Service — Kafka Consumer ──────────────────────────────────────
//
// Subscribes to ALL order lifecycle events for real-time analytics aggregation.
// Uses a single consumer group so each event is processed exactly once.

interface AnalyticsEvent {
  topic:      string;
  orderId:    string;
  receivedAt: string;
  data:       OrderEvent;
}

export const eventLog: AnalyticsEvent[] = [];

// Running counters updated as events arrive
export const counters = {
  ordersCreated:   0,
  ordersPaid:      0,
  ordersShipped:   0,
  ordersDelivered: 0,
  ordersCancelled: 0,
  revenueTotal:    0,
};

let consumer: KafkaConsumer | null = null;

async function handleEvent(event: OrderEvent): Promise<void> {
  eventLog.push({ topic: event.topic, orderId: event.orderId, receivedAt: new Date().toISOString(), data: event });
  // Keep log bounded (last 10k events in memory)
  if (eventLog.length > 10_000) eventLog.shift();

  switch (event.topic) {
    case Topics.ORDER_CREATED:
      counters.ordersCreated++;
      console.log(`[analytics] ORDER_CREATED orderId=${event.orderId}`);
      break;
    case Topics.ORDER_PAID:
      counters.ordersPaid++;
      counters.revenueTotal += (event as OrderPaidEvent).amount;
      console.log(`[analytics] ORDER_PAID orderId=${event.orderId} amount=${(event as OrderPaidEvent).amount}`);
      break;
    case Topics.ORDER_SHIPPED:
      counters.ordersShipped++;
      break;
    case Topics.ORDER_DELIVERED:
      counters.ordersDelivered++;
      break;
    case Topics.ORDER_CANCELLED:
      counters.ordersCancelled++;
      break;
  }
}

export async function startEventsConsumer(): Promise<void> {
  consumer = new KafkaConsumer({
    groupId:     'analytics-service-events-group',
    serviceName: 'analytics-service',
  });

  // Subscribe to all order topics
  const topics: Array<Parameters<typeof consumer.subscribe>[0]> = [
    Topics.ORDER_CREATED,
    Topics.ORDER_PAID,
    Topics.ORDER_SHIPPED,
    Topics.ORDER_DELIVERED,
    Topics.ORDER_CANCELLED,
  ];

  for (const topic of topics) {
    await consumer.subscribe<OrderEvent>(topic, handleEvent);
  }

  console.log('[analytics-service] ✅ Events consumer started (all order topics)');
}

export async function stopEventsConsumer(): Promise<void> {
  await consumer?.disconnect();
}
