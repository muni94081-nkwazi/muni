import { Router } from 'express';
import { listCurrencies, listRates, getCurrency, convert, convertBulk } from '../controllers/currency.controller.js';
import { optionalAuth } from '../middleware/auth.middleware.js';

const router = Router();

// ─── Identity ─────────────────────────────────────────────────────────────────
//
// `optionalAuth`, not `requireAuth`: every route here returns the same public
// exchange-rate table to everyone and reads nothing belonging to a caller, and
// the gateway mounts /currencies publicly so a signed-out shopper can see
// prices in their own currency. Putting these behind a session would break that
// without protecting anything.
//
// They are still routed through the shared middleware rather than left with no
// identity handling at all, so a session — when one is present — is resolved
// from the gateway's verified assertion. This service's local
// auth.middleware.ts trusted raw x-user-id headers; it now re-exports the
// shared implementation, so the next route added here cannot pick up the old
// one by accident.
router.get('/currencies', optionalAuth, listCurrencies);
router.get('/currencies/rates', optionalAuth, listRates);
router.get('/currencies/convert', optionalAuth, convert);
router.post('/currencies/convert/bulk', optionalAuth, convertBulk);
router.get('/currencies/:code', optionalAuth, getCurrency);

export default router;
