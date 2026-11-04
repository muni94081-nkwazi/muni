/**
 * invoice.authz.test.ts
 *
 * Whose tax invoices a caller may read.
 *
 * tax-service carried a local auth.middleware.ts that nothing imported, so
 * routes/index.ts mounted every route bare — including the invoice endpoints.
 * With no identity in the picture, the handlers decided what to return from the
 * request itself:
 *
 *   GET /tax/invoices?buyerId=<anyone>          → that person's invoices
 *   GET /tax/invoices?sellerId=<competitor>     → their sales
 *   GET /tax/invoices/:id                       → any invoice by id
 *   GET /tax/invoices/number/INV-2026-000123    → any invoice, and the numbers
 *                                                 are sequential and printed on
 *                                                 the documents themselves
 *   GET /tax/sellers/:sellerId/vat-summary      → any seller's turnover
 *
 * A tax invoice carries both parties' names, addresses and TINs plus every line
 * of what was bought, so this was a PII and financial disclosure reachable by
 * any authenticated session on the platform.
 *
 * These drive the REAL router and the REAL shared auth middleware. The service
 * layer is stood in for: the arithmetic it owns is covered by invoice.test.ts,
 * and what is under test here is who gets to see the result.
 */
import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';

const BUYER_A = 'cust-a';
const BUYER_B = 'cust-b';
const SELLER_A = 'seller-a';
const SELLER_B = 'seller-b';
const ADMIN = 'admin-1';

const SIGNING_SECRET = 'test-internal-identity-secret-32-chars-plus';

interface FakeInvoice {
  id: string;
  invoiceNumber: string;
  buyerId: string;
  sellerId: string;
  buyerName: string;
  buyerTin: string;
  totalInclTax: number;
  lines: unknown[];
}

/** A's purchase from seller A, and B's from seller B. */
const INVOICES: FakeInvoice[] = [
  {
    id: 'inv-a',
    invoiceNumber: 'INV-2026-000001',
    buyerId: BUYER_A,
    sellerId: SELLER_A,
    buyerName: 'Aisha Nakato',
    buyerTin: 'TIN-AAA-111',
    totalInclTax: 118_000,
    lines: [],
  },
  {
    id: 'inv-b',
    invoiceNumber: 'INV-2026-000002',
    buyerId: BUYER_B,
    sellerId: SELLER_B,
    buyerName: 'Brian Okello',
    buyerTin: 'TIN-BBB-222',
    totalInclTax: 236_000,
    lines: [],
  },
];

class FakeInvoiceError extends Error {
  constructor(readonly statusCode: number, message: string) {
    super(message);
    this.name = 'InvoiceError';
  }
}

const listSpy = jest.fn();

jest.unstable_mockModule('../services/invoice.service.js', () => ({
  InvoiceError: FakeInvoiceError,
  getById: jest.fn(async (id: string) => {
    const found = INVOICES.find((i) => i.id === id);
    if (!found) throw new FakeInvoiceError(404, 'Invoice not found');
    return found;
  }),
  getByNumber: jest.fn(async (number: string) => {
    const found = INVOICES.find((i) => i.invoiceNumber === number);
    if (!found) throw new FakeInvoiceError(404, 'Invoice not found');
    return found;
  }),
  list: jest.fn(async (params: { buyerId?: string; sellerId?: string }) => {
    listSpy(params);
    const data = INVOICES.filter(
      (i) =>
        (params.buyerId === undefined || i.buyerId === params.buyerId) &&
        (params.sellerId === undefined || i.sellerId === params.sellerId),
    );
    return { data, meta: { current_page: 1, per_page: 20, total: data.length, last_page: 1 } };
  }),
  issue: jest.fn(async () => INVOICES[0]),
  creditNote: jest.fn(async () => ({ ...INVOICES[0], id: 'cn-1', type: 'CREDIT_NOTE' })),
  vatSummary: jest.fn(async (sellerId: string) => ({
    sellerId,
    netSalesExclTax: 1_000_000,
    netOutputTax: 180_000,
  })),
}));

jest.unstable_mockModule('../services/invoice-render.js', () => ({
  renderInvoiceHtml: (invoice: FakeInvoice) => `<html><body>${invoice.invoiceNumber}</body></html>`,
}));

