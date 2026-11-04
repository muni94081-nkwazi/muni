import { Kafka, logLevel, type Producer } from 'kafkajs';
import env from './env.js';
import logger from './logger.js';

export const kafka = new Kafka({
  clientId: env.kafka.clientId,
  brokers: env.kafka.brokers,
  logLevel: logLevel.WARN,
  retry: {
    initialRetryTime: 300,
    retries: 5,
  },
});

export const producer: Producer = kafka.producer();

let isConnected = false;

export async function connectProducer(): Promise<void> {
  if (isConnected) return;
  await producer.connect();
  isConnected = true;
  logger.info('kafka producer connected');
}

export async function disconnectProducer(): Promise<void> {
  if (!isConnected) return;
  await producer.disconnect();
  isConnected = false;
}

export function isProducerReady(): boolean {
  return isConnected;
}
