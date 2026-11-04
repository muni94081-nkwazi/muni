import { Router } from 'express';
import { calculateTax, getRates, getCountryRates, validateTaxNumber } from '../controllers/tax.controller.js';
import * as invoice from '../controllers/invoice.controller.js';
import {
  requireAuth,
  requireRole,
  requireInternalCaller,
  optionalAuth,
} from '../middleware/auth.middleware.js';

const router = Router();

// ─── Guards ───────────────────────────────────────────────────────────────────
//
// Every route here used to be mounted bare. The local auth.middleware.ts was
// never imported, so `res.locals.userId` was always undefined and the invoice
// endpoints decided what to return from `?buyerId=` / `?sellerId=` — the
// caller's own query string. Any authenticated session on the platform could
// read anyone's invoices, and an unauthenticated one could too, since the
// gateway only guards /tax/calculate and /tax/invoices on the customer router.
//
// Identity now comes from the shared middleware, and the controllers scope
// every query to it (see invoice.controller.ts for the access matrix).

const requireAdmin = requireRole('ROLE_ADMIN', 'ROLE_SUPER_ADMIN');

// ── Rate lookup & calculation (stateless) ───────────────────────────────────
//
// Rates stay public: the gateway mounts /tax/rates with pub() because a
// signed-out shopper sees tax-inclusive prices, and these read nothing stored —
// they are the VAT tables in models/tax.model.ts. `optionalAuth` still resolves
// a session when one is present rather than ignoring it.
router.get('/tax/rates', optionalAuth, getRates);
router.get('/tax/rates/:countryCode', optionalAuth, getCountryRates);

// Quoted per basket during checkout. checkout-service calls it with a signed
// assertion for the shopper (see its clients/service.client.ts), and the
// gateway authenticates the browser path, so requiring identity here costs
// nothing and keeps an unauthenticated caller off it.
router.post('/tax/calculate', requireAuth, calculateTax);
router.post('/tax/validate', requireAuth, validateTaxNumber);

// ── Tax invoices (persisted) ────────────────────────────────────────────────
//
// Ordering: the literal sub-paths are registered before /tax/invoices/:id so
// "number" and a seller's VAT summary aren't captured as invoice ids.
//
// Issuing is internal-only: an invoice is a legal document minted by the order
// flow once a supply has happened, with a gap-free sequential number. It is not
// something a user asks for, and a caller who could POST one could mint
// documents in a seller's name against a TIN they do not own.
router.post('/tax/invoices', requireInternalCaller, invoice.issue);

router.get('/tax/invoices', requireAuth, invoice.list);
router.get('/tax/invoices/number/:invoiceNumber', requireAuth, invoice.getByNumber);
router.get('/tax/invoices/:id', requireAuth, invoice.getById);
/** Printable HTML — the browser turns it into a PDF. */
router.get('/tax/invoices/:id/render', requireAuth, invoice.render);
/** Corrections are issued as a credit note; an issued invoice is never edited. */
router.post('/tax/invoices/:id/credit-note', requireAdmin, invoice.creditNote);

router.get('/tax/sellers/:sellerId/vat-summary', requireAuth, invoice.vatSummary);

export default router;
