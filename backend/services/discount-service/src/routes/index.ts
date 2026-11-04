import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, requireRole } from '../middleware/auth.middleware.js';
import * as discountController from '../controllers/discount.controller.js';
import {
  createDiscountSchema,
  updateDiscountSchema,
  validateDiscountSchema,
  applyDiscountSchema,
  reverseDiscountSchema,
} from '../models/discount.model.js';
import { validateBody, validateParams } from '../../../../shared/http/validation.middleware.js';

const router = Router();

// ─── Validation ───────────────────────────────────────────────────────────────
//
// The schemas in models/discount.model.ts already existed but nothing called
// them — every handler read `req.body` raw. That let a PERCENTAGE code be
// created with `value: 500` (a 500% discount, i.e. a negative order total) and
// an `expiresAt` already in the past (a code that looks live in the admin list
// and fails at the till). Both are now refused at the edge.

const IdParams = z.object({
  id: z.string().trim().min(1, 'id is required'),
});

/** Seller flash sale: the seller and type are stamped by the handler. */
const FlashSaleSchema = z.object({
  code: z.string().trim().toUpperCase().min(3).max(64),
  value: z.number().min(0).max(100),
  minOrderAmount: z.number().min(0).optional(),
  maxUsageCount: z.number().int().min(1).optional(),
  perUserLimit: z.number().int().min(1).optional(),
  applicableProducts: z.array(z.string()).optional(),
  applicableCategories: z.array(z.string()).optional(),
  startsAt: z.coerce.date().optional(),
  expiresAt: z.coerce.date(),
}).refine(
  (data) => data.expiresAt.getTime() > Date.now(),
  { path: ['expiresAt'], message: 'Expiry must be in the future' },
);

const BogoSchema = z.object({
  productId: z.string().trim().min(1, 'productId is required'),
  // A BOGO is expressed as a percentage off the second unit, so the same
  // 0–100 bound applies.
  discountPercentage: z.number().min(0).max(100).optional(),
});

const FreeShippingSchema = z.object({
  minOrderAmount: z.number().min(0).optional(),
});

// ─── Seller Promotional Tools (Phase 17 Feature 3) ───────────────────────────
//
// These four had no guard at all, and the controllers resolved the seller as
// `(x-user-id) ?? res.locals.userId ?? 'seller-001'` — the raw header ahead of
// the verified identity, then a hardcoded fallback. So an unauthenticated
// caller could schedule a flash sale, a BOGO or free shipping billed to
// seller-001, and a caller holding a valid session for one seller could act as
// another by adding a header.
//
// Writes are a seller action; the read is scoped to the caller in the
// controller. Admin roles are included on the writes so support can act for a
// seller, matching the gateway's own seller router.
const requireSeller = requireRole('ROLE_SELLER', 'ROLE_ADMIN', 'ROLE_SUPER_ADMIN');

router.post('/api/v1/discounts/flash-sales',  requireSeller, validateBody(FlashSaleSchema),    discountController.scheduleFlashSale);
router.post('/api/v1/discounts/bogo',         requireSeller, validateBody(BogoSchema),         discountController.createBogo);
router.post('/api/v1/discounts/free-shipping', requireSeller, validateBody(FreeShippingSchema), discountController.createFreeShipping);
router.get('/api/v1/discounts/seller/promotions', requireAuth, discountController.getSellerPromotions);

// Public routes
router.get('/api/v1/discounts/active', discountController.getActiveDiscounts);
router.get('/api/v1/discounts/flash-sales', discountController.getFlashSales);

// Service/Internal routes
router.post('/api/v1/discounts/validate', validateBody(validateDiscountSchema), discountController.validateDiscount);
router.post('/api/v1/discounts/apply',    validateBody(applyDiscountSchema),    discountController.applyDiscount);
// Compensation for a checkout that failed after the discount was consumed.
router.post('/api/v1/discounts/reverse',  validateBody(reverseDiscountSchema),  discountController.reverseDiscount);

// Admin routes
router.use('/api/v1/admin/discounts', requireAuth, requireRole('ROLE_ADMIN'));
router.post('/api/v1/admin/discounts',        validateBody(createDiscountSchema), discountController.createDiscount);
router.get('/api/v1/admin/discounts',         discountController.getAllDiscounts);
router.get('/api/v1/admin/discounts/:id',     validateParams(IdParams), discountController.getDiscountById);
router.patch('/api/v1/admin/discounts/:id',   validateParams(IdParams), validateBody(updateDiscountSchema), discountController.updateDiscount);
router.delete('/api/v1/admin/discounts/:id',  validateParams(IdParams), discountController.deactivateDiscount);
router.get('/api/v1/admin/discounts/:id/usage', validateParams(IdParams), discountController.getDiscountUsage);

export default router;
