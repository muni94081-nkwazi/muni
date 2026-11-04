import type { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import * as invoiceService from '../services/invoice.service.js';
import { InvoiceError } from '../services/invoice.service.js';
import { renderInvoiceHtml } from '../services/invoice-render.js';

const lineSchema = z.object({
  productId: z.string().optional(),
  description: z.string().trim().min(1).max(300),
  quantity: z.number().int().min(1),
  // Minor units (cents/ngwee). Integers only — see invoice.service.ts.
  unitPriceExclTax: z.number().int().min(0),
  taxRateBps: z.number().int().min(0).max(10_000),
  taxCategory: z.string().optional(),
  taxExemptReason: z.string().optional(),
});

const issueSchema = z.object({
  orderId: z.string().trim().min(1),
  subOrderId: z.string().trim().optional(),
  sellerId: z.string().trim().min(1),
  buyerId: z.string().trim().min(1),
  sellerName: z.string().trim().min(1),
  sellerTin: z.string().trim().optional(),
  sellerAddress: z.string().trim().optional(),
  sellerEmail: z.string().email().optional(),
  buyerName: z.string().trim().min(1),
  buyerTin: z.string().trim().optional(),
  buyerAddress: z.string().trim().optional(),
  buyerEmail: z.string().email().optional(),
  countryCode: z.string().trim().length(2),
  currency: z.string().trim().length(3).optional(),
  lines: z.array(lineSchema).min(1),
});

const creditSchema = z.object({
  reason: z.string().trim().min(3).max(500),
  lines: z.array(lineSchema).optional(),
});

const asyncRoute =
  (fn: (req: Request, res: Response) => Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction) => {
    fn(req, res).catch(next);
  };

// ─── Who may see an invoice ───────────────────────────────────────────────────
//
// A tax invoice carries both parties' names, addresses and TINs, plus every
// line of what was bought. These handlers decided what to return from
// `?buyerId=` / `?sellerId=` in the query string and from the id in the path,
// with no identity in the picture at all — so any caller could read anyone's
// invoices, walk the id space, or pull a competitor's VAT summary.
//
// The access matrix, enforced below rather than described:
//
//   Customer  own purchases (buyerId)                    — nothing else
//   Seller    own sales (sellerId) + own purchases       — nothing else
//   Staff     everything, and may name a buyer or seller — the finance desk
//
// Identity comes from `res.locals`, filled in by the shared middleware from the
// gateway's signed assertion. A caller who is not on an invoice gets the same
// 404 as one asking for an invoice that does not exist: a 403 would confirm the
// document is real, which is itself worth something to someone enumerating.

const STAFF_ROLES = ['ROLE_ADMIN', 'ROLE_SUPER_ADMIN', 'ROLE_FINANCE'];

function callerId(res: Response): string {
  return res.locals.userId as string;
}

function isStaff(res: Response): boolean {
  const roles = (res.locals.roles as string[]) ?? [];
  return Boolean(res.locals.callingService) || roles.some((r) => STAFF_ROLES.includes(r));
}

/** True when this caller is a party to the invoice, or staff. */
function mayRead(res: Response, invoice: { buyerId: string; sellerId: string }): boolean {
  const id = callerId(res);
  return isStaff(res) || invoice.buyerId === id || invoice.sellerId === id;
}

function notFound(res: Response): void {
  res.status(404).json({ success: false, message: 'Invoice not found' });
}

/**
 * Fetch an invoice this caller is allowed to see, or null.
 *
 * "No such invoice" and "not yours" collapse into the same null — and so into
 * the same 404 — deliberately. The service throws `InvoiceError(404)` for a
 * miss, which the app's error handler reads as `error.status` (absent on
 * InvoiceError, which carries `statusCode`) and so answers 500. Left alone,
 * that made the two cases tell apart from the outside: 500 for an id that does
 * not exist, 404 for one that does but belongs to someone else — an
 * enumeration oracle over sequential invoice numbers.
 */
async function readableInvoice<T extends { buyerId: string; sellerId: string }>(
  res: Response,
  fetch: () => Promise<T>,
): Promise<T | null> {
  let invoice: T;
  try {
    invoice = await fetch();
  } catch (err) {
    if (err instanceof InvoiceError && err.statusCode === 404) return null;
    throw err;
  }
  return mayRead(res, invoice) ? invoice : null;
}

export const issue = asyncRoute(async (req, res) => {
  const parsed = issueSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(422).json({ success: false, message: 'Validation failed', issues: parsed.error.issues });
    return;
  }
  const invoice = await invoiceService.issue(parsed.data);
  res.status(201).json({ success: true, data: invoice });
});