const express = (await import('express')).default;
const request = (await import('supertest')).default;
const routes = (await import('../routes/index.js')).default;
const { signIdentity, signServiceIdentity } = await import(
  '../../../../shared/utils/internal-identity.js'
);

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/v1', routes); // exactly as app.ts mounts it
  return app;
}

const app = makeApp();

/** The headers the gateway stamps once it has verified the JWT. */
const asUser = (id: string, roles: string[] = ['ROLE_CUSTOMER']) => ({
  'x-user-id': id,
  'x-user-roles': roles.join(','),
});

beforeEach(() => {
  delete process.env.INTERNAL_IDENTITY_SECRET;
  listSpy.mockClear();
});

// ─── Authentication ───────────────────────────────────────────────────────────

describe('invoice routes require an identity', () => {
  it.each([
    ['the invoice list', '/api/v1/tax/invoices'],
    ['an invoice by id', '/api/v1/tax/invoices/inv-a'],
    ['an invoice by number', '/api/v1/tax/invoices/number/INV-2026-000001'],
    ['a printable invoice', '/api/v1/tax/invoices/inv-a/render'],
    ['a VAT summary', `/api/v1/tax/sellers/${SELLER_A}/vat-summary`],
  ])('401s %s with no identity', async (_label, path) => {
    const res = await request(app).get(path);

    expect(res.status).toBe(401);
    // Nothing about the document leaks on the way out.
    expect(JSON.stringify(res.body)).not.toContain('TIN-AAA-111');
  });

  it('keeps rate lookup public — a signed-out shopper sees tax-inclusive prices', async () => {
    const rates = await request(app).get('/api/v1/tax/rates');
    expect(rates.status).toBe(200);
  });
});

// ─── Reading one invoice ──────────────────────────────────────────────────────

describe('an invoice belongs to the two parties named on it', () => {
  it('lets the buyer read their own invoice', async () => {
    const res = await request(app).get('/api/v1/tax/invoices/inv-a').set(asUser(BUYER_A));

    expect(res.status).toBe(200);
    expect(res.body.data.invoiceNumber).toBe('INV-2026-000001');
  });

  it('lets the seller on the invoice read it', async () => {
    const res = await request(app)
      .get('/api/v1/tax/invoices/inv-a')
      .set(asUser(SELLER_A, ['ROLE_SELLER']));

    expect(res.status).toBe(200);
  });

  it('refuses another customer, and leaks no name or TIN', async () => {
    const res = await request(app).get('/api/v1/tax/invoices/inv-a').set(asUser(BUYER_B));

    expect(res.status).toBe(404);
    const body = JSON.stringify(res.body);
    expect(body).not.toContain('Aisha Nakato');
    expect(body).not.toContain('TIN-AAA-111');
    expect(body).not.toContain('118000');
  });

  it('refuses a competitor seller', async () => {
    const res = await request(app)
      .get('/api/v1/tax/invoices/inv-a')
      .set(asUser(SELLER_B, ['ROLE_SELLER']));

    expect(res.status).toBe(404);
  });

  it('answers an invoice you may not read exactly like one that does not exist', async () => {
    // Otherwise the pair of responses is an oracle: it tells an enumerator
    // which ids are real before they even see the contents.
    const notYours = await request(app).get('/api/v1/tax/invoices/inv-a').set(asUser(BUYER_B));
    const missing = await request(app).get('/api/v1/tax/invoices/inv-nope').set(asUser(BUYER_B));

    expect(notYours.status).toBe(missing.status);
    expect(notYours.body).toEqual(missing.body);
  });

  it('refuses a walk up the sequential invoice numbers', async () => {
    // The numbers are printed on every document and allocated gap-free, so
    // "the one after mine" is always a real invoice belonging to someone else.
    const mine = await request(app)
      .get('/api/v1/tax/invoices/number/INV-2026-000001')
      .set(asUser(BUYER_A));
    const next = await request(app)
      .get('/api/v1/tax/invoices/number/INV-2026-000002')
      .set(asUser(BUYER_A));

    expect(mine.status).toBe(200);
    expect(next.status).toBe(404);
    expect(JSON.stringify(next.body)).not.toContain('TIN-BBB-222');
  });

  it('refuses to render a printable invoice for a stranger', async () => {
    const res = await request(app).get('/api/v1/tax/invoices/inv-a/render').set(asUser(BUYER_B));

    expect(res.status).toBe(404);
    expect(res.text ?? '').not.toContain('INV-2026-000001');
  });

  it('lets the buyer render their own', async () => {
    const res = await request(app).get('/api/v1/tax/invoices/inv-a/render').set(asUser(BUYER_A));

    expect(res.status).toBe(200);
    expect(res.text).toContain('INV-2026-000001');
  });
});

