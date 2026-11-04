import { producer } from '../config/kafka.js';
import logger from '../config/logger.js';

export const TOPICS = {
  USER_REGISTERED: 'user.registered',
  USER_PASSWORD_RESET_REQUESTED: 'user.password_reset_requested',
  USER_PASSWORD_RESET: 'user.password_reset',
  USER_PROFILE_UPDATED: 'user.profile_updated',
  USER_ADDRESS_CHANGED: 'user.address_changed',
  SELLER_STANDING_CHANGED: 'seller.standing_changed',
} as const;

export type TopicName = typeof TOPICS[keyof typeof TOPICS];

/**
 * Publishes a domain event. Failures are logged but never thrown back to
 * the caller — a Kafka hiccup shouldn't fail a user's registration or
 * login. notification-service, analytics-service, etc. consume these
 * topics independently.
 */
export async function publish(topic: TopicName, payload: Record<string, unknown> & { userId?: string }): Promise<void> {
  try {
    await producer.send({
      topic,
      messages: [
        {
          key: payload.userId,
          value: JSON.stringify({ ...payload, emittedAt: new Date().toISOString() }),
        },
      ],
    });
  } catch (err) {
    logger.error(`Failed to publish event on topic "${topic}"`, err);
  }
}
