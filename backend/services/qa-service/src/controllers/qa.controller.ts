import type { Request, Response } from 'express';
import { qaService } from '../services/qa.service.js';

/**
 * The authenticated caller, and the only accepted source of identity.
 *
 * Each handler below used to resolve its actor from the request itself — a
 * userId or sellerId in the body or query string, falling back to the hardcoded
 * 'user-123' / 'seller-001'. That let any caller ask, answer or vote as
 * anybody, and made an unauthenticated request act as a fixed fake account. The
 * gateway strips the x-user-id header, but it cannot strip a request body or
 * query string.
 *
 * requireAuth and requireRole verify the gateway's signed identity assertion and
 * publish the result as res.locals.userId. Every route reaching this helper is
 * mounted behind one of them, see app.ts; the throw guards against a future
 * route being added without the middleware.
 */
function actingUser(res: Response): string {
  const userId = res.locals.userId as string | undefined;
  if (!userId) throw new Error('actingUser called on a route that is not behind requireAuth');
  return userId;
}

export async function askQuestion(req: Request, res: Response): Promise<void> {
  const { productId } = req.params;
  const userId = actingUser(res);
  const { userName, question } = req.body;

  if (!question) {
    res.status(400).json({ success: false, message: 'question text is required' });
    return;
  }

  try {
    const q = await qaService.askQuestion(productId, userId, userName || 'Customer', question);
    res.status(201).json({ success: true, data: q });
  } catch (err) {
    res.status(500).json({ success: false, message: (err as Error).message });
  }
}

export async function getProductQuestions(req: Request, res: Response): Promise<void> {
  const { productId } = req.params;
  try {
    const questions = await qaService.getProductQuestions(productId);
    res.json({ success: true, data: questions });
  } catch (err) {
    res.status(500).json({ success: false, message: (err as Error).message });
  }
}

export async function getQuestionById(req: Request, res: Response): Promise<void> {
  try {
    const q = await qaService.getQuestionById(req.params.id);
    if (!q) {
      res.status(404).json({ success: false, message: 'Question not found' });
      return;
    }
    res.json({ success: true, data: q });
  } catch (err) {
    res.status(500).json({ success: false, message: (err as Error).message });
  }
}

export async function answerQuestion(req: Request, res: Response): Promise<void> {
  const { id } = req.params;
  const sellerId = actingUser(res);
  const { sellerStoreName, answer } = req.body;

  if (!answer) {
    res.status(400).json({ success: false, message: 'answer text is required' });
    return;
  }

  try {
    const ans = await qaService.answerQuestion(id, sellerId, sellerStoreName || 'Official Seller', answer);
    if (!ans) {
      res.status(404).json({ success: false, message: 'Question not found' });
      return;
    }
    res.status(201).json({ success: true, data: ans });
  } catch (err) {
    res.status(500).json({ success: false, message: (err as Error).message });
  }
}

export async function voteHelpful(req: Request, res: Response): Promise<void> {
  const userId = actingUser(res);
  try {
    const ans = await qaService.voteAnswer(req.params.id, userId, 'helpful');
    res.json({ success: true, data: ans });
  } catch (err) {
    res.status(500).json({ success: false, message: (err as Error).message });
  }
}

export async function voteNotHelpful(req: Request, res: Response): Promise<void> {
  const userId = actingUser(res);
  try {
    const ans = await qaService.voteAnswer(req.params.id, userId, 'not_helpful');
    res.json({ success: true, data: ans });
  } catch (err) {
    res.status(500).json({ success: false, message: (err as Error).message });
  }
}

export async function getSellerQuestions(req: Request, res: Response): Promise<void> {
  const sellerId = actingUser(res);
  try {
    const questions = await qaService.getSellerQuestions(sellerId);
    res.json({ success: true, data: questions });
  } catch (err) {
    res.status(500).json({ success: false, message: (err as Error).message });
  }
}

export async function featureQuestion(req: Request, res: Response): Promise<void> {
  try {
    const q = await qaService.featureQuestion(req.params.id, true);
    res.json({ success: true, data: q });
  } catch (err) {
    res.status(500).json({ success: false, message: (err as Error).message });
  }
}
