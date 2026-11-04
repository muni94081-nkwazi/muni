/**
 * MUNI Platform — RabbitMQ Event Publisher
 * Wraps a payload in the standard EventEnvelope and publishes it to
 * EXCHANGES.EVENTS via a pooled confirm channel.
 *
 * Resilience: if the broker is unreachable, the publish is logged and
 * dropped rather than throwing — a domain event failing to publish must
 * not fail the request that produced it (mirrors shared/kafka/producer.ts).
 */

import { injectTraceHeaders } from '../../shared/tracing/tracer.js';
import type { ConfirmChannel } from 'amqplib';
import { getChannel } from './connection.js';
import { EXCHANGES, type RoutingKey } from './topology.js';
import { createEnvelope, type EventEnvelope } from './envelope.js';

const PUBLISHER_CHANNEL = 'publisher';

async function getPublisherChannel(): Promise<ConfirmChannel> {
  const channel = (await getChannel(PUBLISHER_CHANNEL, true)) as ConfirmChannel;
  await channel.assertExchange(EXCHANGES.EVENTS, 'topic', { durable: true });
  return channel;
}

export interface PublishOptions {
  /** Ties this event to a request/saga; defaults to a fresh UUID. */
  correlationId?: string;
  /** Originating service, recorded in message headers for observability. */
  service?: string;
}

export async function publishEvent<T>(
  routingKey: RoutingKey,
  payload:    T,
  options:    PublishOptions = {},
): Promise<EventEnvelope<T>> {
  const envelope = createEnvelope(routingKey, payload, options.correlationId);

  try {
    const channel = await getPublisherChannel();

    await new Promise<void>((resolve, reject) => {
      const ok = channel.publish(
        EXCHANGES.EVENTS,
        routingKey,
        Buffer.from(JSON.stringify(envelope)),
        {
          contentType:   'application/json',
          persistent:    true,
          messageId:     envelope.eventId,
          correlationId: envelope.correlationId,
          // W3C traceparent/tracestate so the consumer's work joins the
          // trace that published the message rather than starting its own.
          headers: injectTraceHeaders({
            'x-retry-count': 0,
            service: options.service ?? 'unknown',
          }),
        },
        (err) => (err ? reject(err) : resolve()),
      );
      if (!ok) console.warn(`[rabbitmq:publisher] Channel write buffer full for "${routingKey}" — backpressure`);
    });

    console.log(`[rabbitmq:publisher] Published → ${routingKey} (${envelope.eventId})`);
  } catch (err) {
    console.error(`[rabbitmq:publisher] Failed to publish "${routingKey}":`, (err as Error).message);
  }

  return envelope;
}
