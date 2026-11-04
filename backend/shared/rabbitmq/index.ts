/**
 * MUNI Platform — Shared RabbitMQ Events Index
 * Re-exports from infrastructure/rabbitmq/ so services can use a shorter import path.
 *
 * Usage in any service:
 *   import { ROUTING_KEYS, publishEvent } from '../../../shared/rabbitmq/index.js';
 *   import { createRabbitMQConsumer } from '../../../shared/rabbitmq/index.js';
 */

export {
  EXCHANGES,
  ROUTING_KEYS,
  DEAD_LETTER_QUEUE,
  RETRY_DELAYS_MS,
  MAX_RETRIES,
  type ExchangeName,
  type RoutingKey,
} from '../../infrastructure/rabbitmq/topology.js';

export {
  createEnvelope,
  type EventEnvelope,
} from '../../infrastructure/rabbitmq/envelope.js';

export {
  connectRabbitMQ,
  disconnectRabbitMQ,
  isRabbitMQReady,
  getChannel,
} from '../../infrastructure/rabbitmq/connection.js';

export {
  publishEvent,
  type PublishOptions,
} from '../../infrastructure/rabbitmq/publisher.js';

export {
  claimEvent,
  releaseEvent,
} from '../../infrastructure/rabbitmq/idempotency.js';

export {
  createRabbitMQConsumer,
  type RabbitConsumerConfig,
  type ManagedRabbitConsumer,
} from '../../infrastructure/rabbitmq/consumer.js';

export type {
  OrderCreatedPayload,
  OrderCancelledPayload,
  OrderFailedPayload,
  PaymentCompletedPayload,
  InventoryLowStockPayload,
} from '../../infrastructure/rabbitmq/schemas.js';
