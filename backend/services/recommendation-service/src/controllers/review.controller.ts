import type { Request, Response } from 'express';
import { reviewService } from '../services/review.service.js';
import { sellerReputationService } from '../services/reputation.service.js';

export async function createProductReview(req: Request, res: Response): Promise<void> {
  const userId = req.headers['x-user-id'] as string;
  if (!userId) {
    res.status(401).json({ success: false, message: 'Authentication required' });
    return;
  }

  const { rating, title, body, userName, userAccountCreatedAt } = req.body;
  if (!rating || !title || !body) {
    res.status(400).json({ success: false, message: 'rating, title, and body are required' });
    return;
  }

  try {
    const review = await reviewService.createProductReview({
      productId: req.params.id,
      userId,
      userName: userName || 'Customer',
      rating: Number(rating),
      title,
      body,
      userAccountCreatedAt,
      userIp: req.ip,
    });

    res.status(201).json({ success: true, data: review });
  } catch (err) {
    const status = (err as { status?: number }).status || 500;
    res.status(status).json({ success: false, message: (err as Error).message });
  }
}

export function getProductReviews(req: Request, res: Response): void {
  const productId = req.params.id;
  const includeFlagged = req.query.includeFlagged === 'true';
  const reviews = reviewService.getProductReviews(productId, includeFlagged);
  res.json({ success: true, data: reviews });
}

export async function createSellerReview(req: Request, res: Response): Promise<void> {
  const userId = req.headers['x-user-id'] as string;
  if (!userId) {
    res.status(401).json({ success: false, message: 'Authentication required' });
    return;
  }

  const { communicationRating, shippingSpeedRating, itemAccuracyRating, overallRating, body, userName } = req.body;
  if (!overallRating || !body) {
    res.status(400).json({ success: false, message: 'overallRating and body are required' });
    return;
  }

  try {
    const review = await reviewService.createSellerReview({
      sellerId: req.params.id,
      userId,
      userName: userName || 'Customer',
      communicationRating: Number(communicationRating || overallRating),
      shippingSpeedRating: Number(shippingSpeedRating || overallRating),
      itemAccuracyRating: Number(itemAccuracyRating || overallRating),
      overallRating: Number(overallRating),
      body,
    });

    res.status(201).json({ success: true, data: review });
  } catch (err) {
    const status = (err as { status?: number }).status || 500;
    res.status(status).json({ success: false, message: (err as Error).message });
  }
}

export function getSellerReviews(req: Request, res: Response): void {
  const sellerId = req.params.id;
  const reviews = reviewService.getSellerReviews(sellerId);
  res.json({ success: true, data: reviews });
}

export function getSellerReputation(req: Request, res: Response): void {
  const sellerId = req.params.id;
  const reputation = sellerReputationService.getReputation(sellerId);
  res.json({ success: true, data: reputation });
}

export function listFlaggedReviews(_req: Request, res: Response): void {
  const flagged = reviewService.getFlaggedReviews();
  res.json({ success: true, data: flagged });
}

export function moderateReview(req: Request, res: Response): void {
  const { action } = req.body as { action: 'approve' | 'reject' };
  if (!action || !['approve', 'reject'].includes(action)) {
    res.status(400).json({ success: false, message: 'Action must be "approve" or "reject"' });
    return;
  }

  try {
    const updated = reviewService.moderateReview(req.params.id, action);
    res.json({ success: true, data: updated });
  } catch (err) {
    const status = (err as { status?: number }).status || 500;
    res.status(status).json({ success: false, message: (err as Error).message });
  }
}

export function addSellerReply(req: Request, res: Response): void {
  const sellerId = (req.headers['x-user-id'] as string) || req.body.sellerId;
  const { replyBody } = req.body;
  if (!replyBody) {
    res.status(400).json({ success: false, message: 'replyBody is required' });
    return;
  }

  try {
    const updated = reviewService.addSellerReply(req.params.id, sellerId, replyBody);
    res.json({ success: true, data: updated });
  } catch (err) {
    const status = (err as { status?: number }).status || 500;
    res.status(status).json({ success: false, message: (err as Error).message });
  }
}
