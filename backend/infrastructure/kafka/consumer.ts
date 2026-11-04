/**
 * MUNI Platform — Shared Kafka Consumer Factory
 * Provides a standardized, non-fatal Kafka consumer with:
 *  - Automatic reconnect / retry
 *  - Dead-letter queue routing on repeated failures
 *  - Graceful shutdown
 *  - Structured logging
 */

import { Kafka, type Consumer, type EachMessagePayload, type KafkaMessage } from 'kafkajs';

export interface ConsumerConfig {
  /** Unique group ID for this consumer (determines offset tracking) */
  groupId:    string;
  /** Topics to subscribe to */
  topics:     string[];
  /** Service name for logging */
  service:    string;
  /** Message handler — throw to trigger DLQ routing */
  onMessage:  (topic: string, payload: KafkaEventPayload) => Promise<void>;
  /** Max retries before routing to DLQ (default: 3) */
  maxRetries?: number;
  /** Start from beginning on first join (default: false) */
  fromBeginning?: boolean;
}

export interface KafkaEventPayload {
  eventId:    string;
  eventType:  string;
  service:    string;
  version:    string;
  occurredAt: string;
  data:       unknown;
}

export interface ManagedConsumer {
  start:      () => Promise<void>;
  stop:       () => Promise<void>;
  isRunning:  () => boolean;
}

// ─── Factory ──────────────────────────────────────────────────────────────────

export function createConsumer(
  brokers: string[],
  config:  ConsumerConfig,
): ManagedConsumer {
  const kafka = new Kafka({
    clientId: `${config.service}-consumer`,
    brokers,
    retry: {
      initialRetryTime: 300,
      retries: 8,
    },
  });

  const consumer: Consumer = kafka.consumer({
    groupId:              config.groupId,
    sessionTimeout:       30_000,
    heartbeatInterval:    3_000,
    maxBytesPerPartition: 1_048_576, // 1 MB
  });

  let running = false;

  async function start(): Promise<void> {
    await consumer.connect();

    for (const topic of config.topics) {
      await consumer.subscribe({
        topic,
        fromBeginning: config.fromBeginning ?? false,
      });
    }

    await consumer.run({
      eachMessage: async (payload: EachMessagePayload) => {
        const { topic, message } = payload;
        await handleMessage(topic, message);
      },
    });

    running = true;
    console.log(`[${config.service}] ✅ Kafka consumer started — topics: ${config.topics.join(', ')}`);
  }

  async function handleMessage(topic: string, message: KafkaMessage): Promise<void> {
    const raw = message.value?.toString();
    if (!raw) return;

    let envelope: KafkaEventPayload;
    try {
      envelope = JSON.parse(raw) as KafkaEventPayload;
    } catch {
      console.error(`[${config.service}] Failed to parse message on ${topic}:`, raw.slice(0, 200));
      return;
    }

    let attempt = 0;
    const maxRetries = config.maxRetries ?? 3;

    while (attempt <= maxRetries) {
      try {
        await config.onMessage(topic, envelope);
        return; // success
      } catch (err) {
        attempt++;
        if (attempt > maxRetries) {
          console.error(`[${config.service}] Message failed after ${maxRetries} retries on ${topic}:`, {
            eventId:   envelope.eventId,
            eventType: envelope.eventType,
            error:     err instanceof Error ? err.message : String(err),
          });
          // Route to DLQ (non-fatal — don't crash the consumer)
          await routeToDLQ(kafka, topic, message, String(err)).catch(() => {});
          return;
        }
        // Exponential back-off: 0.5s, 1s, 2s
        await sleep(500 * Math.pow(2, attempt - 1));
        console.warn(`[${config.service}] Retrying message (attempt ${attempt}/${maxRetries}) on ${topic}`);
      }
    }
  }

  async function stop(): Promise<void> {
    if (!running) return;
    await consumer.disconnect();
    running = false;
    console.log(`[${config.service}] Kafka consumer stopped`);
  }

  return { start, stop, isRunning: () => running };
}

// ─── DLQ routing ─────────────────────────────────────────────────────────────

async function routeToDLQ(
  kafka:         Kafka,
  originalTopic: string,
  message:       KafkaMessage,
  error:         string,
): Promise<void> {
  const producer = kafka.producer();
  await producer.connect();
  await producer.send({
    topic: 'dead-letter-queue',
    messages: [{
      key:   message.key ?? undefined,
      value: JSON.stringify({
        id:            `dlq_${Date.now()}`,
        originalTopic,
        value:         message.value?.toString() ?? '',
        headers:       Object.fromEntries(
          Object.entries(message.headers ?? {}).map(([k, v]) => [k, String(v)]),
        ),
        error,
        retryCount:    0,
        maxRetries:    3,
        nextRetryAt:   new Date(Date.now() + 60_000).toISOString(),
        createdAt:     new Date().toISOString(),
        status:        'pending',
      }),
      headers: { originalTopic, error },
    }],
  });
  await producer.disconnect();
}

// ─── Helper ───────────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ─── Convenience: createFromEnv ───────────────────────────────────────────────

export function createConsumerFromEnv(config: ConsumerConfig): ManagedConsumer {
  const brokers = (process.env.KAFKA_BROKERS ?? 'localhost:9092').split(',');
  return createConsumer(brokers, config);
}
