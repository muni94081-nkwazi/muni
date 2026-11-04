import type { Category } from '@/types/category.types';
import { randomFloat, randomId, randomDateBetween } from './mockUtils';

const CATEGORY_TREE_SEED: { name: string; children?: { name: string; children?: { name: string }[] }[] }[] = [
  {
    name: 'Electronics',
    children: [
      { name: 'Smartphones', children: [{ name: 'Android Phones' }, { name: 'Feature Phones' }] },
      { name: 'Laptops & Computers', children: [{ name: 'Laptops' }, { name: 'Desktop PCs' }] },
      { name: 'Audio', children: [{ name: 'Headphones' }, { name: 'Speakers' }] },
    ],
  },
  {
    name: 'Fashion',
    children: [
      { name: "Men's Clothing", children: [{ name: 'Shirts' }, { name: 'Trousers' }] },
      { name: "Women's Clothing", children: [{ name: 'Dresses' }, { name: 'Skirts' }] },
      { name: 'Footwear' },
    ],
  },
  {
    name: 'Food & Grocery',
    children: [
      { name: 'Fresh Produce' },
      { name: 'Beverages', children: [{ name: 'Coffee & Tea' }, { name: 'Juices' }] },
      { name: 'Snacks' },
    ],
  },
  {
    name: 'Home & Kitchen',
    children: [
      { name: 'Cookware' },
      { name: 'Furniture', children: [{ name: 'Living Room' }, { name: 'Bedroom' }] },
    ],
  },
  {
    name: 'Beauty & Health',
    children: [{ name: 'Skincare' }, { name: 'Personal Care' }],
  },
];

/**
 * Generates a realistic, seeded nested category tree (parent/child/grandchild chains) as a flat
 * array — the shape the rest of the app (Redux slice, tree-builder UI) expects. Depth never
 * exceeds 3 in the seed data itself, leaving headroom for admins to add a 4th level in the UI
 * before the MAX_CATEGORY_DEPTH cap kicks in.
 */
export function generateCategoryTree(): Category[] {
  const flat: Category[] = [];
  const start = new Date('2023-01-01');
  const end = new Date('2024-06-01');

  const pushNode = (
    name: string,
    parentId: string | null,
    sortOrder: number,
    children: { name: string; children?: { name: string }[] }[] | undefined
  ): void => {
    const id = randomId('cat');
    flat.push({
      id,
      name,
      slug: name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, ''),
      parentId,
      sortOrder,
      isActive: true,
      createdAt: randomDateBetween(start, end),
      commissionFeePercent: Math.round(randomFloat(2, 18) * 10) / 10,
    });
    (children ?? []).forEach((child, idx) => {
      pushNode(child.name, id, idx + 1, (child as { children?: { name: string }[] }).children);
    });
  };

  CATEGORY_TREE_SEED.forEach((root, idx) => pushNode(root.name, null, idx + 1, root.children));

  return flat;
}
