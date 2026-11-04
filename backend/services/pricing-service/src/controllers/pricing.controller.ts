import type { Request, Response } from 'express';
import { pricingService } from '../services/pricing.service.js';

// ─── Pricing controller ───────────────────────────────────────────────────────
//
// Identity comes from `res.locals`, where the shared auth middleware puts it
// after verifying the gateway's signed assertion (see app.ts). Both seller
// handlers here used to resolve it as an unverified `x-user-id`, then the
// caller's own request body, then a literal 'seller-001' — and no route had any
// authentication, while the gateway published the whole /pricing prefix with
// pub(). A pricing rule decides what a seller's product sells for.

/** Roles that legitimately act across every seller's pricing. */
const STAFF_ROLES = ['ROLE_ADMIN', 'ROLE_SUPER_ADMIN'];

function callerId(res: Response): string {
  return res.locals.userId as string;
}

function isStaff(res: Response): boolean {
  const roles = (res.locals.roles as string[]) ?? [];
  return Boolean(res.locals.callingService) || roles.some((r) => STAFF_ROLES.includes(r));
}

export async function createRule(req: Request, res: Response): Promise<void> {
  // A seller may only write rules against themselves; staff may write one for
  // any seller. `sellerId` in the body was previously believed from anyone.
  const sellerId = isStaff(res) && req.body.sellerId ? String(req.body.sellerId) : callerId(res);
  const { productId, ruleType, targetPrice, minPriceFloor, currentPrice } = req.body;

  if (!productId || !ruleType || !minPriceFloor) {
    res.status(400).json({ success: false, message: 'productId, ruleType, and minPriceFloor are required' });
    return;
  }

  try {
    const rule = await pricingService.createRule(sellerId, productId, ruleType, targetPrice || 4000000, minPriceFloor, currentPrice || 4200000);
    res.status(201).json({ success: true, data: rule });
  } catch (err) {
    res.status(500).json({ success: false, message: (err as Error).message });
  }
}

export async function getRules(req: Request, res: Response): Promise<void> {
  // The caller's own rules, unless staff named someone. `?sellerId=` used to be
  // believed from anyone, so a seller could read a competitor's price floors —
  // the number they will not go below, which is the one figure you would want
  // before undercutting them.
  const requested = req.query.sellerId as string | undefined;
  const sellerId = isStaff(res) && requested ? requested : callerId(res);

  try {
    const rules = await pricingService.getRules(sellerId);
    res.json({ success: true, data: rules });
  } catch (err) {
    res.status(500).json({ success: false, message: (err as Error).message });
  }
}

export async function getCompetitorPrices(req: Request, res: Response): Promise<void> {
  const { id } = req.params;
  try {
    const comp = await pricingService.getCompetitorPrices(id);
    res.json({ success: true, data: comp });
  } catch (err) {
    res.status(500).json({ success: false, message: (err as Error).message });
  }
}

/**
 * Re-price every active rule on the platform.
 *
 * Staff and internal callers only. `applyAutoPricingRules()` walks EVERY
 * seller's active rules, not the caller's — there is no per-seller variant — so
 * this is a platform-wide job, and it was a `pub()`-mounted POST that anyone on
 * the internet could fire. Repeated, it walks every competitor price on the
 * platform and rewrites prices toward the floor.
 */
export async function applyRules(_req: Request, res: Response): Promise<void> {
  if (!isStaff(res)) {
    res.status(403).json({
      success: false,
      message: 'Applying pricing rules is a platform-wide operation.',
    });
    return;
  }

  try {
    const histories = await pricingService.applyAutoPricingRules();
    res.json({ success: true, data: histories });
  } catch (err) {
    res.status(500).json({ success: false, message: (err as Error).message });
  }
}

export async function getHistory(req: Request, res: Response): Promise<void> {
  const { productId } = req.params;
  try {
    const history = await pricingService.getPriceHistory(productId);
    res.json({ success: true, data: history });
  } catch (err) {
    res.status(500).json({ success: false, message: (err as Error).message });
  }
}
