import type { Prisma, TaxInvoice } from '../generated/prisma/index.js';
import prisma from '../config/prisma.js';
import { logger } from '../utils/logger.js';

// ─── Tax invoices ───────────────────────────────────────────────────────────
//
// Three properties this module exists to guarantee, all of which follow from
// an invoice being a legal document rather than a receipt:
//
//   1. Numbers are sequential and gap-free within a series and year. They are
//      allocated at issue, never at draft creation, so an abandoned draft
//      cannot consume one.
//   2. An issued invoice is immutable. Corrections are a credit note that
//      reverses it, so the original and the correction both remain auditable.
//   3. Money is integer minor units throughout. Summing floats and rounding at
//      the end produces totals that disagree with the sum of their own lines.

export class InvoiceError extends Error {
  constructor(
    readonly statusCode: number,
    message: string,
  ) {
    super(message);
    this.name = 'InvoiceError';
  }
}

/**
 * Collapses the nullable sub-order into a literal so the uniqueness constraint
 * holds in Postgres, where NULLs compare as distinct.
 *
 * Credit notes take a discriminator because a partially-credited invoice may
 * legitimately be credited more than once, while an INVOICE must be unique per
 * supply.
 */
export function buildInvoiceKey(
  orderId: string,
  subOrderId: string | null | undefined,
  type: 'INVOICE' | 'CREDIT_NOTE',
  discriminator?: string,
): string {
  const base = `${orderId}:${subOrderId ?? '-'}:${type}`;
  return discriminator ? `${base}:${discriminator}` : base;
}

export interface InvoiceLineInput {
  productId?: string;
  description: string;
  quantity: number;
  /** Minor units, excluding tax. */
  unitPriceExclTax: number;
  /** Basis points: 1800 = 18.00%. */
  taxRateBps: number;
  taxCategory?: string;
  taxExemptReason?: string;
}

export interface IssueInvoiceInput {
  orderId: string;
  subOrderId?: string;
  sellerId: string;
  buyerId: string;

  sellerName: string;
  sellerTin?: string;
  sellerAddress?: string;
  sellerEmail?: string;

  buyerName: string;
  buyerTin?: string;
  buyerAddress?: string;
  buyerEmail?: string;

  countryCode: string;
  currency?: string;

  lines: InvoiceLineInput[];
}

interface ComputedLine {
  productId: string | null;
  description: string;
  quantity: number;
  unitPriceExclTax: number;
  lineSubtotal: number;
  taxRateBps: number;
  taxAmount: number;
  lineTotal: number;
  taxCategory: string | null;
  taxExemptReason: string | null;
}

/**
 * Tax is rounded per line, and the invoice total is the sum of those rounded
 * lines. Rounding once at the end instead would produce a total that does not
 * equal the column above it — which is what an auditor checks first.
 */
export function computeLines(lines: InvoiceLineInput[]): {
  computed: ComputedLine[];
  subtotalExclTax: number;
  totalTax: number;
  totalInclTax: number;
} {
  let subtotalExclTax = 0;
  let totalTax = 0;

  const computed = lines.map((line) => {
    if (!Number.isInteger(line.unitPriceExclTax) || line.unitPriceExclTax < 0) {
      throw new InvoiceError(400, `unitPriceExclTax must be a non-negative integer (minor units): ${line.description}`);
    }
    if (!Number.isInteger(line.quantity) || line.quantity < 1) {
      throw new InvoiceError(400, `quantity must be a positive integer: ${line.description}`);
    }

    const lineSubtotal = line.unitPriceExclTax * line.quantity;
    const taxAmount = Math.round((lineSubtotal * line.taxRateBps) / 10_000);
    const lineTotal = lineSubtotal + taxAmount;

    subtotalExclTax += lineSubtotal;
    totalTax += taxAmount;

    return {
      productId: line.productId ?? null,
      description: line.description,
      quantity: line.quantity,
      unitPriceExclTax: line.unitPriceExclTax,
      lineSubtotal,
      taxRateBps: line.taxRateBps,
      taxAmount,
      lineTotal,
      taxCategory: line.taxCategory ?? null,
      taxExemptReason: line.taxExemptReason ?? null,
    };
  });

  return {
    computed,
    subtotalExclTax,
    totalTax,
    totalInclTax: subtotalExclTax + totalTax,
  };
}

