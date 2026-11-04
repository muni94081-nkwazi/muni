import { findCategory, findCategoryPath, flattenCategories } from '../categoryTree';
import type { Category } from '@/types';

/**
 * Shaped like product-service's recursive CTE output: roots carrying nested
 * children, each node with the level and parentId the query emits.
 */
const TREE: Category[] = [
  {
    id: 'c1',
    name: 'Electronics',
    slug: 'electronics',
    level: 0,
    parentId: null,
    children: [
      { id: 'c1a', name: 'Phones', slug: 'phones', level: 1, parentId: 'c1', children: [] },
      {
        id: 'c1b',
        name: 'Laptops',
        slug: 'laptops',
        level: 1,
        parentId: 'c1',
        children: [
          { id: 'c1b1', name: 'Gaming', slug: 'gaming-laptops', level: 2, parentId: 'c1b', children: [] },
        ],
      },
    ],
  },
  { id: 'c2', name: 'Fashion', slug: 'fashion', level: 0, parentId: null, children: [] },
];

describe('findCategory', () => {
  it('finds a root department', () => {
    expect(findCategory(TREE, 'fashion')?.name).toBe('Fashion');
  });

  it('finds a subcategory the store never holds at the top level', () => {
    // A plain categories.find() would miss this — it is inside children.
    expect(findCategory(TREE, 'phones')?.name).toBe('Phones');
  });

  it('finds a category nested two levels down', () => {
    expect(findCategory(TREE, 'gaming-laptops')?.name).toBe('Gaming');
  });

  it('matches on id as well as slug, since the router falls back to id', () => {
    expect(findCategory(TREE, 'c1b1')?.name).toBe('Gaming');
  });

  it('returns undefined for an unknown slug rather than throwing', () => {
    expect(findCategory(TREE, 'nope')).toBeUndefined();
  });

  it('returns undefined for an empty slug', () => {
    expect(findCategory(TREE, '')).toBeUndefined();
  });

  it('copes with a flat catalogue that has no children arrays at all', () => {
    const flat: Category[] = [{ id: 'x', name: 'Books', slug: 'books' }];
    expect(findCategory(flat, 'books')?.name).toBe('Books');
  });
});

describe('findCategoryPath', () => {
  it('returns the ancestry, deepest last', () => {
    expect(findCategoryPath(TREE, 'gaming-laptops').map((c) => c.slug)).toEqual([
      'electronics',
      'laptops',
      'gaming-laptops',
    ]);
  });

  it('returns a single entry for a root', () => {
    expect(findCategoryPath(TREE, 'electronics').map((c) => c.slug)).toEqual(['electronics']);
  });

  it('returns empty for an unknown slug', () => {
    expect(findCategoryPath(TREE, 'nope')).toEqual([]);
  });
});

describe('flattenCategories', () => {
  it('returns every node in the tree, not just the roots', () => {
    expect(flattenCategories(TREE).map((c) => c.slug)).toEqual([
      'electronics',
      'phones',
      'laptops',
      'gaming-laptops',
      'fashion',
    ]);
  });

  it('returns an empty array for an empty tree', () => {
    expect(flattenCategories([])).toEqual([]);
  });
});
