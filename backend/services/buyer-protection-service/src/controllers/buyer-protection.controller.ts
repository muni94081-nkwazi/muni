import type { Request, Response } from 'express';
import { buyerProtectionService, ClaimOrderError } from '../services/buyer-protection.service.js';

// ─── Buyer protection controller ──────────────────────────────────────────────
//
// Identity comes from `res.locals`, where the shared auth middleware puts it
// after verifying the gateway's signed assertion (see app.ts). It used to be
// read as:
//
//   const userId = (req.headers['x-user-id'] as string) || req.body.userId || 'user-123';
//
// — an unverified header, then the attacker's own request body, then a literal
// user id that exists in the seed data. No route on this service had any
// authentication at all, so every claim was filed, listed and resolved as
// whoever the caller said they were, and with no identity at all it was
// 'user-123'. Reading anything but `res.locals.userId` here reopens that.

export function getPolicy(_req: Request, res: Response): void {
  const policy = buyerProtectionService.getPolicy();
  res.json({ success: true, data: policy });
}

export function checkEligibility(req: Request, res: Response): void {
  const { orderId, productId, category, orderAmountUGX, orderDeliveredAt } = req.body;
  if (!productId || !category || orderAmountUGX === undefined) {
    res.status(400).json({ success: false, message: 'productId, category, and orderAmountUGX are required' });
    return;
  }

  const result = buyerProtectionService.checkEligibility({
    orderId,
    productId,
    category,
    orderAmountUGX: Number(orderAmountUGX),
    orderDeliveredAt,
  });

  res.json({ success: true, data: result });
}

export function getBadgeStatus(req: Request, res: Response): void {
  const productId = String(req.params.productId);
  const badge = buyerProtectionService.getBadgeStatus(productId);
  res.json({ success: true, data: badge });
}

export async function fileClaim(req: Request, res: Response): Promise<void> {
  const userId = res.locals.userId as string;
  const { orderId, productId, reason, claimAmountUGX } = req.body;

  if (!orderId || !productId || !reason || !claimAmountUGX) {
    res.status(400).json({ success: false, message: 'orderId, productId, reason, and claimAmountUGX are required' });
    return;
  }

  try {
    const claim = await buyerProtectionService.fileClaim({
      orderId,
      userId,
      productId,
      reason,
      claimAmountUGX: Number(claimAmountUGX),
    });
    res.status(201).json({ success: true, data: claim });
  } catch (err) {
    // An order that is not the claimant's own answers exactly like one that
    // does not exist (404, from the shared verification client), so this cannot
    // be used to discover which order ids are real.
    if (err instanceof ClaimOrderError) {
      res.status(err.status).json({ success: false, message: err.message });
      return;
    }
    res.status(500).json({ success: false, message: (err as Error).message });
  }
}

/** The caller's own claims. A userId in the query string is ignored. */
export async function getUserClaims(_req: Request, res: Response): Promise<void> {
  const userId = res.locals.userId as string;
  try {
    const claims = await buyerProtectionService.getClaimsForUser(userId);
    res.json({ success: true, data: claims });
  } catch (err) {
    res.status(500).json({ success: false, message: (err as Error).message });
  }
}

export async function getAllClaims(_req: Request, res: Response): Promise<void> {
  try {
    const claims = await buyerProtectionService.getAllClaims();
    res.json({ success: true, data: claims });
  } catch (err) {
    res.status(500).json({ success: false, message: (err as Error).message });
  }
}

export async function resolveClaim(req: Request, res: Response): Promise<void> {
  const id = String(req.params.id);
  const { status, resolutionNotes } = req.body;
  if (!['APPROVED', 'REJECTED'].includes(status)) {
    res.status(400).json({ success: false, message: 'Status must be APPROVED or REJECTED' });
    return;
  }

  try {
    const claim = await buyerProtectionService.resolveClaim(id, status, resolutionNotes);
    res.json({ success: true, data: claim });
  } catch (err) {
    res.status(500).json({ success: false, message: (err as Error).message });
  }
}
