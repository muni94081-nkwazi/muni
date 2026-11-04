import { Router } from 'express';
import * as controller from '../controllers/fraud.controller.js';
import { requireAuth, requireRole } from '../middleware/auth.middleware.js';

const router = Router();

router.post('/fraud/score', controller.scoreTransaction);
router.post('/fraud/report', requireAuth, controller.reportFraud);
router.get('/admin/fraud/cases', requireAuth, requireRole('ROLE_ADMIN'), controller.listCases);
router.patch('/admin/fraud/cases/:id', requireAuth, requireRole('ROLE_ADMIN'), controller.updateCase);
router.get('/admin/fraud/stats', requireAuth, requireRole('ROLE_ADMIN'), controller.getStats);

export default router;
