/**
 * MUNI Platform — Idempotent RabbitMQ Consumer Factory
 * Provides a standardized consumer with:
 *  - Idempotency guard (Redis, see idempotency.ts) — duplicate deliveries
 *    of the same eventId are acked and skipped without re-running the handler
 *  - Retry with exponential backoff (RETRY_DELAYS_MS) via a dead-letter
 *    round-trip through EXCHANGES.RETRY
 *  - After MAX_RETRIES failed attempts, the message is routed to the DLQ
 *    instead of being retried forever
 *  - Graceful shutdown
 */

import { withExtractedContext } from '../../shared/tracing/tracer.js';
import type { Channel, ConsumeMessage } from 'amqplib';
import { getChannel } from './connection.js';
import { EXCHANGES, DEAD_LETTER_QUEUE, RETRY_DELAYS_MS, type RoutingKey } from './topology.js';
import type { EventEnvelope } from './envelope.js';
import { claimEvent, releaseEvent } from './idempotency.js';

export interface RabbitConsumerConfig {
  /** Durable queue name, e.g. 'inventory-service.order-events'. */
  queue: string;
  /** Routing keys to bind this queue to on EXCHANGES.EVENTS. */
  routingKeys: RoutingKey[];
  /** Service name, used for logging. */
  service: string;
  /** Message handler — throw to trigger the retry/DLQ path. */
  onMessage: (envelope: EventEnvelope, routingKey: string) => Promise<void>;
  /** Max delivery attempts before routing to the DLQ (default: RETRY_DELAYS_MS.length). */
  maxRetries?: number;
  /** Apply the Redis idempotency guard before invoking the handler (default: true). */
  idempotent?: boolean;
  /** Max unacked messages delivered at once (default: 10). */
  prefetch?: number;
}

export interface ManagedRabbitConsumer {
  start:     () => Promise<void>;
  stop:      () => Promise<void>;
  isRunning: () => boolean;
}

export function createRabbitMQConsumer(config: RabbitConsumerConfig): ManagedRabbitConsumer {
  const maxRetries = config.maxRetries ?? RETRY_DELAYS_MS.length;
  const idempotent = config.idempotent ?? true;
  const retryQueue = `${config.queue}.retry`;

  let channel: Channel | null = null;
  let running = false;

  async function start(): Promise<void> {
    channel = (await getChannel(`consumer:${config.queue}`)) as Channel;

    await channel.assertExchange(EXCHANGES.EVENTS, 'topic', { durable: true });
    await channel.assertExchange(EXCHANGES.RETRY, 'topic', { durable: true });
    await channel.assertExchange(EXCHANGES.DLX, 'topic', { durable: true });

    await channel.assertQueue(config.queue, { durable: true });
    for (const key of config.routingKeys) {
      await channel.bindQueue(config.queue, EXCHANGES.EVENTS, key);
    }

    // Retry queue: each retried message carries its own `expiration` (set
    // per-attempt below), then dead-letters back into EXCHANGES.EVENTS using
    // its own original routing key — landing back on `config.queue`.
    await channel.assertQueue(retryQueue, {
      durable: true,
      arguments: { 'x-dead-letter-exchange': EXCHANGES.EVENTS },
    });
    await channel.bindQueue(retryQueue, EXCHANGES.RETRY, '#');

    await channel.assertQueue(DEAD_LETTER_QUEUE, { durable: true });
    await channel.bindQueue(DEAD_LETTER_QUEUE, EXCHANGES.DLX, '#');

    await channel.prefetch(config.prefetch ?? 10);
    await channel.consume(config.queue, (msg) => { if (msg) void handle(msg); }, { noAck: false });

    running = true;
    console.log(`[rabbitmq:consumer:${config.service}] ✅ Consuming "${config.queue}" — keys: ${config.routingKeys.join(', ')}`);
  }

  async function handle(msg: ConsumeMessage): Promise<void> {
    if (!channel) return;

    const routingKey = msg.fields.routingKey;
    const attempt     = Number(msg.properties.headers?.['x-retry-count'] ?? 0);

    let envelope: EventEnvelope;
    try {
      envelope = JSON.parse(msg.content.toString()) as EventEnvelope;
    } catch (err) {
      console.error(`[rabbitmq:consumer:${config.service}] Malformed message on "${routingKey}" — dropping`, err);
      channel.ack(msg);
      return;
    }

    if (idempotent) {
      const claimed = await claimEvent(envelope.eventId).catch((err) => {
        console.warn(`[rabbitmq:consumer:${config.service}] Idempotency check failed (processing anyway):`, (err as Error).message);
        return true; // fail open — a down Redis should not block processing
      });
      if (!claimed) {
        console.log(`[rabbitmq:consumer:${config.service}] Duplicate delivery of ${envelope.eventId} — skipping`);
        channel.ack(msg);
        return;
      }
    }

    try {
      // Rejoin the publisher's trace. Without this the handler's spans start a
      // fresh, orphaned trace and a checkout that fans out over the queue
      // appears in Jaeger as several unrelated traces instead of one.
      await withExtractedContext(
        (msg.properties.headers ?? {}) as Record<string, unknown>,
        () => config.onMessage(envelope, routingKey),
      );
      channel.ack(msg);
    } catch (err) {
      if (idempotent) await releaseEvent(envelope.eventId).catch(() => {});

      const nextAttempt = attempt + 1;
      console.error(
        `[rabbitmq:consumer:${config.service}] Handler failed for ${envelope.eventType} (attempt ${nextAttempt}/${maxRetries}):`,
        (err as Error).message,
      );

      if (nextAttempt <= maxRetries) {
        const delayMs = RETRY_DELAYS_MS[attempt] ?? RETRY_DELAYS_MS[RETRY_DELAYS_MS.length - 1];
        channel.publish(EXCHANGES.RETRY, routingKey, msg.content, {
          ...msg.properties,
          expiration: String(delayMs),
          headers:    { ...msg.properties.headers, 'x-retry-count': nextAttempt },
        });
      } else {
        console.error(
          `[rabbitmq:consumer:${config.service}] Max retries exceeded for ${envelope.eventType} (${envelope.eventId}) — routing to DLQ`,
        );
        channel.publish(EXCHANGES.DLX, routingKey, msg.content, {
          ...msg.properties,
          headers: { ...msg.properties.headers, 'x-retry-count': nextAttempt, 'x-failure-reason': (err as Error).message },
        });
      }

      // The original delivery is acked either way — the retry/DLQ copy now
      // owns delivery, so leaving the original unacked would double-process it.
      channel.ack(msg);
    }
  }

  async function stop(): Promise<void> {
    running = false;
    await channel?.close().catch(() => {});
    channel = null;
    console.log(`[rabbitmq:consumer:${config.service}] Stopped`);
  }

  return { start, stop, isRunning: () => running };
}
