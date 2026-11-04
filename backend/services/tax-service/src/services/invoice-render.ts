import type { TaxInvoice, TaxInvoiceLine } from '../generated/prisma/index.js';

// ─── Printable invoice ──────────────────────────────────────────────────────
//
// Self-contained HTML, no external assets. A browser prints it to PDF, so the
// service image needs no headless Chrome — which would roughly triple it — and
// the same URL is readable on a phone.

type InvoiceWithLines = TaxInvoice & { lines: TaxInvoiceLine[] };

/** Minor units → display string. Never use a float for the arithmetic itself. */
function formatMoney(minorUnits: number, currency: string): string {
  const major = Math.trunc(minorUnits / 100);
  const minor = Math.abs(minorUnits % 100);
  const withSeparators = major.toLocaleString('en-US');
  return `${currency} ${withSeparators}.${String(minor).padStart(2, '0')}`;
}

function formatRate(bps: number): string {
  return `${(bps / 100).toFixed(2)}%`;
}

function escapeHtml(value: string | null | undefined): string {
  if (!value) return '';
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatDate(date: Date | null): string {
  return date ? date.toISOString().slice(0, 10) : '—';
}

export function renderInvoiceHtml(invoice: InvoiceWithLines): string {
  const isCreditNote = invoice.type === 'CREDIT_NOTE';
  const documentTitle = isCreditNote ? 'Credit Note' : 'Tax Invoice';
  const currency = invoice.currency;

  const rows = invoice.lines
    .map(
      (line) => `
      <tr>
        <td>
          ${escapeHtml(line.description)}
          ${line.taxExemptReason ? `<div class="note">${escapeHtml(line.taxExemptReason)}</div>` : ''}
        </td>
        <td class="num">${line.quantity}</td>
        <td class="num">${formatMoney(line.unitPriceExclTax, currency)}</td>
        <td class="num">${formatRate(line.taxRateBps)}</td>
        <td class="num">${formatMoney(line.taxAmount, currency)}</td>
        <td class="num">${formatMoney(line.lineTotal, currency)}</td>
      </tr>`,
    )
    .join('');

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${documentTitle} ${escapeHtml(invoice.invoiceNumber)}</title>
<style>
  :root { --ink:#111827; --muted:#6b7280; --line:#e5e7eb; --accent:#0f766e; }
  * { box-sizing: border-box; }
  body { font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
         color: var(--ink); margin: 0; padding: 2rem 1.25rem; background: #f9fafb; }
  .sheet { max-width: 820px; margin: 0 auto; background:#fff; padding: 2.5rem;
           border:1px solid var(--line); border-radius: 10px; }
  header { display:flex; justify-content:space-between; gap:2rem; flex-wrap:wrap;
           border-bottom:2px solid var(--accent); padding-bottom:1.25rem; margin-bottom:1.75rem; }
  .brand { font-size:1.6rem; font-weight:700; color:var(--accent); letter-spacing:-0.02em; }
  .doc-type { font-size:1.1rem; font-weight:600; text-transform:uppercase; letter-spacing:0.08em; }
  .meta { text-align:right; font-size:0.875rem; }
  .meta div { margin-bottom:0.2rem; }
  .parties { display:flex; gap:2rem; flex-wrap:wrap; margin-bottom:2rem; }
  .party { flex:1 1 260px; font-size:0.875rem; line-height:1.5; }
  .party h2 { font-size:0.7rem; text-transform:uppercase; letter-spacing:0.09em;
              color:var(--muted); margin:0 0 0.4rem; }
  .party .name { font-weight:600; }
  table { width:100%; border-collapse:collapse; font-size:0.875rem; }
  th { text-align:left; font-size:0.7rem; text-transform:uppercase; letter-spacing:0.06em;
       color:var(--muted); border-bottom:1px solid var(--line); padding:0.6rem 0.5rem; }
  td { padding:0.7rem 0.5rem; border-bottom:1px solid var(--line); vertical-align:top; }
  .num { text-align:right; white-space:nowrap; font-variant-numeric: tabular-nums; }
  .note { font-size:0.75rem; color:var(--muted); margin-top:0.2rem; }
  .totals { margin-left:auto; margin-top:1.5rem; width:min(320px, 100%); font-size:0.9rem; }
  .totals div { display:flex; justify-content:space-between; padding:0.4rem 0.5rem; }
  .totals .grand { border-top:2px solid var(--ink); margin-top:0.3rem; padding-top:0.6rem;
                   font-weight:700; font-size:1.05rem; }
  .status { display:inline-block; padding:0.2rem 0.6rem; border-radius:999px;
            font-size:0.7rem; font-weight:600; text-transform:uppercase; letter-spacing:0.05em; }
  .status.cancelled { background:#fef2f2; color:#b91c1c; }
  .status.issued { background:#ecfdf5; color:#047857; }
  footer { margin-top:2.5rem; padding-top:1.25rem; border-top:1px solid var(--line);
           font-size:0.75rem; color:var(--muted); line-height:1.6; }
  /* Print to PDF without the page furniture. */
  @media print {
    body { background:#fff; padding:0; }
    .sheet { border:none; border-radius:0; padding:0; max-width:none; }
  }
</style>
</head>
<body>
  <div class="sheet">
    <header>
      <div>
        <div class="brand">MUNI</div>
        <div class="doc-type">${documentTitle}</div>
      </div>
      <div class="meta">
        <div><strong>${escapeHtml(invoice.invoiceNumber) || 'DRAFT'}</strong></div>
        <div>Issued: ${formatDate(invoice.issuedAt)}</div>
        <div>Order: ${escapeHtml(invoice.orderId)}</div>
        <div><span class="status ${invoice.status === 'CANCELLED' ? 'cancelled' : 'issued'}">${invoice.status}</span></div>
      </div>
    </header>

    ${
      isCreditNote && invoice.reversesInvoiceId
        ? `<p class="note">This credit note reverses invoice ${escapeHtml(invoice.reversesInvoiceId)}.
             Reason: ${escapeHtml(invoice.cancellationReason)}</p>`
        : ''
    }
    ${
      invoice.status === 'CANCELLED' && !isCreditNote
        ? `<p class="note">This invoice was cancelled on ${formatDate(invoice.cancelledAt)}.
             Reason: ${escapeHtml(invoice.cancellationReason)}</p>`
        : ''
    }

    <div class="parties">
      <div class="party">
        <h2>Supplier</h2>
        <div class="name">${escapeHtml(invoice.sellerName)}</div>
        ${invoice.sellerTin ? `<div>TIN: ${escapeHtml(invoice.sellerTin)}</div>` : ''}
        ${invoice.sellerAddress ? `<div>${escapeHtml(invoice.sellerAddress)}</div>` : ''}
        ${invoice.sellerEmail ? `<div>${escapeHtml(invoice.sellerEmail)}</div>` : ''}
      </div>
      <div class="party">
        <h2>Customer</h2>
        <div class="name">${escapeHtml(invoice.buyerName)}</div>
        ${invoice.buyerTin ? `<div>TIN: ${escapeHtml(invoice.buyerTin)}</div>` : ''}
        ${invoice.buyerAddress ? `<div>${escapeHtml(invoice.buyerAddress)}</div>` : ''}
        ${invoice.buyerEmail ? `<div>${escapeHtml(invoice.buyerEmail)}</div>` : ''}
      </div>
    </div>

    <table>
      <thead>
        <tr>
          <th>Description</th>
          <th class="num">Qty</th>
          <th class="num">Unit (excl.)</th>
          <th class="num">VAT rate</th>
          <th class="num">VAT</th>
          <th class="num">Total</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>

    <div class="totals">
      <div><span>Subtotal (excl. VAT)</span><span>${formatMoney(invoice.subtotalExclTax, currency)}</span></div>
      <div><span>VAT</span><span>${formatMoney(invoice.totalTax, currency)}</span></div>
      <div class="grand"><span>Total</span><span>${formatMoney(invoice.totalInclTax, currency)}</span></div>
    </div>

    <footer>
      Issued by MUNI Marketplace on behalf of the supplier named above.
      Country of supply: ${escapeHtml(invoice.countryCode)}.
      ${invoice.buyerTin ? 'Retain this document to support an input tax claim.' : ''}
      This is a computer-generated document and is valid without a signature.
    </footer>
  </div>
</body>
</html>`;
}
