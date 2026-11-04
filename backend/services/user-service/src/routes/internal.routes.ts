import { Router } from 'express';
import * as addressController from '../controllers/address.controller.js';

// ─── Service-to-service routes ──────────────────────────────────────────────
//
// Mounted under /internal so the gateway can refuse to proxy this prefix from
// the public internet in one rule, rather than auditing each handler.
const router = Router();

router.get('/users/:userId/default-address', addressController.getDefaultForUser);

export default router;
