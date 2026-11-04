/**
 * MUNI Platform — RabbitMQ Topology Registry
 * Central source of truth for exchanges, queues, and routing keys.
 * Import from here, never hardcode exchange/queue names in a service.
 *
 * Message flow:
 *   publisher → EXCHANGES.EVENTS (topic) → <service>.<domain>-events queue
 *   handler throws → republished to EXCHANGES.RETRY with a per-message TTL
 *     → on expiry, dead-lettered back into EXCHANGES.EVENTS with the
 *       original routing key, landing on the original queue again
 *   attempt > maxRetries → republished to EXCHANGES.DLX → DEAD_LETTER_QUEUE
 */

export const EXCHANGES = {
  EVENTS: 'muni.events',        // topic exchange — all domain events are published here
  RETRY:  'muni.events.retry',  // topic exchange backing the delayed-retry queues
  DLX:    'muni.events.dlx',    // dead-letter exchange — terminal failures land here
} as const;

export type ExchangeName = typeof EXCHANGES[keyof typeof EXCHANGES];

export const DEAD_LETTER_QUEUE = 'muni.events.dlq';

// ─── Routing Keys ───────────────────────────────────────────────────────────
// One routing key per domain event. Also doubles as the envelope's eventType.

export const ROUTING_KEYS = {
  ORDER_CREATED:       'order.created',
  ORDER_CANCELLED:     'order.cancelled',
  /**
   * An order that was paid for but could not be fulfilled — emitted when
   * settling its inventory reservation fails after the money was taken, so
   * the payment has been refunded and the order marked failed. Distinct from
   * `order.cancelled`, which is a deliberate act by a buyer or admin.
   */
  ORDER_FAILED:        'order.failed',
  PAYMENT_COMPLETED:   'payment.completed',
  INVENTORY_LOW_STOCK: 'inventory.low_stock',
} as const;

export type RoutingKey = typeof ROUTING_KEYS[keyof typeof ROUTING_KEYS];

// ─── Retry Policy ───────────────────────────────────────────────────────────
// Exponential backoff, indexed by attempt number (0-based). After
// RETRY_DELAYS_MS.length failed attempts, the message is routed to the DLQ.

export const RETRY_DELAYS_MS = [5_000, 30_000, 120_000] as const; // 5s, 30s, 2min
export const MAX_RETRIES = RETRY_DELAYS_MS.length;
