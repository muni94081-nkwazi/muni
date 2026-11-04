import { publish } from '../../../../shared/kafka/producer.js';
import { Topics } from '../../../../shared/kafka/topics.js';
import logger from '../config/logger.js';

export type ReviewEventType =
  | 'review.created'
  | 'review.updated'
  | 'review.deleted'
  | 'review.moderated'
  | 'review.auto_hidden'
  | 'review.seller_responded';

/**
 * Fire-and-forget. A broker outage must not fail a buyer's review submission —
 * the review is already committed by the time this runs, and the downstream
 * consumers (search reindex, seller notification, analytics) are eventually
 * consistent by design.
 */
export async function publishReviewEvent(
  eventType: ReviewEventType,
  data: Record<string, unknown>,
): Promise<void> {
  try {
    await publish(
      Topics.REVIEW_EVENTS,
      { eventType, data, emittedAt: new Date().toISOString() },
      String(data.productId ?? data.reviewId ?? ''),
    );
  } catch (err) {
    logger.warn('failed to publish review event', { eventType, error: (err as Error).message });
  }
}
