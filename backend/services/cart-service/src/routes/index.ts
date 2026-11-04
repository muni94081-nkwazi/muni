import { Router } from 'express';
import { z } from 'zod';
import * as controller from '../controllers/cart.controller.js';
import {
  AddItemSchema,
  UpdateItemQuantitySchema,
  ApplyCouponSchema,
  MergeCartSchema,
} from '../models/cart.model.js';
import { validateBody, validateParams } from '../../../../shared/http/validation.middleware.js';
import { optionalAuth, requireAuth, requireRole } from '../middleware/auth.middleware.js';

export const router = Router();

// ─── Identity ─────────────────────────────────────────────────────────────────
//
// `optionalAuth` on the cart routes, not `requireAuth`: /cart is public on
// purpose so a guest can fill a basket before signing in, and guests are keyed
// by the X-Cart-Session header instead (see resolveIdentity in the controller).
// What it changes is where identity comes from — the verified assertion in
// res.locals rather than a raw x-user-id header the caller could type.
//
// The three recovery routes below had no guard of any kind. They are not cart
// routes: two are the abandoned-cart dashboard, and the third returns a stored
// cart's contents and the id of the user it belongs to.

// ─── Validation ───────────────────────────────────────────────────────────────
//
// The schemas already existed and the controllers already called `.parse()` —
// but inside the same try/catch as the service call, so a genuine failure
// (Redis down, cart-service bug) was reported to the customer as a 400 "your
// request is invalid", and a ZodError's raw `.message` — a JSON dump of every
// issue plus the input — went back as the user-facing string.
//
// Validating here fixes both: only validation can 400, the response carries a
// clean field→messages map, and handlers receive parsed, stripped data.

/** Route params that address a cart entity. */
const ItemIdParams = z.object({
  itemId: z.string().trim().min(1, 'itemId is required'),
});

const CartIdParams = z.object({
  cartId: z.string().trim().min(1, 'cartId is required'),
});

router.get('/',                    optionalAuth, controller.getCart);
router.post('/items',              optionalAuth, validateBody(AddItemSchema),             controller.addItem);
router.patch('/items/:itemId',     optionalAuth, validateParams(ItemIdParams),
                                   validateBody(UpdateItemQuantitySchema),  controller.updateItem);
router.delete('/items/:itemId',    optionalAuth, validateParams(ItemIdParams),            controller.removeItem);
router.delete('/',                 optionalAuth, controller.clearCart);
router.post('/coupon',             optionalAuth, validateBody(ApplyCouponSchema),         controller.applyCoupon);
router.delete('/coupon',           optionalAuth, controller.removeCoupon);
// Folding a guest basket into an account is the one cart route that genuinely
// needs a session — there is no account to merge into without one.
router.post('/merge',              requireAuth,  validateBody(MergeCartSchema),           controller.mergeCart);

// Abandoned Cart Recovery (Phase 15 Feature 4)
const requireAdmin = requireRole('ROLE_ADMIN', 'ROLE_SUPER_ADMIN');

// Every abandoned basket on the platform, with the user id attached to each.
router.get('/admin/carts/abandoned',  requireAdmin, controller.getAbandonedCarts);
// Aggregate recovery metrics — a business figure, not a shopper's own data.
router.get('/recovery-stats',         requireAdmin, controller.getRecoveryStats);
// Customer-facing, from a reminder link: returns the stored cart's contents and
// the id of the user it belongs to, so the caller has to be that user.
router.post('/restore/:cartId',       requireAuth,  validateParams(CartIdParams), controller.restoreCart);
