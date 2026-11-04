import { Kafka, type Consumer } from 'kafkajs';
import winston from 'winston';

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.json(),
  transports: [new winston.transports.Console()]
});

const kafka = new Kafka({ 
  clientId: 'analytics-service-order', 
  brokers: (process.env.KAFKA_BROKERS ?? 'localhost:9092').split(',') 
});
const consumer: Consumer = kafka.consumer({ groupId: 'analytics-service-orders' });

const ordersByStatus: Map<string, number> = new Map();
const ordersByDay: Map<string, number> = new Map();
let totalOrdersCount: number = 0;
const recentOrders: any[] = [];

export function getOrderMetrics() {
  return {
    ordersByStatus: Object.fromEntries(ordersByStatus),
    ordersByDay: Object.fromEntries(ordersByDay),
    totalOrdersCount,
    recentOrders
  };
}

export async function startOrderConsumer(): Promise<void> {
  try {
    await consumer.connect();
    await consumer.subscribe({ topic: 'order-events', fromBeginning: false });
    await consumer.run({
      eachMessage: async ({ topic, message }) => {
        const raw = message.value?.toString();
        if (!raw) return;
        try {
          const envelope = JSON.parse(raw);
          const { eventType, data } = envelope;

          if (['order.created', 'order.confirmed', 'order.cancelled', 'order.delivered'].includes(eventType)) {
            const currentStatusCount = ordersByStatus.get(eventType) || 0;
            ordersByStatus.set(eventType, currentStatusCount + 1);

            if (eventType === 'order.created') {
              totalOrdersCount++;
              const dateStr = new Date().toISOString().split('T')[0];
              const currentDayCount = ordersByDay.get(dateStr) || 0;
              ordersByDay.set(dateStr, currentDayCount + 1);

              recentOrders.unshift({
                id: data.id || data.orderId,
                userId: data.userId,
                total: data.total,
                status: eventType,
                createdAt: new Date().toISOString()
              });
              if (recentOrders.length > 50) {
                recentOrders.pop();
              }
            } else {
               const id = data.id || data.orderId;
               const ro = recentOrders.find(o => o.id === id);
               if(ro) ro.status = eventType;
            }
          }
        } catch (err) {
          logger.error('Failed to process message', { topic, error: err });
        }
      },
    });
    logger.info('✅ Kafka order analytics consumer started');
  } catch (err) {
    logger.warn('Failed to start Kafka order analytics consumer.', { error: err });
  }
}

export async function stopOrderConsumer(): Promise<void> {
  await consumer.disconnect();
}
