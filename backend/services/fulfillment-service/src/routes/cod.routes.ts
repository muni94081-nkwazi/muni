import { Router } from 'express';
import { collectCash, flagCod, getLedger, listPendingReconciliations, reconcileLedger } from '../controllers/cod.controller.js';
import { requireAuth, requireRole } from '../middleware/auth.middleware.js';

const router = Router();

// ─── Cash on delivery ─────────────────────────────────────────────────────────
//
// These routes decide how much cash a rider must collect on a doorstep and
// record how much came back, so identity alone is never enough on them —
// ownership is settled in the controller/service beneath each one.
//
// `flagCod` carried `requireAuth` and nothing else: any authenticated caller,
// a customer included, could flag any seller's parcel as COD with an
// `amountDue` of their choosing. That figure is what a rider's collection is
// measured against. The ownership check now lives in cod.service.flagAsCod,
// which takes the acting identity rather than a bare id.
//
// `getLedger` admits riders, and took `:riderId` as proof of which rider was
// asking — so one rider could read another's takings and variance. The
// controller now checks the path against the verified caller.
router.patch('/fulfillment/:id/cod', requireAuth, flagCod);
router.post('/fulfillment/:id/cod/collect', requireAuth, requireRole('ROLE_RIDER'), collectCash);
router.get('/cod/ledger/:riderId/:date', requireAuth, requireRole('ROLE_ADMIN', 'ROLE_OPS', 'ROLE_FINANCE', 'ROLE_RIDER'), getLedger);
router.post('/cod/ledger/:riderId/:date/reconcile', requireAuth, requireRole('ROLE_ADMIN', 'ROLE_OPS', 'ROLE_FINANCE'), reconcileLedger);
router.get('/cod/reconciliations/pending', requireAuth, requireRole('ROLE_ADMIN', 'ROLE_OPS', 'ROLE_FINANCE'), listPendingReconciliations);

export default router;
