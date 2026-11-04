/**
 * MUNI Platform — Kafka Dead-Letter Queue Handler
 * Receives failed messages, stores them, and provides retry mechanisms.
 */

import { Kafka, type Consumer, type Producer, type EachMessagePayload } from 'kafkajs';
import { randomUUID } from 'node:crypto';

export interface DLQMessage {
  id:           string;
  originalTopic: string;
  originalKey?:  string;
  value:         string;
  headers:       Record<string, string>;
  error:         string;
  retryCount:    number;
  maxRetries:    number;
  nextRetryAt:   string;
  createdAt:     string;
  resolvedAt?:   string;
  status:        'pending' | 'retrying' | 'resolved' | 'dead';
}

// ─── In-memory DLQ store (replace with Redis/DB in production) ────────────────

const dlqStore = new Map<string, DLQMessage>();

// ─── DLQ Manager ─────────────────────────────────────────────────────────────

export class DeadLetterQueueManager {
  private consumer: Consumer | null = null;
  private producer: Producer | null = null;

  constructor(
    private kafka: Kafka,
    private groupId: string = 'muni-dlq-manager',
  ) {}

  async connect(): Promise<void> {
    this.producer = this.kafka.producer();
    this.consumer = this.kafka.consumer({ groupId: this.groupId });
    await this.producer.connect();
    await this.consumer.connect();
    await this.consumer.subscribe({ topic: 'dead-letter-queue', fromBeginning: false });
    await this.consumer.run({ eachMessage: this.handleDLQMessage.bind(this) });
  }

  private async handleDLQMessage(payload: EachMessagePayload): Promise<void> {
    try {
      const raw = payload.message.value?.toString();
      if (!raw) return;
      const msg = JSON.parse(raw) as DLQMessage;
      dlqStore.set(msg.id, { ...msg, status: 'pending' });
      console.log(`[DLQ] Received failed message from ${msg.originalTopic}: ${msg.error}`);
    } catch (err) {
      console.error('[DLQ] Failed to process DLQ message:', err);
    }
  }

  /** Send a failed message to the DLQ */
  async sendToDLQ(
    originalTopic: string,
    originalKey:   string | undefined,
    value:         string,
    headers:       Record<string, string>,
    error:         string,
    maxRetries:    number = 3,
  ): Promise<void> {
    if (!this.producer) throw new Error('DLQ producer not connected');

    const msg: DLQMessage = {
      id:            randomUUID(),
      originalTopic,
      originalKey,
      value,
      headers,
      error,
      retryCount:    0,
      maxRetries,
      nextRetryAt:   new Date(Date.now() + 60_000).toISOString(), // retry in 1 min
      createdAt:     new Date().toISOString(),
      status:        'pending',
    };

    dlqStore.set(msg.id, msg);

    await this.producer.send({
      topic: 'dead-letter-queue',
      messages: [{
        key:   msg.id,
        value: JSON.stringify(msg),
        headers: { originalTopic, error },
      }],
    });
  }

  /** Retry a DLQ message (republish to original topic) */
  async retry(id: string): Promise<void> {
    if (!this.producer) throw new Error('DLQ producer not connected');

    const msg = dlqStore.get(id);
    if (!msg) throw new Error(`DLQ message ${id} not found`);
    if (msg.retryCount >= msg.maxRetries) throw new Error('Max retries exceeded');

    await this.producer.send({
      topic: msg.originalTopic,
      messages: [{
        key:   msg.originalKey,
        value: msg.value,
      }],
    });

    const updated: DLQMessage = {
      ...msg,
      retryCount:  msg.retryCount + 1,
      status:      msg.retryCount + 1 >= msg.maxRetries ? 'dead' : 'retrying',
      nextRetryAt: new Date(Date.now() + Math.pow(2, msg.retryCount) * 60_000).toISOString(),
    };
    dlqStore.set(id, updated);
  }

  /** List all DLQ messages */
  list(status?: DLQMessage['status']): DLQMessage[] {
    const all = Array.from(dlqStore.values());
    return status ? all.filter(m => m.status === status) : all;
  }

  /** Mark as resolved (no retry needed) */
  resolve(id: string): void {
    const msg = dlqStore.get(id);
    if (msg) dlqStore.set(id, { ...msg, status: 'resolved', resolvedAt: new Date().toISOString() });
  }

  async disconnect(): Promise<void> {
    await this.consumer?.disconnect();
    await this.producer?.disconnect();
  }
}

// ─── Singleton factory ────────────────────────────────────────────────────────

let dlqManager: DeadLetterQueueManager | null = null;

export function createDLQManager(
  brokers: string[] = (process.env.KAFKA_BROKERS ?? 'localhost:9092').split(','),
): DeadLetterQueueManager {
  if (!dlqManager) {
    const kafka = new Kafka({ clientId: 'muni-dlq', brokers });
    dlqManager = new DeadLetterQueueManager(kafka);
  }
  return dlqManager;
}
