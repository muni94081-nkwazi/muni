import { Kafka, type Consumer } from 'kafkajs';
import env from '../config/env.js';
import logger from '../config/logger.js';
import { dispatch } from '../services/dispatch.service.js';

// ─── Seller, auth and user lifecycle events ─────────────────────────────────
//
// Covers seller onboarding and standing changes, plus the account and
// password-reset events user-service publishes. The password-reset path is the
// one that most needed a real provider: a reset code that only ever reached an
// in-memory Map meant nobody could recover an account.

const kafka = new Kafka({
  clientId: `${env.kafka.clientId}-seller`,
  brokers: env.kafka.brokers,
  retry: { initialRetryTime: 300, retries: 5 },
});

const consumer: Consumer = kafka.consumer({ groupId: 'notification-service-seller-group' });

interface Envelope {
  eventType?: string;
  topic?: string;
  userId?: string;
  sellerId?: string;
  data?: Record<string, unknown>;
  [key: string]: unknown;
}

/**
 * user-service publishes one topic per event name ("user.registered"), while
 * the seller and auth publishers share a topic and name the event inside the
 * envelope. Both styles are subscribed here, with the topic name acting as the
 * fallback event name.
 */
const TOPICS = [
  'seller-events',
  'auth-events',
  'user.registered',
  'user.password_reset_requested',
  'user.password_reset',
  'user.profile_updated',
  'seller.standing_changed',
];

export async function startSellerConsumer(): Promise<void> {
  try {
    await consumer.connect();
    for (const topic of TOPICS) {
      await consumer.subscribe({ topic, fromBeginning: false });
    }

    await consumer.run({
      eachMessage: async ({ topic, message }) => {
        const raw = message.value?.toString();
        if (!raw) return;

        let envelope: Envelope;
        try {
          envelope = JSON.parse(raw) as Envelope;
        } catch {
          logger.warn('invalid JSON on seller/auth topic — dropping', { topic });
          return;
        }

        // Topic-per-event publishers put the payload at the root and carry no
        // eventType, so the topic name is the event name.
        const eventType = envelope.eventType ?? envelope.topic ?? topic;
        const data = envelope.data ?? (envelope as Record<string, unknown>);
        const userId =
          (data.userId as string) ??
          envelope.userId ??
          (data.sellerId as string) ??
          envelope.sellerId;

        if (!userId) {
          logger.debug('seller/auth event without a recipient', { eventType });
          return;
        }

        try {
          await dispatch({ userId, eventType, data });
        } catch (err) {
          logger.error('failed to dispatch seller/auth notification', {
            eventType,
            error: (err as Error).message,
          });
          throw err;
        }
      },
    });

    logger.info('seller/auth events consumer started');
  } catch (err) {
    logger.warn('failed to start seller consumer — service will still boot', {
      error: (err as Error).message,
    });
  }
}

export async function stopSellerConsumer(): Promise<void> {
  await consumer.disconnect().catch(() => undefined);
}
