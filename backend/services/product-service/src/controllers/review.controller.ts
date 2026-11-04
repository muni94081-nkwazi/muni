import type { Request, Response } from 'express';
import * as reviewService from '../services/review.service.js';

// GET /api/v1/products/:id/reviews
export async function list(req: Request, res: Response): Promise<void> {
  const productId = req.params.id;
  const page = parseInt((req.query.page as string) ?? '0', 10);
  const size = parseInt((req.query.size as string) ?? '10', 10);

  try {
    const result = await reviewService.list(productId, page, size);
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(500).json({ success: false, error: (err as Error).message });
  }
}

// POST /api/v1/products/:id/reviews
export async function create(req: Request, res: Response): Promise<void> {
  const productId = req.params.id;
  const userId    = req.headers['x-user-id'] as string;

  if (!userId) {
    res.status(401).json({ success: false, error: 'Authentication required' });
    return;
  }

  try {
    const review = await reviewService.add(productId, userId, req.body);
    res.status(201).json({ success: true, data: review });
  } catch (err: unknown) {
    if ((err as { name?: string }).name === 'ZodError') {
      res.status(422).json({ success: false, error: 'Validation failed', details: (err as { issues: unknown }).issues });
      return;
    }
    res.status(500).json({ success: false, error: (err as Error).message });
  }
}

// POST /api/v1/reviews/:reviewId/helpful
export async function helpful(req: Request, res: Response): Promise<void> {
  try {
    const review = await reviewService.markHelpful(req.params.reviewId);
    res.json({ success: true, data: review });
  } catch (err) {
    res.status(500).json({ success: false, error: (err as Error).message });
  }
}