export const getById = asyncRoute(async (req, res) => {
  const invoice = await readableInvoice(res, () => invoiceService.getById(req.params.id));
  if (!invoice) return notFound(res);
  res.json({ success: true, data: invoice });
});

export const getByNumber = asyncRoute(async (req, res) => {
  // Invoice numbers are sequential and printed on documents (INV-2026-000123),
  // so this was the easiest of the read routes to walk: increment and read.
  const invoice = await readableInvoice(res, () =>
    invoiceService.getByNumber(req.params.invoiceNumber),
  );
  if (!invoice) return notFound(res);
  res.json({ success: true, data: invoice });
});

/**
 * Invoices this caller is a party to.
 *
 * `?buyerId=` and `?sellerId=` used to be the whole of the authorization: name
 * anyone and their invoices came back. They are now filters a staff caller may
 * apply, and for everyone else the scope is their own identity. A seller asking
 * for their sales passes their own id; anything else falls back to their own
 * purchases rather than erroring, so a mistyped filter cannot widen the scope.
 */
export const list = asyncRoute(async (req, res) => {
  const requestedSeller = req.query.sellerId as string | undefined;
  const requestedBuyer = req.query.buyerId as string | undefined;
  const me = callerId(res);

  const scope = isStaff(res)
    ? { sellerId: requestedSeller, buyerId: requestedBuyer }
    : requestedSeller === me
      ? { sellerId: me, buyerId: undefined }
      : { sellerId: undefined, buyerId: me };

  const result = await invoiceService.list({
    orderId: req.query.orderId as string | undefined,
    sellerId: scope.sellerId,
    buyerId: scope.buyerId,
    from: req.query.from ? new Date(req.query.from as string) : undefined,
    to: req.query.to ? new Date(req.query.to as string) : undefined,
    page: Math.max(1, Number(req.query.page ?? 1)),
    perPage: Math.min(100, Math.max(1, Number(req.query.per_page ?? 20))),
  });
  res.json({ success: true, ...result });
});

/**
 * Printable invoice. Served as self-contained HTML rather than PDF: it prints
 * to PDF from any browser, needs no headless-Chrome dependency in the image,
 * and stays readable on the low-end handsets most buyers here use.
 */
export const render = asyncRoute(async (req, res) => {
  const invoice = await readableInvoice(res, () => invoiceService.getById(req.params.id));
  if (!invoice) return notFound(res);
  res.type('html').send(renderInvoiceHtml(invoice));
});

export const creditNote = asyncRoute(async (req, res) => {
  const parsed = creditSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(422).json({ success: false, message: 'Validation failed', issues: parsed.error.issues });
    return;
  }
  const note = await invoiceService.creditNote(req.params.id, parsed.data.reason, parsed.data.lines);
  res.status(201).json({ success: true, data: note });
});

/**
 * A seller's VAT position for a filing period — their net sales and output tax.
 *
 * The seller id is a path parameter, and it used to be the only thing deciding
 * whose figures came back, so a seller could read a competitor's turnover by
 * editing the URL. Sellers are public entities on the marketplace, so this
 * answers 403 rather than 404: there is no id to enumerate here, only figures
 * to protect.
 */
export const vatSummary = asyncRoute(async (req, res) => {
  const { sellerId } = req.params;

  if (!isStaff(res) && sellerId !== callerId(res)) {
    res.status(403).json({ success: false, message: 'You can only view your own VAT summary.' });
    return;
  }

  const from = req.query.from ? new Date(req.query.from as string) : new Date(Date.now() - 30 * 86_400_000);
  const to = req.query.to ? new Date(req.query.to as string) : new Date();
  res.json({ success: true, data: await invoiceService.vatSummary(sellerId, from, to) });
});
