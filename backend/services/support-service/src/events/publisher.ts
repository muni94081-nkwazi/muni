import { publish } from '../../../../shared/kafka/producer.js';
import { Topics } from '../../../../shared/kafka/topics.js';
import logger from '../config/logger.js';

export type SupportEventType =
  | 'support.ticket_created'
  | 'support.ticket_replied'
  | 'support.ticket_resolved';

/**
 * Fire-and-forget. notification-service consumes these to tell the requester
 * an agent answered; a broker outage must not fail the reply that was already
 * written.
 */
export async function publishSupportEvent(
  eventType: SupportEventType,
  data: Record<string, unknown>,
): Promise<void> {
  try {
    await publish(
      Topics.SUPPORT_EVENTS,
      { eventType, data, emittedAt: new Date().toISOString() },
      String(data.ticketId ?? ''),
    );
  } catch (err) {
    logger.warn('failed to publish support event', { eventType, error: (err as Error).message });
  }
}
