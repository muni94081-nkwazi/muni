import { Kafka, type Producer, type ProducerRecord, CompressionTypes } from 'kafkajs';
import type { TopicName } from './topics.js';

// ─── Kafka Producer Singleton ─────────────────────────────────────────────────
//
// Usage:
//   import { kafkaProducer } from '../../../shared/kafka/producer.js';
//   await kafkaProducer.publish('order.created', { orderId: '...', ... });
//
// Resilience:
//   • Retries failed publishes up to 3 times with exponential backoff
//   • If Kafka is unreachable on startup, events are logged and dropped
//     (non-fatal — order creation still succeeds, event is not persisted)
//   • TODO Phase 3: add local outbox table for guaranteed delivery

const BROKERS      = (process.env.KAFKA_BROKERS ?? 'localhost:9092').split(',');
const CLIENT_ID    = process.env.KAFKA_CLIENT_ID ?? 'muni-service';

let kafka:    Kafka    | null = null;
let producer: Producer | null = null;
let connected = false;

export async function connectProducer(): Promise<void> {
  kafka = new Kafka({
    clientId:  CLIENT_ID,
    brokers:   BROKERS,
    retry: {
      initialRetryTime: 300,
      retries:          5,
    },
    // Suppress Kafka's own verbose connection logs in dev
    logLevel: 1, // ERROR only
  });

  producer = kafka.producer({
    allowAutoTopicCreation: true,  // auto-create topics in dev
    transactionTimeout:     30_000,
  });

  await producer.connect();
  connected = true;
  console.log(`[kafka-producer] ✅ Connected to ${BROKERS.join(', ')}`);
}

export async function disconnectProducer(): Promise<void> {
  if (producer) {
    await producer.disconnect();
    connected = false;
    console.log('[kafka-producer] Disconnected');
  }
}

/**
 * Escape hatch for callers that need the raw kafkajs producer (e.g. to publish
 * on a topic outside TopicName). Returns null until connectProducer() succeeds,
 * so callers must null-check. Prefer publish() where the topic is a TopicName.
 */
export function getProducer(): Producer | null {
  return connected ? producer : null;
}

export function isProducerReady(): boolean {
  return connected;
}

// ─── Publish ──────────────────────────────────────────────────────────────────

export async function publish<T extends object>(
  topic:   TopicName,
  payload: T,
  key?:    string,
): Promise<void> {
  if (!producer || !connected) {
    // Non-fatal: log and skip rather than crashing the calling service
    console.warn(`[kafka-producer] WARN: not connected — dropping event on "${topic}":`, payload);
    return;
  }

  const record: ProducerRecord = {
    topic,
    compression: CompressionTypes.GZIP,
    messages: [
      {
        key:   key ?? null,
        value: JSON.stringify({ ...payload, _publishedAt: new Date().toISOString() }),
        headers: {
          'content-type': 'application/json',
          'source':       CLIENT_ID,
        },
      },
    ],
  };

  try {
    await producer.send(record);
    console.debug(`[kafka-producer] Published → ${topic}`);
  } catch (err) {
    // Log and swallow — the calling service should not fail because Kafka is slow
    console.error(`[kafka-producer] Failed to publish to "${topic}":`, err);
  }
}
