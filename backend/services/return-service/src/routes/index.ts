import { Router } from 'express';
import * as controller from '../controllers/return.controller.js';
import { requireAuth, requireRole } from '../middleware/auth.middleware.js';

const router = Router();

// Customer routes.
//
// requireAuth was imported here but wired to nothing, so all four ran
// unauthenticated and the controllers fell through to a hardcoded 'user-123'.
// The gateway does mount this service behind auth('/returns'), but a service
// that is only safe because something upstream remembered to check is one
// misconfiguration from open — and the ownership checks in the service need a
// trustworthy identity to compare against.
router.get('/returns/guarantee-status/:orderId', requireAuth, controller.checkGuaranteeStatus);

router.post('/returns', requireAuth, controller.createReturn);
router.get('/returns', requireAuth, controller.getUserReturns);
router.get('/returns/:id', requireAuth, controller.getReturn);
router.patch('/returns/:id/cancel', requireAuth, controller.cancelReturn);

// API v1 prefixed aliases. app.ts already mounts this router under /api/v1, so
// these resolve at /api/v1/api/v1/... and never match a real request. Left in
// place — removing them is not this task's business — but guarded all the same.
router.get('/api/v1/returns/guarantee-status/:orderId', requireAuth, controller.checkGuaranteeStatus);
router.post('/api/v1/returns', requireAuth, controller.createReturn);
router.get('/api/v1/returns', requireAuth, controller.getUserReturns);
router.get('/api/v1/returns/:id', requireAuth, controller.getReturn);

router.get('/seller/returns', requireAuth, requireRole('ROLE_SELLER'), controller.getSellerReturns);
router.patch('/seller/returns/:id', requireAuth, requireRole('ROLE_SELLER'), controller.updateSellerReturn);
router.get('/admin/returns', requireAuth, requireRole('ROLE_ADMIN'), controller.getAdminReturns);
router.patch('/admin/returns/:id/status', requireAuth, requireRole('ROLE_ADMIN'), controller.updateAdminReturn);

export default router;
