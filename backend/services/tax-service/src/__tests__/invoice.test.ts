import { describe, it, expect } from '@jest/globals';
import { computeLines, buildInvoiceKey, InvoiceError } from '../services/invoice.service.js';

// The invoice arithmetic is the part an auditor checks, so it is tested
// directly rather than through the persistence layer.

describe('computeLines', () => {
  it('totals equal the sum of the printed line amounts', () => {
    // Uganda VAT at 18%. Two lines with awkward amounts, chosen so that
    // per-line rounding and whole-invoice rounding would disagree.
    const result = computeLines([
      { description: 'Honey 500g', quantity: 3, unitPriceExclTax: 1_333, taxRateBps: 1800 },
      { description: 'Coffee 250g', quantity: 1, unitPriceExclTax: 2_777, taxRateBps: 1800 },
    ]);

    const lineTaxSum = result.computed.reduce((sum, line) => sum + line.taxAmount, 0);
    const lineTotalSum = result.computed.reduce((sum, line) => sum + line.lineTotal, 0);

    // This is the property that matters: the footer must equal the column.
    expect(result.totalTax).toBe(lineTaxSum);
    expect(result.totalInclTax).toBe(lineTotalSum);
    expect(result.totalInclTax).toBe(result.subtotalExclTax + result.totalTax);
  });

  it('rounds tax per line rather than once over the invoice', () => {
    // 1333 * 3 = 3999; 18% = 719.82 → 720.
    const result = computeLines([
      { description: 'Honey 500g', quantity: 3, unitPriceExclTax: 1_333, taxRateBps: 1800 },
    ]);

    expect(result.computed[0].lineSubtotal).toBe(3_999);
    expect(result.computed[0].taxAmount).toBe(720);
    expect(result.computed[0].lineTotal).toBe(4_719);
  });

  it('zero-rates a line at 0 bps without inventing tax', () => {
    const result = computeLines([
      { description: 'Maize flour', quantity: 2, unitPriceExclTax: 5_000, taxRateBps: 0, taxCategory: 'food' },
    ]);

    expect(result.totalTax).toBe(0);
    expect(result.totalInclTax).toBe(10_000);
  });

  it('rejects fractional money, which would silently lose a cent', () => {
    expect(() =>
      computeLines([{ description: 'Bad', quantity: 1, unitPriceExclTax: 12.5, taxRateBps: 1800 }]),
    ).toThrow(InvoiceError);
  });

  it('rejects a non-positive quantity', () => {
    expect(() =>
      computeLines([{ description: 'Bad', quantity: 0, unitPriceExclTax: 100, taxRateBps: 1800 }]),
    ).toThrow(InvoiceError);
  });
});

describe('buildInvoiceKey', () => {
  it('collapses a missing sub-order to a literal so uniqueness holds in Postgres', () => {
    // Two invoices for the same order with no sub-order must collide. A
    // composite unique over a nullable column would not catch this, because
    // Postgres treats NULLs as distinct.
    expect(buildInvoiceKey('order-1', null, 'INVOICE')).toBe('order-1:-:INVOICE');
    expect(buildInvoiceKey('order-1', undefined, 'INVOICE')).toBe(
      buildInvoiceKey('order-1', null, 'INVOICE'),
    );
  });

  it('separates sub-orders of the same order', () => {
    expect(buildInvoiceKey('order-1', 'sub-a', 'INVOICE')).not.toBe(
      buildInvoiceKey('order-1', 'sub-b', 'INVOICE'),
    );
  });

  it('separates a credit note from the invoice it reverses', () => {
    expect(buildInvoiceKey('order-1', 'sub-a', 'INVOICE')).not.toBe(
      buildInvoiceKey('order-1', 'sub-a', 'CREDIT_NOTE', 'CN-2026-000001'),
    );
  });

  it('allows successive partial credit notes against one invoice', () => {
    expect(buildInvoiceKey('order-1', 'sub-a', 'CREDIT_NOTE', 'CN-2026-000001')).not.toBe(
      buildInvoiceKey('order-1', 'sub-a', 'CREDIT_NOTE', 'CN-2026-000002'),
    );
  });
});
