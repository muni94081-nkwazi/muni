import { Router } from 'express';
import { claimPackage, getActiveDeliveries, logSignature, registerRider, updateDeliveryStatus } from '../controllers/rider.controller.js';
import { requireAuth, requireRole } from '../middleware/auth.middleware.js';

const router = Router();

router.post('/rider/profile', requireAuth, requireRole('ROLE_RIDER'), registerRider);
router.post('/rider/packages/claim', requireAuth, requireRole('ROLE_RIDER'), claimPackage);
router.patch('/rider/packages/:id/status', requireAuth, requireRole('ROLE_RIDER'), updateDeliveryStatus);
router.post('/rider/packages/:id/signature', requireAuth, requireRole('ROLE_RIDER'), logSignature);
router.get('/rider/deliveries', requireAuth, requireRole('ROLE_RIDER'), getActiveDeliveries);

export default router;