async function allocateNumber(
  tx: Prisma.TransactionClient,
  series: 'INV' | 'CN',
  year: number,
): Promise<string> {
  const key = `${series}-${year}`;
  // The upsert is atomic, so two concurrent issues cannot take the same number.
  const counter = await tx.invoiceCounter.upsert({
    where: { id: key },
    create: { id: key, value: 1 },
    update: { value: { increment: 1 } },
  });
  return `${key}-${String(counter.value).padStart(6, '0')}`;
}

/**
 * Issues a tax invoice for one sub-order. Idempotent: calling it again for the
 * same (order, sub-order) returns the invoice already issued rather than
 * minting a second document for the same supply.
 */
export async function issue(input: IssueInvoiceInput): Promise<TaxInvoice> {
  if (input.lines.length === 0) {
    throw new InvoiceError(400, 'An invoice needs at least one line.');
  }

  const invoiceKey = buildInvoiceKey(input.orderId, input.subOrderId, 'INVOICE');

  const existing = await prisma.taxInvoice.findUnique({
    where: { invoiceKey },
    include: { lines: true },
  });
  if (existing) return existing;

  const { computed, subtotalExclTax, totalTax, totalInclTax } = computeLines(input.lines);
  const now = new Date();

  const invoice = await prisma.$transaction(async (tx) => {
    const invoiceNumber = await allocateNumber(tx, 'INV', now.getUTCFullYear());

    return tx.taxInvoice.create({
      data: {
        invoiceKey,
        invoiceNumber,
        type: 'INVOICE',
        status: 'ISSUED',
        issuedAt: now,
        orderId: input.orderId,
        subOrderId: input.subOrderId ?? null,
        sellerId: input.sellerId,
        buyerId: input.buyerId,
        sellerName: input.sellerName,
        sellerTin: input.sellerTin ?? null,
        sellerAddress: input.sellerAddress ?? null,
        sellerEmail: input.sellerEmail ?? null,
        buyerName: input.buyerName,
        buyerTin: input.buyerTin ?? null,
        buyerAddress: input.buyerAddress ?? null,
        buyerEmail: input.buyerEmail ?? null,
        countryCode: input.countryCode.toUpperCase(),
        currency: input.currency ?? 'UGX',
        subtotalExclTax,
        totalTax,
        totalInclTax,
        lines: { create: computed },
      },
      include: { lines: true },
    });
  });

  logger.info('tax invoice issued', {
    invoiceNumber: invoice.invoiceNumber,
    orderId: invoice.orderId,
    totalInclTax: invoice.totalInclTax,
  });

  return invoice;
}

export async function getById(id: string) {
  const invoice = await prisma.taxInvoice.findUnique({ where: { id }, include: { lines: true } });
  if (!invoice) throw new InvoiceError(404, 'Invoice not found');
  return invoice;
}

export async function getByNumber(invoiceNumber: string) {
  const invoice = await prisma.taxInvoice.findUnique({
    where: { invoiceNumber },
    include: { lines: true },
  });
  if (!invoice) throw new InvoiceError(404, 'Invoice not found');
  return invoice;
}

export interface ListParams {
  orderId?: string;
  sellerId?: string;
  buyerId?: string;
  from?: Date;
  to?: Date;
  page: number;
  perPage: number;
}

export async function list(params: ListParams) {
  const where: Prisma.TaxInvoiceWhereInput = {
    ...(params.orderId ? { orderId: params.orderId } : {}),
    ...(params.sellerId ? { sellerId: params.sellerId } : {}),
    ...(params.buyerId ? { buyerId: params.buyerId } : {}),
    ...(params.from || params.to
      ? { issuedAt: { ...(params.from ? { gte: params.from } : {}), ...(params.to ? { lte: params.to } : {}) } }
      : {}),
  };

  const [data, total] = await Promise.all([
    prisma.taxInvoice.findMany({
      where,
      orderBy: { issuedAt: 'desc' },
      skip: (params.page - 1) * params.perPage,
      take: params.perPage,
      include: { lines: true },
    }),
    prisma.taxInvoice.count({ where }),
  ]);

  return {
    data,
    meta: {
      current_page: params.page,
      per_page: params.perPage,
      total,
      last_page: Math.max(1, Math.ceil(total / params.perPage)),
    },
  };
}

/**
 * Reverses an issued invoice with a credit note. The original is marked
 * CANCELLED but keeps its number and its lines — a revenue authority needs to
 * see both the document that was wrong and the one that corrected it.
 *
 * `partialLines` credits only some lines (a partial refund); omitting it
 * reverses the invoice in full.
 */
