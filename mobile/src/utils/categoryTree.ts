import type { Category } from '@/types';

/**
 * Lookups over the department tree from `GET /api/v1/categories`.
 *
 * The store holds only the roots; every subcategory lives in a `children`
 * array, so a plain `categories.find(...)` sees a fraction of the catalogue and
 * returns undefined for any aisle. These walk the whole tree instead.
 *
 * A category is addressed by slug or id because that is what the router carries
 * — `/category/[slug]` is given `category.slug || category.id`.
 */

/** The chain from the root down to the match, match last. Empty if not found. */
export function findCategoryPath(tree: Category[], slugOrId: string): Category[] {
  if (!slugOrId) return [];

  for (const node of tree) {
    if (node.slug === slugOrId || node.id === slugOrId) return [node];

    const deeper = findCategoryPath(node.children ?? [], slugOrId);
    if (deeper.length > 0) return [node, ...deeper];
  }

  return [];
}

/** The category itself, wherever it sits in the tree. */
export function findCategory(tree: Category[], slugOrId: string): Category | undefined {
  const path = findCategoryPath(tree, slugOrId);
  return path[path.length - 1];
}

/** Every category in the tree, depth-first — roots and aisles alike. */
export function flattenCategories(tree: Category[]): Category[] {
  return tree.flatMap((node) => [node, ...flattenCategories(node.children ?? [])]);
}
