import { Router } from 'express';
import { proxy }       from '../utils/proxy.js';
import { requireRole } from '../middleware/auth.middleware.js';

// ─── Seller Routes (/api/v1/seller/*) ────────────────────────────────────────
// All routes require ROLE_SELLER, ROLE_ADMIN, or ROLE_SUPER_ADMIN.

export function sellerRoutes(targets: Record<string, string>): Router {
  const router = Router();

  router.use(requireRole('ROLE_SELLER', 'ROLE_ADMIN', 'ROLE_SUPER_ADMIN'));

  const route = (prefix: string, target: string) =>
    router.use(prefix, (req, res, next) => proxy(req, res, target).catch(next));

  route('/products',    targets.product);      // create / update / delete own products
  route('/orders',      targets.order);        // view orders for seller's products
  route('/analytics',   targets.analytics);    // seller-scoped sales analytics
  route('/payouts',     targets.payment);      // payout history and requests
  route('/finance',     targets.payment);      // earnings, transactions, withdrawal requests
  route('/inventory',   targets.inventory);    // stock management
  route('/returns',     targets.returns);      // manage return requests
  route('/disputes',    targets.dispute);      // respond to disputes
  route('/fulfillment', targets.fulfillment);  // manage fulfillment / tracking
  route('/media',       targets.media);        // product image uploads
  route('/marketplace/my-store', targets.marketplace); // storefront management
  route('/discounts',   targets.discount);     // seller discounts + promotions
  route('/scorecard',   targets.user);         // performance metrics + standing (user-service)
  route('/support',     targets.support);      // seller helpdesk tickets
  route('/tax',         targets.tax);          // tax invoices + VAT summary

  return router;
}
