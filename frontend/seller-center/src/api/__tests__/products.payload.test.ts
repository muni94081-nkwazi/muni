import { describe, it, expect, vi, beforeEach } from 'vitest';

// The module reaches for the shared axios instance at import time; it is never
// called here because every assertion is about the request BODY that toPayload
// builds, which is exercised through the exported create/update calls.
const post = vi.fn().mockResolvedValue({ data: { data: { id: 'p1' } } });
const put  = vi.fn().mockResolvedValue({ data: { data: { id: 'p1' } } });

vi.mock('../axios.config', () => ({
  default: { post, put, get: vi.fn(), delete: vi.fn() },
}));

const { productsApi } = await import('../products.api');

/**
 * What actually leaves the browser when a seller saves a product.
 *
 * These assertions exist because of a specific, silent failure: ProductForm
 * collected `sku` (as a REQUIRED field) and `stock`, and toPayload dropped both
 * on the floor. Nothing failed — no validation error, no console warning, no
 * type error, because ProductFormValues did not declare either field. The
 * product was created with zero variants, and since stock lives only on
 * ProductVariant, `inStock` was false forever. Every listing created through
 * the seller UI was unbuyable.
 *
 * A field collected by a form and never sent is invisible to typecheck, to the
 * build and to a smoke test that only checks the request succeeded. It is
 * visible here.
 */

beforeEach(() => {
  post.mockClear();
  put.mockClear();
});

function bodyOf(mock: typeof post): any {
  return mock.mock.calls[0][1];
}

const FORM = {
  name:  'Kasese Pure Honey 1L',
  price: '35000',
  sku:   'HNY-001',
  stock: '48',
};

describe('toPayload — the product itself', () => {
  it('slugifies the name into the format the server requires', async () => {
    await productsApi.create(FORM as any);
    // CreateProductSchema enforces /^[a-z0-9-]+$/
    expect(bodyOf(post).slug).toBe('kasese-pure-honey-1l');
    expect(bodyOf(post).slug).toMatch(/^[a-z0-9-]+$/);
  });

  it('sends the price as a number, not the form string', async () => {
    await productsApi.create(FORM as any);
    expect(bodyOf(post).basePrice).toBe(35000);
  });

  it('defaults to PENDING_APPROVAL — publishing is moderation’s outcome', async () => {
    await productsApi.create(FORM as any);
    expect(bodyOf(post).status).toBe('PENDING_APPROVAL');
  });

  it('honours an explicit DRAFT', async () => {
    await productsApi.create({ ...FORM, status: 'DRAFT' } as any);
    expect(bodyOf(post).status).toBe('DRAFT');
  });

  it('never sends a seller id — the gateway stamps it from the JWT', async () => {
    await productsApi.create({ ...FORM, sellerId: 'seller-999' } as any);
    expect(bodyOf(post)).not.toHaveProperty('sellerId');
    expect(bodyOf(post)).not.toHaveProperty('vendorId');
  });
});

describe('toPayload — the variant that makes it sellable', () => {
  it('sends exactly one variant', async () => {
    await productsApi.create(FORM as any);
    expect(bodyOf(post).variants).toHaveLength(1);
  });

  it('carries the SKU the seller typed', async () => {
    await productsApi.create(FORM as any);
    expect(bodyOf(post).variants[0].sku).toBe('HNY-001');
  });

  it('carries the stock the seller typed, as a number', async () => {
    await productsApi.create(FORM as any);
    expect(bodyOf(post).variants[0].stock).toBe(48);
  });

  it('prices the variant from the product price', async () => {
    await productsApi.create(FORM as any);
    expect(bodyOf(post).variants[0].price).toBe(35000);
  });

  it('omits a blank SKU so the server generates one, rather than sending ""', async () => {
    // CreateVariantSchema is `sku: z.string().min(1).optional()` — an empty
    // string is a 422, absence is a generated SKU.
    await productsApi.create({ ...FORM, sku: '   ' } as any);
    expect(bodyOf(post).variants[0].sku).toBeUndefined();
  });

  it('defaults stock to 0 when the field is left blank', async () => {
    // Number(undefined) is NaN, which fails the server's int check and 422s the
    // whole create over an optional field.
    await productsApi.create({ ...FORM, stock: undefined } as any);
    expect(bodyOf(post).variants[0].stock).toBe(0);
  });

  it('sends an empty attribute map — the create form has no options', async () => {
    await productsApi.create(FORM as any);
    expect(bodyOf(post).variants[0].attributes).toEqual({});
  });
});

describe('toPayload — lists', () => {
  it('splits comma-separated tags and trims them', async () => {
    await productsApi.create({ ...FORM, tags: 'honey, organic , raw' } as any);
    expect(bodyOf(post).tags).toEqual(['honey', 'organic', 'raw']);
  });

  it('drops empty entries rather than sending blanks', async () => {
    await productsApi.create({ ...FORM, imageUrls: 'https://a.test/1.jpg, ,' } as any);
    expect(bodyOf(post).images).toEqual(['https://a.test/1.jpg']);
  });
});
