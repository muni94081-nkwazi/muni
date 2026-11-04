import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Categories API ───────────────────────────────────────────────────────────
//
// This module used to be an in-memory store seeded from a generator, carrying
// the note "there is no real backend for this batch". product-service's
// category routes existed the whole time.
//
// What is asserted here is the part most likely to rot: the field mapping
// between product-service's wire shape (`active`, Decimal-as-string) and the
// panel's (`isActive`, number). A silent mismatch there shows as a category
// list where every row is inactive, or a commission of NaN.

const get = vi.fn();
const post = vi.fn();
const patch = vi.fn();
const del = vi.fn();

vi.mock('../axios.config', () => ({
  apiClient: {
    get: (...args: unknown[]) => get(...args),
    post: (...args: unknown[]) => post(...args),
    patch: (...args: unknown[]) => patch(...args),
    delete: (...args: unknown[]) => del(...args),
  },
}));

const { categoriesApi } = await import('../categories.api');

const dto = {
  id: 'c-1',
  name: 'Electronics',
  slug: 'electronics',
  parentId: null,
  sortOrder: 1,
  imageUrl: null,
  active: true,
  // Prisma serialises Decimal as a string — the shape the panel actually gets.
  commissionFeePercent: '12.50',
  createdAt: '2026-01-01T00:00:00.000Z',
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('list', () => {
  it('reads the flat tree and maps active → isActive', async () => {
    get.mockResolvedValue({ data: { success: true, data: [dto] } });

    const res = await categoriesApi.list();

    expect(get).toHaveBeenCalledWith('/categories/flat');
    expect(res.data[0].isActive).toBe(true);
    expect(res.data[0].name).toBe('Electronics');
  });

  it('coerces a Decimal-as-string commission to a number', async () => {
    // `.toFixed()` in the list column throws on a string, so this is the
    // difference between a rendered table and a blank screen.
    get.mockResolvedValue({ data: { success: true, data: [dto] } });

    const [category] = (await categoriesApi.list()).data;

    expect(category.commissionFeePercent).toBe(12.5);
    expect(typeof category.commissionFeePercent).toBe('number');
  });

  it('reports an inactive category as inactive', async () => {
    get.mockResolvedValue({ data: { success: true, data: [{ ...dto, active: false }] } });

    expect((await categoriesApi.list()).data[0].isActive).toBe(false);
  });

  it('returns an empty list rather than throwing when the tree is empty', async () => {
    get.mockResolvedValue({ data: { success: true, data: [] } });

    expect((await categoriesApi.list()).data).toEqual([]);
  });

  it('propagates a failure so the slice can show an error', async () => {
    // Swallowing this is what made a 500 look like "no categories exist".
    get.mockRejectedValue(new Error('Request failed with status code 500'));

    await expect(categoriesApi.list()).rejects.toThrow(/500/);
  });
});

describe('create', () => {
  it('sends isActive as the backend’s `active`', async () => {
    post.mockResolvedValue({ data: { success: true, data: dto } });

    await categoriesApi.create({ name: 'Electronics', slug: 'electronics', isActive: true });

    const [url, body] = post.mock.calls[0];
    expect(url).toBe('/admin/categories');
    expect(body).toMatchObject({ name: 'Electronics', active: true });
    expect(body).not.toHaveProperty('isActive');
  });

  it('omits fields the caller did not set, so a PATCH cannot blank them', () => {
    post.mockResolvedValue({ data: { success: true, data: dto } });

    return categoriesApi.create({ name: 'Only a name' }).then(() => {
      const [, body] = post.mock.calls[0];
      expect(Object.keys(body)).toEqual(['name']);
    });
  });
});

describe('update', () => {
  it('patches the addressed category', async () => {
    patch.mockResolvedValue({ data: { success: true, data: dto } });

    await categoriesApi.update('c-1', { commissionFeePercent: 15 });

    expect(patch).toHaveBeenCalledWith('/admin/categories/c-1', { commissionFeePercent: 15 });
  });
});

describe('reorder', () => {
  it('issues one patch per moved node, in order', async () => {
    // product-service has no bulk-reorder route; sequential writes avoid
    // sortOrder collisions on the same tree.
    patch.mockResolvedValue({ data: { success: true, data: dto } });

    await categoriesApi.reorder([
      { id: 'c-1', sortOrder: 2 },
      { id: 'c-2', sortOrder: 1 },
    ]);

    expect(patch.mock.calls.map((c) => c[0])).toEqual([
      '/admin/categories/c-1',
      '/admin/categories/c-2',
    ]);
  });
});
