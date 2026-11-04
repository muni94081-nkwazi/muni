import type { Request, Response } from 'express';
import { recommendationEngineService } from '../services/recommendation-engine.service.js';
import { getStreamPublisher, STREAMS } from '../../../../infrastructure/redis/streams.js';
import type { ClickstreamEventType } from '../models/recommendation.model.js';

export async function getCustomersAlsoViewed(req: Request, res: Response): Promise<void> {
  const { productId } = req.params;
  const limit = Math.min(20, Math.max(1, parseInt((req.query.limit as string) ?? '6', 10)));

  try {
    const data = await recommendationEngineService.getCustomersAlsoViewed(productId, limit);
    res.json({ success: true, data, strategy: 'customers_also_viewed' });
  } catch (err) {
    res.status(500).json({ success: false, message: (err as Error).message });
  }
}

export async function getCustomersAlsoBought(req: Request, res: Response): Promise<void> {
  const { productId } = req.params;
  const limit = Math.min(20, Math.max(1, parseInt((req.query.limit as string) ?? '6', 10)));

  try {
    const data = await recommendationEngineService.getCustomersAlsoBought(productId, limit);
    res.json({ success: true, data, strategy: 'customers_who_bought_this_also_bought' });
  } catch (err) {
    res.status(500).json({ success: false, message: (err as Error).message });
  }
}

export async function getFrequentlyBoughtTogether(req: Request, res: Response): Promise<void> {
  const { productId } = req.params;

  try {
    const data = await recommendationEngineService.getFrequentlyBoughtTogether(productId);
    res.json({ success: true, data, strategy: 'frequently_bought_together' });
  } catch (err) {
    res.status(500).json({ success: false, message: (err as Error).message });
  }
}

export async function getPersonalized(req: Request, res: Response): Promise<void> {
  const userId = (req.query.user_id as string) || (req.headers['x-user-id'] as string) || 'user-123';
  const limit = Math.min(50, Math.max(1, parseInt((req.query.limit as string) ?? '10', 10)));

  try {
    const data = await recommendationEngineService.getPersonalizedForUser(userId, limit);
    res.json({ success: true, data, strategy: 'personalized_for_you', userId });
  } catch (err) {
    res.status(500).json({ success: false, message: (err as Error).message });
  }
}

export async function getTrendingNow(req: Request, res: Response): Promise<void> {
  const limit = Math.min(50, Math.max(1, parseInt((req.query.limit as string) ?? '10', 10)));

  try {
    const data = await recommendationEngineService.getTrendingNow(limit);
    res.json({ success: true, data, strategy: 'trending_now' });
  } catch (err) {
    res.status(500).json({ success: false, message: (err as Error).message });
  }
}

export async function trackViewEvent(req: Request, res: Response): Promise<void> {
  const { userId, productId, category } = req.body;
  if (!productId) {
    res.status(400).json({ success: false, message: 'productId is required' });
    return;
  }

  const effectiveUserId = userId || (req.headers['x-user-id'] as string) || 'anonymous';
  await recommendationEngineService.trackView(effectiveUserId, productId, category);
  res.status(202).json({ success: true, message: 'View event tracked' });
}

export async function trackPurchaseEvent(req: Request, res: Response): Promise<void> {
  const { userId, productId, orderId } = req.body;
  if (!productId || !orderId) {
    res.status(400).json({ success: false, message: 'productId and orderId are required' });
    return;
  }

  const effectiveUserId = userId || (req.headers['x-user-id'] as string) || 'anonymous';
  await recommendationEngineService.trackPurchase(effectiveUserId, productId, orderId);
  res.status(202).json({ success: true, message: 'Purchase event tracked' });
}

export async function getHomeFeed(req: Request, res: Response): Promise<void> {
  const userId = (req.query.user_id as string) || (req.headers['x-user-id'] as string) || 'user-123';
  const limit = Math.min(20, Math.max(1, parseInt((req.query.limit as string) ?? '8', 10)));

  try {
    const data = await recommendationEngineService.getHomeFeed(userId, limit);
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, message: (err as Error).message });
  }
}

const CLICKSTREAM_EVENT_TYPES = new Set<ClickstreamEventType>([
  'product_view',
  'category_browse',
  'add_to_cart',
  'wishlist',
]);

/** Publishes a clickstream event onto Redis Streams for the consumer to pick up. */
export async function trackClickstreamEvent(req: Request, res: Response): Promise<void> {
  const { eventType, productId, category } = req.body;
  const userId = req.body.userId || (req.headers['x-user-id'] as string);

  if (!userId || !CLICKSTREAM_EVENT_TYPES.has(eventType)) {
    res.status(400).json({
      success: false,
      message: 'userId and a valid eventType (product_view, category_browse, add_to_cart, wishlist) are required',
    });
    return;
  }

  try {
    await getStreamPublisher().publish(STREAMS.CLICKSTREAM, {
      userId,
      eventType,
      productId: productId ?? '',
      category:  category ?? '',
      timestamp: Date.now(),
    });
    res.status(202).json({ success: true, message: 'Clickstream event published' });
  } catch (err) {
    res.status(500).json({ success: false, message: (err as Error).message });
  }
}
