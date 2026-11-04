import { Kafka, type Consumer } from 'kafkajs';
import winston from 'winston';

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.json(),
  transports: [new winston.transports.Console()]
});

const kafka = new Kafka({ 
  clientId: 'analytics-service-payment', 
  brokers: (process.env.KAFKA_BROKERS ?? 'localhost:9092').split(',') 
});
const consumer: Consumer = kafka.consumer({ groupId: 'analytics-service-payments' });

let revenueTotal = 0;
const revenueByDay: Map<string, number> = new Map();
let refundTotal = 0;
const paymentsByMethod: Map<string, number> = new Map();
let failedPaymentCount = 0;

export function getRevenueMetrics() {
  return {
    revenueTotal,
    revenueByDay: Object.fromEntries(revenueByDay),
    refundTotal,
    paymentsByMethod: Object.fromEntries(paymentsByMethod),
    failedPaymentCount
  };
}

export async function startPaymentConsumer(): Promise<void> {
  try {
    await consumer.connect();
    await consumer.subscribe({ topic: 'payment-events', fromBeginning: false });
    await consumer.run({
      eachMessage: async ({ topic, message }) => {
        const raw = message.value?.toString();
        if (!raw) return;
        try {
          const envelope = JSON.parse(raw);
          const { eventType, data } = envelope;

          if (eventType === 'payment.succeeded') {
            const amount = data.amount || 0;
            revenueTotal += amount;
            
            const dateStr = new Date().toISOString().split('T')[0];
            const currentDayRev = revenueByDay.get(dateStr) || 0;
            revenueByDay.set(dateStr, currentDayRev + amount);
            
            const method = data.method || 'unknown';
            const methodCount = paymentsByMethod.get(method) || 0;
            paymentsByMethod.set(method, methodCount + 1);
          } else if (eventType === 'payment.failed') {
            failedPaymentCount++;
          } else if (eventType === 'payment.refunded') {
            refundTotal += (data.amount || 0);
          }
        } catch (err) {
          logger.error('Failed to process message', { topic, error: err });
        }
      },
    });
    logger.info('✅ Kafka payment analytics consumer started');
  } catch (err) {
    logger.warn('Failed to start Kafka payment analytics consumer.', { error: err });
  }
}

export async function stopPaymentConsumer(): Promise<void> {
  await consumer.disconnect();
}
