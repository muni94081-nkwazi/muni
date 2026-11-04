import { Router } from 'express';
import * as controller from '../controllers/dispute.controller.js';
import {
  requireAuth,
  requireRole,
} from '../../../../shared/http/service-auth.middleware.js';

// Mounted at /api/v1 in app.ts — keep these paths relative to that.
//
// Every route here used to be open. The service shipped with a local
// auth.middleware.ts that nothing imported, so a claim could be filed, read,
// answered, escalated or arbitrated by any caller who could reach the port —
// and the controllers filled in 'user-123', 'seller-001' or 'admin-001' when no
// identity was supplied at all.
//
// The gateway does authenticate /disputes, but that is one hop away and one
// config change from being untrue. Ownership also has to be decided where the
// data is, not where the request happened to enter.
//
// The guards come from the shared middleware rather than the local copy: with
// INTERNAL_IDENTITY_SECRET set it verifies the gateway's signed assertion, so
// forging identity needs the secret rather than knowledge of a header name.
// The local file trusted `x-user-id` outright, which is no defence at all
// against the direct-access case that motivates service-level guards.
export const router = Router();

router.post('/disputes',                     requireAuth, controller.createDispute);
router.get('/disputes/mine',                 requireAuth, controller.getMyDisputes);
router.get('/disputes/:id',                  requireAuth, controller.getDisputeById);
router.post('/disputes/:id/evidence',        requireAuth, controller.addEvidence);

// Seller-side actions. The service layer already refused a resolution from
// anyone but the seller named on the dispute; what defeated it was the
// controller taking the seller id from `req.body.sellerId`, so the check
// compared the attacker's claim against itself.
router.post('/disputes/:id/respond',         requireRole('ROLE_SELLER'), controller.sellerRespond);
router.post('/disputes/:id/resolve',         requireRole('ROLE_SELLER'), controller.sellerResolve);

router.post('/disputes/:id/escalate',        requireAuth, controller.escalateToArbitration);

const requireAdmin = requireRole('ROLE_ADMIN', 'ROLE_SUPER_ADMIN');

router.patch('/admin/disputes/:id/resolve',  requireAdmin, controller.resolveDispute);
router.get('/admin/disputes/dashboard',      requireAdmin, controller.getDashboardMetrics);
router.get('/admin/disputes',                requireAdmin, controller.listDisputes);
