import { Router } from 'express';
import {
  getStores,
  getStoreBySlug,
  getMyStore,
  createStore,
  updateStore,
  getStoreTrustBadges,
  getProductTrustBadges,
  getSellerTier,
  evaluateSellerTier,
} from '../controllers/marketplace.controller.js';
import { requireAuth, requireRole } from '../middleware/auth.middleware.js';

const router = Router();

// Seller Tier Progress & Evaluation (Phase 17 Feature 2)
router.get('/marketplace/seller-tier/:sellerId', requireAuth, getSellerTier);
router.post('/marketplace/seller-tier/evaluate', requireAuth, evaluateSellerTier);
router.get('/api/v1/marketplace/seller-tier/:sellerId', requireAuth, getSellerTier);
router.post('/api/v1/marketplace/seller-tier/evaluate', requireAuth, evaluateSellerTier);

// Trust Badges & Trust Score (Phase 16 Feature 5)
router.get('/marketplace/stores/:id/trust-badges', getStoreTrustBadges);
router.get('/marketplace/products/:id/trust-badges', getProductTrustBadges);
router.get('/api/v1/marketplace/stores/:id/trust-badges', getStoreTrustBadges);
router.get('/api/v1/marketplace/products/:id/trust-badges', getProductTrustBadges);

router.get('/marketplace/stores', getStores);
router.get('/marketplace/stores/:slug', getStoreBySlug);

// Seller routes
router.get('/marketplace/my-store', requireAuth, requireRole('ROLE_SELLER'), getMyStore);
router.post('/marketplace/my-store', requireAuth, requireRole('ROLE_SELLER'), createStore);
router.patch('/marketplace/my-store', requireAuth, requireRole('ROLE_SELLER'), updateStore);

// Same handlers under the /seller prefix the gateway actually forwards.
//
// api-gateway's seller.routes.ts has `route('/marketplace/my-store',
// targets.marketplace)`, and proxy.ts forwards req.originalUrl VERBATIM — so
// this service receives "/api/v1/seller/marketplace/my-store". Without these
// three lines that 404s, which is why seller-center's storefront page was
// backed by a fixture. product-service owns its own /api/v1/seller/products
// routes for exactly the same reason.
router.get('/seller/marketplace/my-store', requireAuth, requireRole('ROLE_SELLER'), getMyStore);
router.post('/seller/marketplace/my-store', requireAuth, requireRole('ROLE_SELLER'), createStore);
router.patch('/seller/marketplace/my-store', requireAuth, requireRole('ROLE_SELLER'), updateStore);

export default router;
