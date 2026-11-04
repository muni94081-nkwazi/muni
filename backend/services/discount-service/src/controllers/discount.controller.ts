import { Request, Response } from 'express';
import { discountService } from '../services/discount.service.js';

// Handlers are async now that the service reads from Postgres rather than two
// Maps. Every response body, status code and field name is unchanged —
// including the inconsistent envelopes (some routes return a bare object or
// array, others `{success, data}`), which are part of the existing contract.

// ─── Identity ─────────────────────────────────────────────────────────────────
//
// The seller promotion handlers resolved their subject as
//
//   (req.headers['x-user-id'] as string) || res.locals.userId || 'seller-001'
//
// — the raw header AHEAD of the verified identity, then a hardcoded fallback.
// The header wins even when a signed assertion named someone else, so a valid
// session for one seller plus a typed header acted as another; and with no
// identity at all, promotions were billed to a real seller id. The routes
// carried no guard either, so this was reachable unauthenticated.
//
// Same shape advertising-service now uses: read only what the shared middleware
// verified, and let staff name a seller explicitly.

/** Roles that legitimately act across every seller's promotions. */
const STAFF_ROLES = ['ROLE_ADMIN', 'ROLE_SUPER_ADMIN'];

function callerId(res: Response): string {
  return res.locals.userId as string;
}

function isStaff(res: Response): boolean {
  const roles = (res.locals.roles as string[]) ?? [];
  return Boolean(res.locals.callingService) || roles.some((r) => STAFF_ROLES.includes(r));
}

/**
 * Whose promotions this request is about: the caller's own, unless they are
 * staff and named someone. `?sellerId=` from anyone else is ignored rather than
 * rejected, so a stale link narrows to the caller instead of erroring.
 */
function scopedSellerId(req: Request, res: Response): string {
  const requested = req.query.sellerId as string | undefined;
  return isStaff(res) && requested ? requested : callerId(res);
}

export const validateDiscount = async (req: Request, res: Response) => {
  try {
    const result = await discountService.validateCode(req.body);
    res.json(result);
  } catch (error: any) {
    res.status(400).json({ valid: false, message: error.message });
  }
};

export const applyDiscount = async (req: Request, res: Response) => {
  try {
    // A caller that omits orderId gets a fresh key per attempt, so its retries
    // are NOT idempotent. Preserved deliberately — see the follow-up note in
    // discount.service.applyCode.
    const orderId = req.body.orderId || `order-${Date.now()}`;
    const result = await discountService.applyCode(req.body, orderId);
    res.json(result);
  } catch (error: any) {
    res.status(400).json({ valid: false, message: error.message });
  }
};

/**
 * POST /discounts/reverse — internal, called by the checkout saga when a
 * checkout fails after the discount was consumed.
 */
export const reverseDiscount = async (req: Request, res: Response) => {
  try {
    const { code, userId, orderId } = req.body;
    const result = await discountService.reverseCode(code, userId, orderId);
    res.json(result);
  } catch (error: any) {
    res.status(400).json({ reversed: false, message: error.message });
  }
};

export const getActiveDiscounts = async (_req: Request, res: Response) => {
  res.json(await discountService.getActive());
};

export const getFlashSales = async (_req: Request, res: Response) => {
  res.json(await discountService.getFlashSales());
};

export const scheduleFlashSale = async (req: Request, res: Response) => {
  const sellerId = callerId(res);
  try {
    const flashSale = await discountService.create({
      ...req.body,
      type: 'FLASH_SALE',
      applicableSellers: [sellerId],
    }, sellerId);
    res.status(201).json({ success: true, data: flashSale });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
};

export const createBogo = async (req: Request, res: Response) => {
  const sellerId = callerId(res);
  const { productId, discountPercentage } = req.body;
  if (!productId) {
    res.status(400).json({ success: false, message: 'productId is required' });
    return;
  }
  try {
    const bogo = await discountService.createBogoPromotion(sellerId, productId, discountPercentage);
    res.status(201).json({ success: true, data: bogo });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
};

export const createFreeShipping = async (req: Request, res: Response) => {
  const sellerId = callerId(res);
  const { minOrderAmount } = req.body;
  try {
    const promo = await discountService.createFreeShippingPromotion(sellerId, minOrderAmount);
    res.status(201).json({ success: true, data: promo });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
};

export const getSellerPromotions = async (req: Request, res: Response) => {
  const sellerId = scopedSellerId(req, res);
  const promos = await discountService.getSellerPromotions(sellerId);
  res.json({ success: true, data: promos });
};

// Admin Endpoints
export const createDiscount = async (req: Request, res: Response) => {
  try {
    const createdBy = res.locals.userId || 'system';
    const discount = await discountService.create(req.body, createdBy);
    res.status(201).json(discount);
  } catch (error: any) {
    if (error.name === 'ZodError') {
      res.status(422).json({ message: 'Validation failed', issues: error.issues });
    } else {
      res.status(400).json({ message: error.message });
    }
  }
};

export const getAllDiscounts = async (_req: Request, res: Response) => {
  res.json(await discountService.getAll());
};

export const getDiscountById = async (req: Request, res: Response) => {
  const discount = await discountService.getById(req.params.id);
  if (!discount) {
    res.status(404).json({ message: 'Discount not found' });
    return;
  }
  res.json(discount);
};

export const updateDiscount = async (req: Request, res: Response) => {
  try {
    const discount = await discountService.update(req.params.id, req.body);
    res.json(discount);
  } catch (error: any) {
    if (error.name === 'ZodError') {
      res.status(422).json({ message: 'Validation failed', issues: error.issues });
    } else {
      res.status(400).json({ message: error.message });
    }
  }
};

export const deactivateDiscount = async (req: Request, res: Response) => {
  try {
    const discount = await discountService.deactivate(req.params.id);
    res.json(discount);
  } catch (error: any) {
    res.status(404).json({ message: error.message });
  }
};

export const getDiscountUsage = async (req: Request, res: Response) => {
  try {
    const usage = await discountService.getUsage(req.params.id);
    res.json(usage);
  } catch (error: any) {
    res.status(404).json({ message: error.message });
  }
};
