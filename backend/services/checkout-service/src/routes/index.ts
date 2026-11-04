import { Router } from 'express';
import { initiateCheckout, getSession, confirmPayment, getHistory, cancelCheckout } from '../controllers/checkout.controller.js';
import { requireAuth } from '../middleware/auth.middleware.js';
import { idempotent } from '../../../../shared/http/idempotency.middleware.js';
import { getIdempotencyStore } from '../repositories/idempotency.store.js';

const router = Router();

// ─── Routes ───────────────────────────────────────────────────────────────────
//
// The two routes that move money require an Idempotency-Key. Without one a
// retry — from the user, the gateway, or a dropped mobile connection — creates
// a second payment against the same cart.
//
// Reads and cancel are naturally safe to repeat and are not keyed.

const idempotency = idempotent(getIdempotencyStore());

router.post('/checkout/initiate',        requireAuth, idempotency, initiateCheckout);
router.post('/checkout/:sessionId/confirm', requireAuth, idempotency, confirmPayment);

router.get('/checkout/history',          requireAuth, getHistory);
router.get('/checkout/:sessionId',       requireAuth, getSession);
router.post('/checkout/:sessionId/cancel', requireAuth, cancelCheckout);

export default router;
