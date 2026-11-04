import { Router } from 'express';
import authenticate from '../middleware/authenticate.js';
import requireRole from '../middleware/requireRole.js';
import authorizeTrustEvent from '../middleware/authorizeTrustEvent.js';
import validateBody from '../middleware/validateRequest.js';
import {
  trustEventSchema,
  setVerifiedMerchantSchema,
  updateStandingSchema,
} from '../validators/sellerTrust.validators.js';
import * as sellerTrustController from '../controllers/sellerTrust.controller.js';

const router = Router();

// Public — storefront seller badges, seller's own dashboard.
router.get('/:sellerId/trust-score', sellerTrustController.getTrustProfile);

// Seller-facing performance scorecard.
router.get('/:sellerId/scorecard', authenticate, sellerTrustController.getScorecard);

// dispute-service and buyer-protection-service report lifecycle events here,
// and a seller or an admin may write against the seller's own id.
//
// This route carried no guard at all and is publicly proxied by the gateway,
// so anyone on the internet could post events against any seller. See
// authorizeTrustEvent for who is now allowed and how each kind authenticates.
router.post(
  '/:sellerId/trust-events',
  authorizeTrustEvent,
  validateBody(trustEventSchema),
  sellerTrustController.recordTrustEvent,
);

// Admin-only — grants/revokes "Verified Merchant" badge eligibility.
router.patch(
  '/:sellerId/verify',
  authenticate,
  requireRole('ADMIN'),
  validateBody(setVerifiedMerchantSchema),
  sellerTrustController.setVerifiedMerchant,
);

// Admin-only — applies (or overrides) a seller's standing.
router.patch(
  '/:sellerId/standing',
  authenticate,
  requireRole('ADMIN'),
  validateBody(updateStandingSchema),
  sellerTrustController.updateStanding,
);

export default router;