// ─── Listing ──────────────────────────────────────────────────────────────────

describe('the invoice list is scoped to the caller, not the query string', () => {
  it('gives a customer their own purchases', async () => {
    const res = await request(app).get('/api/v1/tax/invoices').set(asUser(BUYER_A));

    expect(res.status).toBe(200);
    expect(listSpy).toHaveBeenCalledWith(expect.objectContaining({ buyerId: BUYER_A }));
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].buyerId).toBe(BUYER_A);
  });

  it('ignores ?buyerId= naming someone else', async () => {
    const res = await request(app)
      .get(`/api/v1/tax/invoices?buyerId=${BUYER_B}`)
      .set(asUser(BUYER_A));

    expect(res.status).toBe(200);
    expect(listSpy).toHaveBeenCalledWith(expect.objectContaining({ buyerId: BUYER_A }));
    expect(JSON.stringify(res.body)).not.toContain('TIN-BBB-222');
  });

  it('ignores ?sellerId= naming a competitor, falling back to the caller’s own purchases', async () => {
    const res = await request(app)
      .get(`/api/v1/tax/invoices?sellerId=${SELLER_B}`)
      .set(asUser(SELLER_A, ['ROLE_SELLER']));

    expect(res.status).toBe(200);
    expect(listSpy).toHaveBeenCalledWith(
      expect.objectContaining({ buyerId: SELLER_A, sellerId: undefined }),
    );
    expect(JSON.stringify(res.body)).not.toContain('INV-2026-000002');
  });

  it('lets a seller list their own sales', async () => {
    const res = await request(app)
      .get(`/api/v1/tax/invoices?sellerId=${SELLER_A}`)
      .set(asUser(SELLER_A, ['ROLE_SELLER']));

    expect(res.status).toBe(200);
    expect(listSpy).toHaveBeenCalledWith(expect.objectContaining({ sellerId: SELLER_A }));
    expect(res.body.data[0].id).toBe('inv-a');
  });

  it('lets staff name a seller — the finance desk needs that', async () => {
    const res = await request(app)
      .get(`/api/v1/tax/invoices?sellerId=${SELLER_B}`)
      .set(asUser(ADMIN, ['ROLE_ADMIN']));

    expect(res.status).toBe(200);
    expect(listSpy).toHaveBeenCalledWith(expect.objectContaining({ sellerId: SELLER_B }));
  });
});

// ─── VAT summaries ────────────────────────────────────────────────────────────

describe('a VAT summary is the seller’s own turnover', () => {
  it('lets a seller read their own', async () => {
    const res = await request(app)
      .get(`/api/v1/tax/sellers/${SELLER_A}/vat-summary`)
      .set(asUser(SELLER_A, ['ROLE_SELLER']));

    expect(res.status).toBe(200);
    expect(res.body.data.netOutputTax).toBe(180_000);
  });

  it('refuses a competitor’s, and returns no figures', async () => {
    const res = await request(app)
      .get(`/api/v1/tax/sellers/${SELLER_A}/vat-summary`)
      .set(asUser(SELLER_B, ['ROLE_SELLER']));

    expect(res.status).toBe(403);
    expect(JSON.stringify(res.body)).not.toContain('180000');
  });

  it('refuses a customer reading any seller’s', async () => {
    const res = await request(app)
      .get(`/api/v1/tax/sellers/${SELLER_A}/vat-summary`)
      .set(asUser(BUYER_A));

    expect(res.status).toBe(403);
  });

  it('lets staff read any seller’s', async () => {
    const res = await request(app)
      .get(`/api/v1/tax/sellers/${SELLER_A}/vat-summary`)
      .set(asUser(ADMIN, ['ROLE_ADMIN']));

    expect(res.status).toBe(200);
  });
});

