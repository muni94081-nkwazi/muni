import { RedisStreamConsumer, STREAMS, type StreamMessage } from '../../../../infrastructure/redis/streams.js';
import { userAffinityService } from '../services/affinity.service.js';
import { recommendationEngineService } from '../services/recommendation-engine.service.js';
import { recordCartAdd } from '../store/event-store.js';
import type { ClickstreamEventType } from '../models/recommendation.model.js';

// ─── Real-Time Clickstream Consumer ────────────────────────────────────────────
// Consumes product_view / category_browse / add_to_cart / wishlist events off
// the shared `stream:clickstream` Redis Stream (published by cart-service,
// product-service, wishlist-service, or the /track/clickstream endpoint below)
// and feeds them into the user affinity profile that powers the home feed.

const CLICKSTREAM_EVENT_TYPES = new Set<ClickstreamEventType>([
  'product_view',
  'category_browse',
  'add_to_cart',
  'wishlist',
]);

let consumer: RedisStreamConsumer | null = null;

export async function startClickstreamConsumer(): Promise<void> {
  consumer = new RedisStreamConsumer('recommendation-service-clickstream', `reco-${process.pid}`);
  consumer.on(STREAMS.CLICKSTREAM, handleMessage);
  await consumer.connect();
  await consumer.start();
  console.log('[recommendation-service] ✅ Clickstream Redis Streams consumer started');
}

export async function stopClickstreamConsumer(): Promise<void> {
  if (!consumer) return;
  try {
    await consumer.stop();
  } catch {
    // best-effort — consumer may never have connected
  }
  consumer = null;
}

async function handleMessage(message: StreamMessage): Promise<void> {
  const { userId, eventType, productId, category, timestamp } = message.data;
  if (!userId || !CLICKSTREAM_EVENT_TYPES.has(eventType as ClickstreamEventType)) return;

  const ts = timestamp ? Number(timestamp) : Date.now();

  await userAffinityService.recordEvent({
    userId,
    eventType: eventType as ClickstreamEventType,
    productId: productId || undefined,
    category: category || undefined,
    timestamp: ts,
  });

  // Product views and cart adds also feed the collaborative-filtering /
  // trending signals used by the other strategies.
  if (eventType === 'product_view' && productId) {
    await recommendationEngineService.trackView(userId, productId, category || undefined);
  } else if (eventType === 'add_to_cart' && productId) {
    recordCartAdd(userId, productId, ts);
  }
}
