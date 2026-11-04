import { Kafka, type Consumer, type EachMessagePayload } from 'kafkajs';
import type { TopicName } from './topics.js';

// ─── Kafka Consumer Factory ───────────────────────────────────────────────────
//
// Each service creates its own consumer with a unique groupId.
// Messages are guaranteed to be delivered at-least-once per group.
//
// Dead-Letter Queue behaviour:
//   If a handler throws more than maxRetries times on the same message,
//   the error is logged with the full payload (for manual recovery) and
//   the consumer continues to the next message.

const BROKERS   = (process.env.KAFKA_BROKERS ?? 'localhost:9092').split(',');
const MAX_RETRIES = 3;

export type MessageHandler<T = unknown> = (payload: T, raw: EachMessagePayload) => Promise<void>;

export interface KafkaConsumerOptions {
  groupId:     string;
  serviceName: string;
  maxRetries?: number;
}

export class KafkaConsumer {
  private kafka:    Kafka;
  private consumer: Consumer;
  private running   = false;

  constructor(private readonly opts: KafkaConsumerOptions) {
    this.kafka = new Kafka({
      clientId: opts.serviceName,
      brokers:  BROKERS,
      retry: { initialRetryTime: 300, retries: 5 },
      logLevel: 1,
    });

    this.consumer = this.kafka.consumer({
      groupId:              opts.groupId,
      sessionTimeout:       30_000,
      heartbeatInterval:    3_000,
      maxWaitTimeInMs:      5_000,
    });
  }

  async subscribe<T>(
    topic:   TopicName | string,
    handler: MessageHandler<T>,
  ): Promise<void> {
    if (!this.running) {
      await this.consumer.connect();
      console.log(`[kafka-consumer:${this.opts.serviceName}] ✅ Connected`);
      this.running = true;
    }

    await this.consumer.subscribe({ topic, fromBeginning: false });
    console.log(`[kafka-consumer:${this.opts.serviceName}] Subscribed to "${topic}"`);

    const maxRetries = this.opts.maxRetries ?? MAX_RETRIES;

    await this.consumer.run({
      eachMessage: async (raw) => {
        const { topic: t, partition, message } = raw;
        const raw_value = message.value?.toString();

        if (!raw_value) {
          console.warn(`[kafka-consumer:${this.opts.serviceName}] Empty message on "${t}" p${partition} — skipping`);
          return;
        }

        let payload: T;
        try {
          payload = JSON.parse(raw_value) as T;
        } catch {
          console.error(`[kafka-consumer:${this.opts.serviceName}] Invalid JSON on "${t}" — dropping:`, raw_value);
          return;
        }

        // Retry loop with exponential backoff
        let attempt = 0;
        while (attempt < maxRetries) {
          try {
            await handler(payload, raw);
            return; // success
          } catch (err) {
            attempt++;
            if (attempt >= maxRetries) {
              // Dead-letter: log full payload for manual recovery
              console.error(
                `[kafka-consumer:${this.opts.serviceName}] DLQ — handler failed ${maxRetries}x on "${t}":`,
                { payload, error: err },
              );
            } else {
              const delay = 500 * Math.pow(2, attempt - 1);
              console.warn(
                `[kafka-consumer:${this.opts.serviceName}] Handler error (attempt ${attempt}/${maxRetries}) — retrying in ${delay}ms`,
                err,
              );
              await new Promise((r) => setTimeout(r, delay));
            }
          }
        }
      },
    });
  }

  async disconnect(): Promise<void> {
    if (this.running) {
      await this.consumer.disconnect();
      this.running = false;
      console.log(`[kafka-consumer:${this.opts.serviceName}] Disconnected`);
    }
  }

  isRunning(): boolean { return this.running; }
}