// ─── Issuing and crediting ────────────────────────────────────────────────────

describe('minting and reversing a legal document is not a user action', () => {
  beforeEach(() => {
    process.env.INTERNAL_IDENTITY_SECRET = SIGNING_SECRET;
  });
  afterEach(() => {
    delete process.env.INTERNAL_IDENTITY_SECRET;
  });

  const signedUser = (id: string, roles: string[] = ['ROLE_CUSTOMER']) => ({
    'x-internal-identity': signIdentity(id, roles) as string,
  });
  const signedService = (svc: string) => ({
    'x-internal-identity': signServiceIdentity(svc, [], svc) as string,
  });

  /** A complete, valid supply — so what is under test is the guard, not validation. */
  const ISSUE_BODY = {
    orderId: 'o-1',
    sellerId: SELLER_A,
    buyerId: BUYER_A,
    sellerName: 'Kampala Tech Ltd',
    buyerName: 'Aisha Nakato',
    countryCode: 'UG',
    lines: [
      { description: 'Honey 500g', quantity: 3, unitPriceExclTax: 1_333, taxRateBps: 1800 },
    ],
  };

  it('403s an invoice issued by a signed-in customer', async () => {
    const res = await request(app)
      .post('/api/v1/tax/invoices')
      .set(signedUser(BUYER_A))
      .send(ISSUE_BODY);

    // Refused before validation ever runs — a 422 here would mean the guard let
    // it through and only the body shape stopped it.
    expect(res.status).toBe(403);
  });

  it('lets the order flow issue one with a signed service assertion', async () => {
    const res = await request(app)
      .post('/api/v1/tax/invoices')
      .set(signedService('order-service'))
      .send(ISSUE_BODY);

    expect(res.status).toBe(201);
  });

  it('403s a credit note from the buyer on the invoice', async () => {
    const res = await request(app)
      .post('/api/v1/tax/invoices/inv-a/credit-note')
      .set(signedUser(BUYER_A))
      .send({ reason: 'refund me' });

    expect(res.status).toBe(403);
  });

  it('lets an admin issue a credit note', async () => {
    const res = await request(app)
      .post('/api/v1/tax/invoices/inv-a/credit-note')
      .set(signedUser(ADMIN, ['ROLE_ADMIN']))
      .send({ reason: 'Goods returned in full.' });

    expect(res.status).toBe(201);
  });
});

// ─── Signed identity mode ─────────────────────────────────────────────────────

describe('with INTERNAL_IDENTITY_SECRET set, a raw header buys nothing', () => {
  beforeEach(() => {
    process.env.INTERNAL_IDENTITY_SECRET = SIGNING_SECRET;
  });
  afterEach(() => {
    delete process.env.INTERNAL_IDENTITY_SECRET;
  });

  const signed = (id: string, roles: string[] = ['ROLE_CUSTOMER']) => ({
    'x-internal-identity': signIdentity(id, roles) as string,
  });

  it('401s a forged x-user-id, because nothing signed it', async () => {
    const res = await request(app).get('/api/v1/tax/invoices/inv-a').set(asUser(BUYER_A));
    expect(res.status).toBe(401);
  });

  it('accepts a properly signed assertion', async () => {
    const res = await request(app).get('/api/v1/tax/invoices/inv-a').set(signed(BUYER_A));
    expect(res.status).toBe(200);
  });

  it('will not let a forged header override a signed identity', async () => {
    // Signed as B, claiming to be A. The invoice is A's.
    const res = await request(app)
      .get('/api/v1/tax/invoices/inv-a')
      .set(signed(BUYER_B))
      .set('x-user-id', BUYER_A);

    expect(res.status).toBe(404);
  });

  it('ignores a hand-written x-user-roles claiming staff', async () => {
    const res = await request(app)
      .get(`/api/v1/tax/invoices?buyerId=${BUYER_B}`)
      .set(signed(BUYER_A))
      .set('x-user-roles', 'ROLE_ADMIN');

    expect(listSpy).toHaveBeenCalledWith(expect.objectContaining({ buyerId: BUYER_A }));
    expect(JSON.stringify(res.body)).not.toContain('TIN-BBB-222');
  });
});
