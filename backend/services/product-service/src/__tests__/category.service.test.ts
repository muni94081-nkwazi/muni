/**
 * Phase 7 — Category Service Unit Tests
 *
 * Tests the recursive CTE tree builder and CRUD operations.
 * Uses jest.unstable_mockModule (ESM pattern) to mock Prisma.
 */
import { describe, it, expect, beforeEach, jest } from '@jest/globals';

// ── Mock prisma BEFORE importing the module under test ────────────────────────
const mockPrisma = {
  $queryRaw: jest.fn<(...args: any[]) => any>(),
  category: {
    findMany:          jest.fn<(...args: any[]) => any>(),
    findUnique:        jest.fn<(...args: any[]) => any>(),
    findUniqueOrThrow: jest.fn<(...args: any[]) => any>(),
    create:            jest.fn<(...args: any[]) => any>(),
    update:            jest.fn<(...args: any[]) => any>(),
    count:             jest.fn<(...args: any[]) => any>(),
  },
  product: {
    count: jest.fn<(...args: any[]) => any>(),
  },
};

jest.unstable_mockModule('../db/prisma.js', () => ({ prisma: mockPrisma }));

const { getCategoryTree, createCategory, deleteCategory, getCategoryDescendantIds } =
  await import('../services/category.service.js');

// ── Helpers ───────────────────────────────────────────────────────────────────

const flatCategories = [
  { id: 'cat-1', slug: 'electronics', name: 'Electronics', parentId: null,    level: 0, path: 'electronics',           sortOrder: 0, active: true, createdAt: new Date() },
  { id: 'cat-2', slug: 'phones',      name: 'Phones',      parentId: 'cat-1', level: 1, path: 'electronics/phones',    sortOrder: 0, active: true, createdAt: new Date() },
  { id: 'cat-3', slug: 'android',     name: 'Android',     parentId: 'cat-2', level: 2, path: 'electronics/phones/android', sortOrder: 0, active: true, createdAt: new Date() },
  { id: 'cat-4', slug: 'fashion',     name: 'Fashion',     parentId: null,    level: 0, path: 'fashion',               sortOrder: 1, active: true, createdAt: new Date() },
];

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('category.service — getCategoryTree()', () => {
  beforeEach(() => { jest.clearAllMocks(); });

  it('builds a correctly nested tree from flat CTE result', async () => {
    mockPrisma.$queryRaw.mockResolvedValueOnce(flatCategories);

    const tree = await getCategoryTree() as Array<{ id: string; children: unknown[] }>;

    // Should have 2 root categories
    expect(tree).toHaveLength(2);

    const electronics = tree.find((n) => n.id === 'cat-1')!;
    expect(electronics).toBeDefined();

    // Electronics → Phones → Android
    const phones = (electronics.children as Array<{ id: string; children: unknown[] }>).find((c) => c.id === 'cat-2')!;
    expect(phones).toBeDefined();
    expect(phones.children).toHaveLength(1);
    expect((phones.children as Array<{ id: string }>)[0].id).toBe('cat-3');
  });

  it('returns an empty array when no categories exist', async () => {
    mockPrisma.$queryRaw.mockResolvedValueOnce([]);
    const tree = await getCategoryTree();
    expect(tree).toEqual([]);
  });
});

describe('category.service — createCategory()', () => {
  beforeEach(() => { jest.clearAllMocks(); });

  it('creates a root category with level=0 and path=/<slug>', async () => {
    mockPrisma.category.create.mockResolvedValueOnce({
      id: 'new-cat', slug: 'food', name: 'Food', level: 0, path: '/food', parentId: null,
    });

    const result = await createCategory({ name: 'Food', slug: 'food', sortOrder: 0 });

    expect(mockPrisma.category.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ level: 0, path: '/food' }),
      }),
    );
    expect(result).toMatchObject({ slug: 'food', level: 0 });
  });

  it('creates a child category with parent level+1 and inherited path', async () => {
    mockPrisma.category.findUniqueOrThrow.mockResolvedValueOnce({
      id: 'cat-1', slug: 'electronics', level: 0, path: '/electronics',
    });
    mockPrisma.category.create.mockResolvedValueOnce({
      id: 'new-sub', slug: 'phones', name: 'Phones', level: 1, path: '/electronics/phones', parentId: 'cat-1',
    });

    const result = await createCategory({
      name: 'Phones', slug: 'phones', parentId: 'cat-1', sortOrder: 0,
    });

    expect(mockPrisma.category.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ level: 1, path: '/electronics/phones' }),
      }),
    );
    expect(result.level).toBe(1);
  });

  it('rejects invalid slug (non-kebab-case)', async () => {
    await expect(createCategory({ name: 'Bad Slug!', slug: 'Bad Slug!', sortOrder: 0 }))
      .rejects.toThrow();
  });
});

describe('category.service — deleteCategory()', () => {
  beforeEach(() => { jest.clearAllMocks(); });

  it('blocks deletion when active products use the category', async () => {
    mockPrisma.product.count.mockResolvedValueOnce(5);
    await expect(deleteCategory('cat-1')).rejects.toThrow('5 active product(s)');
  });

  it('blocks deletion when sub-categories exist', async () => {
    mockPrisma.product.count.mockResolvedValueOnce(0);
    mockPrisma.category.count.mockResolvedValueOnce(2);
    await expect(deleteCategory('cat-1')).rejects.toThrow('2 sub-categor');
  });

  it('soft-deletes the category when it is safe to do so', async () => {
    mockPrisma.product.count.mockResolvedValueOnce(0);
    mockPrisma.category.count.mockResolvedValueOnce(0);
    mockPrisma.category.update.mockResolvedValueOnce({ id: 'cat-1', active: false });

    await deleteCategory('cat-1');

    expect(mockPrisma.category.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { active: false } }),
    );
  });
});
