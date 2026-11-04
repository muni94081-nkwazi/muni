/**
 * MUNI Platform — Redis Streams Event Bus
 * Provides reliable, persistent event delivery using Redis Streams.
 * Use as an alternative/complement to Kafka for lower-volume, real-time events
 * (e.g., cart updates, presence, live order tracking).
 *
 * Redis Streams advantages over pub/sub:
 *  - Persistent: messages survive consumer restarts
 *  - Consumer groups: parallel processing + acknowledgement
 *  - Ordered: guaranteed per-shard ordering
 */

import { createClient, type RedisClientType } from 'redis';

// ─── Stream Names ─────────────────────────────────────────────────────────────

export const STREAMS = {
  CART_UPDATES:    'stream:cart-updates',
  ORDER_TRACKING:  'stream:order-tracking',
  FRAUD_ALERTS:    'stream:fraud-alerts',
  PRICE_DROPS:     'stream:price-drops',
  STOCK_ALERTS:    'stream:stock-alerts',
  CHAT_MESSAGES:   'stream:dispute-chat',
  CLICKSTREAM:     'stream:clickstream',
} as const;

export type StreamName = typeof STREAMS[keyof typeof STREAMS];

// ─── Stream Publisher ─────────────────────────────────────────────────────────

export class RedisStreamPublisher {
  private client: RedisClientType;
  private connected = false;

  constructor(redisUrl = process.env.REDIS_URL ?? 'redis://localhost:6379') {
    this.client = createClient({ url: redisUrl }) as RedisClientType;
    this.client.on('error', e => console.error('[stream:publisher]', e.message));
  }

  async connect(): Promise<void> {
    await this.client.connect();
    this.connected = true;
    console.log('[stream:publisher] ✅ Connected');
  }

  /**
   * Publish an event to a Redis Stream.
   * @param stream - stream name (use STREAMS.*)
   * @param event  - key/value pairs to store
   * @param maxLen - max stream length (older entries trimmed, default 10000)
   * @returns message ID
   */
  async publish(
    stream:  StreamName,
    event:   Record<string, string | number | boolean>,
    maxLen = 10_000,
  ): Promise<string> {
    if (!this.connected) {
      console.warn(`[stream:publisher] Not connected — dropping event on ${stream}`);
      return '';
    }

    const fields: string[] = [];
    for (const [k, v] of Object.entries(event)) {
      fields.push(k, String(v));
    }

    // XADD with MAXLEN to auto-trim old messages
    const msgId = await (this.client as unknown as {
      xAdd: (stream: string, id: string, fields: Record<string, string>, options?: { MAXLEN?: { threshold: number } }) => Promise<string>;
    }).xAdd(
      stream,
      '*',   // auto-generate message ID
      Object.fromEntries(Object.entries(event).map(([k, v]) => [k, String(v)])),
      { MAXLEN: { threshold: maxLen } },
    );

    return msgId;
  }

  async disconnect(): Promise<void> {
    await this.client.quit();
    this.connected = false;
  }
}

// ─── Stream Consumer (Consumer Group) ────────────────────────────────────────

export interface StreamMessage {
  id:     string;
  stream: StreamName;
  data:   Record<string, string>;
}

export type StreamHandler = (message: StreamMessage) => Promise<void>;

export class RedisStreamConsumer {
  private client: RedisClientType;
  private groupName: string;
  private consumerName: string;
  private running = false;
  private handlers = new Map<StreamName, StreamHandler>();

  constructor(
    groupName:    string,
    consumerName: string,
    redisUrl = process.env.REDIS_URL ?? 'redis://localhost:6379',
  ) {
    this.groupName    = groupName;
    this.consumerName = consumerName;
    this.client       = createClient({ url: redisUrl }) as RedisClientType;
    this.client.on('error', e => console.error(`[stream:consumer:${groupName}]`, e.message));
  }

  async connect(): Promise<void> {
    await this.client.connect();
    console.log(`[stream:consumer:${this.groupName}] ✅ Connected`);
  }

  /** Register a handler for a specific stream */
  on(stream: StreamName, handler: StreamHandler): this {
    this.handlers.set(stream, handler);
    return this;
  }

  /** Start consuming registered streams */
  async start(): Promise<void> {
    const streams = Array.from(this.handlers.keys());

    // Create consumer groups (ignore errors if already exist)
    for (const stream of streams) {
      try {
        await (this.client as unknown as {
          xGroupCreate: (stream: string, group: string, id: string, options?: { MKSTREAM?: boolean }) => Promise<void>;
        }).xGroupCreate(stream, this.groupName, '$', { MKSTREAM: true });
      } catch {
        // Group already exists — expected on restarts
      }
    }

    this.running = true;
    console.log(`[stream:consumer:${this.groupName}] Consuming: ${streams.join(', ')}`);
    this.poll(streams);
  }

  private async poll(streams: StreamName[]): Promise<void> {
    while (this.running) {
      try {
        const streamEntries = streams.map(s => ({ key: s, id: '>' }));

        const results = await (this.client as unknown as {
          xReadGroup: (
            group: string, consumer: string,
            streams: Array<{ key: string; id: string }>,
            options?: { COUNT?: number; BLOCK?: number }
          ) => Promise<Array<{ name: string; messages: Array<{ id: string; message: Record<string, string> }> }> | null>;
        }).xReadGroup(
          this.groupName,
          this.consumerName,
          streamEntries,
          { COUNT: 10, BLOCK: 2000 }, // wait up to 2s per poll
        );

        if (!results) continue;

        for (const { name, messages } of results) {
          const handler = this.handlers.get(name as StreamName);
          if (!handler) continue;

          for (const { id, message } of messages) {
            try {
              await handler({ id, stream: name as StreamName, data: message });
              // Acknowledge message
              await (this.client as unknown as {
                xAck: (stream: string, group: string, id: string) => Promise<number>;
              }).xAck(name, this.groupName, id);
            } catch (err) {
              console.error(`[stream:consumer:${this.groupName}] Handler failed for ${name}:${id}`, err);
              // Don't ack — message will be redelivered (or moved to PEL for retry)
            }
          }
        }
      } catch (err) {
        if (this.running) {
          console.error(`[stream:consumer:${this.groupName}] Poll error:`, err);
          await sleep(1000);
        }
      }
    }
  }

  async stop(): Promise<void> {
    this.running = false;
    await this.client.quit();
    console.log(`[stream:consumer:${this.groupName}] Stopped`);
  }
}

// ─── Convenience: create publisher from env ───────────────────────────────────

let defaultPublisher: RedisStreamPublisher | null = null;

export function getStreamPublisher(): RedisStreamPublisher {
  if (!defaultPublisher) {
    defaultPublisher = new RedisStreamPublisher();
  }
  return defaultPublisher;
}

// ─── Helper ───────────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
