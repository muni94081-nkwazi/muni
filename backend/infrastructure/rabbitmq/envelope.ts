/**
 * MUNI Platform — RabbitMQ Event Envelope
 * Standard wrapper for every message published to EXCHANGES.EVENTS.
 */

import { randomUUID } from 'node:crypto';

export interface EventEnvelope<T = unknown> {
  eventId:       string;  // UUID — used as the idempotency key by consumers
  eventType:     string;  // e.g. 'order.created' (matches the routing key)
  timestamp:     string;  // ISO 8601
  payload:       T;
  correlationId: string;  // ties related events/requests together across services
}

export function createEnvelope<T>(
  eventType:      string,
  payload:        T,
  correlationId?: string,
): EventEnvelope<T> {
  return {
    eventId:       randomUUID(),
    eventType,
    timestamp:     new Date().toISOString(),
    payload,
    correlationId: correlationId ?? randomUUID(),
  };
}