export async function creditNote(
  invoiceId: string,
  reason: string,
  partialLines?: InvoiceLineInput[],
): Promise<TaxInvoice> {
  const original = await prisma.taxInvoice.findUnique({
    where: { id: invoiceId },
    include: { lines: true },
  });
  if (!original) throw new InvoiceError(404, 'Invoice not found');
  if (original.type !== 'INVOICE') throw new InvoiceError(400, 'Only an invoice can be credited.');
  if (original.status === 'CANCELLED') {
    throw new InvoiceError(409, 'This invoice has already been credited.');
  }

  const lines: InvoiceLineInput[] =
    partialLines ??
    original.lines.map((line) => ({
      productId: line.productId ?? undefined,
      description: line.description,
      quantity: line.quantity,
      unitPriceExclTax: line.unitPriceExclTax,
      taxRateBps: line.taxRateBps,
      taxCategory: line.taxCategory ?? undefined,
    }));

  const { computed, subtotalExclTax, totalTax, totalInclTax } = computeLines(lines);
  const now = new Date();

  const note = await prisma.$transaction(async (tx) => {
    const invoiceNumber = await allocateNumber(tx, 'CN', now.getUTCFullYear());

    const created = await tx.taxInvoice.create({
      data: {
        // The credit note's own number is the discriminator: an invoice may be
        // credited more than once (successive partial refunds), so unlike an
        // INVOICE the key cannot be the supply alone.
        invoiceKey: buildInvoiceKey(original.orderId, original.subOrderId, 'CREDIT_NOTE', invoiceNumber),
        invoiceNumber,
        type: 'CREDIT_NOTE',
        status: 'ISSUED',
        issuedAt: now,
        reversesInvoiceId: original.id,
        orderId: original.orderId,
        subOrderId: original.subOrderId,
        sellerId: original.sellerId,
        buyerId: original.buyerId,
        sellerName: original.sellerName,
        sellerTin: original.sellerTin,
        sellerAddress: original.sellerAddress,
        sellerEmail: original.sellerEmail,
        buyerName: original.buyerName,
        buyerTin: original.buyerTin,
        buyerAddress: original.buyerAddress,
        buyerEmail: original.buyerEmail,
        countryCode: original.countryCode,
        currency: original.currency,
        // Stored positive; the CREDIT_NOTE type is what makes it a deduction.
        // Signing the amounts as well would double-negate on any consumer that
        // already keys off the type.
        subtotalExclTax,
        totalTax,
        totalInclTax,
        cancellationReason: reason,
        lines: { create: computed },
      },
      include: { lines: true },
    });

    // A full credit voids the original; a partial one leaves it standing,
    // because the rest of the supply still happened.
    if (!partialLines) {
      await tx.taxInvoice.update({
        where: { id: original.id },
        data: {
          status: 'CANCELLED',
          cancelledAt: now,
          cancellationReason: reason,
          creditNoteId: created.id,
        },
      });
    }

    return created;
  });

  logger.info('credit note issued', {
    creditNote: note.invoiceNumber,
    reverses: original.invoiceNumber,
    partial: Boolean(partialLines),
  });

  return note;
}

/**
 * VAT summary for a filing period. Credit notes subtract, which is the whole
 * reason they are a separate document type rather than a deleted invoice.
 */
export async function vatSummary(sellerId: string, from: Date, to: Date) {
  const rows = await prisma.taxInvoice.groupBy({
    by: ['type'],
    where: { sellerId, status: { not: 'DRAFT' }, issuedAt: { gte: from, lte: to } },
    _sum: { subtotalExclTax: true, totalTax: true, totalInclTax: true },
    _count: { _all: true },
  });

  const invoices = rows.find((r) => r.type === 'INVOICE');
  const credits = rows.find((r) => r.type === 'CREDIT_NOTE');

  const grossExclTax = (invoices?._sum.subtotalExclTax ?? 0) - (credits?._sum.subtotalExclTax ?? 0);
  const netTax = (invoices?._sum.totalTax ?? 0) - (credits?._sum.totalTax ?? 0);

  return {
    sellerId,
    period: { from: from.toISOString(), to: to.toISOString() },
    invoiceCount: invoices?._count._all ?? 0,
    creditNoteCount: credits?._count._all ?? 0,
    /** Minor units. */
    netSalesExclTax: grossExclTax,
    netOutputTax: netTax,
    netSalesInclTax: grossExclTax + netTax,
  };
}
