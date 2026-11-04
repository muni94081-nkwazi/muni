/**
 * MUNI Platform — Shared Events Index
 * Re-exports from infrastructure/kafka/ so services can use a shorter import path.
 *
 * Usage in any service:
 *   import { TOPICS, EVENTS, createEvent, publishEvent } from '../../../shared/events/index.js';
 */

export {
  TOPICS,
  EVENTS,
  type KafkaTopic,
  type KafkaEventKey,
} from '../../infrastructure/kafka/topics.js';

export {
  createEvent,
  publishEvent,
  type KafkaEventEnvelope,
  type UserRegisteredEvent,
  type SellerApprovedEvent,
  type SellerRejectedEvent,
  type ProductCreatedEvent,
  type ProductPriceUpdatedEvent,
  type ProductViewedEvent,
  type InventoryReservedEvent,
  type InventoryReleasedEvent,
  type StockLowEvent,
  type CartItemAddedEvent,
  type CartCheckoutStartedEvent,
  type OrderCreatedEvent,
  type OrderStatusUpdatedEvent,
  type PaymentInitiatedEvent,
  type PaymentSucceededEvent,
  type PaymentFailedEvent,
  type RefundInitiatedEvent,
  type ShipmentCreatedEvent,
  type FraudScoredEvent,
  type NotificationSendEvent,
  type AnalyticsEventTracked,
} from '../../infrastructure/kafka/schemas.js';

export {
  createConsumer,
  createConsumerFromEnv,
  type ConsumerConfig,
  type KafkaEventPayload,
  type ManagedConsumer,
} from '../../infrastructure/kafka/consumer.js';

export {
  DeadLetterQueueManager,
  createDLQManager,
  type DLQMessage,
} from '../../infrastructure/kafka/dlq.js';

export { validatePayload, registerSchema, listSchemas } from '../../infrastructure/schema-registry/client.js';
