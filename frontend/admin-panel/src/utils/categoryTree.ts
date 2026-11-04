import type { Category, CategoryTreeNode } from '@/types/category.types';

/** Maximum allowed nesting depth for the category tree (root categories count as depth 1). */
export const MAX_CATEGORY_DEPTH = 4;

/** Turns a free-text category name into a URL-safe slug. */
export function slugify(text: string): string {
  return text
    .toString()
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** Computes the 1-based depth of a category (or a would-be category under `parentId`) within the flat list. */
export function computeDepth(parentId: string | null, categories: Category[]): number {
  let depth = 1;
  let currentParentId = parentId;
  const byId = new Map(categories.map((c) => [c.id, c]));
  const seen = new Set<string>();
  while (currentParentId) {
    if (seen.has(currentParentId)) break; // guard against accidental cycles
    seen.add(currentParentId);
    const parent = byId.get(currentParentId);
    if (!parent) break;
    depth += 1;
    currentParentId = parent.parentId;
  }
  return depth;
}

/** Builds a nested tree from a flat category list, sorted by sortOrder within each level. */
export function buildCategoryTree(categories: Category[]): CategoryTreeNode[] {
  const byId = new Map<string, CategoryTreeNode>();
  categories.forEach((c) => byId.set(c.id, { ...c, children: [], depth: 1 }));

  const roots: CategoryTreeNode[] = [];
  byId.forEach((node) => {
    if (node.parentId && byId.has(node.parentId)) {
      byId.get(node.parentId)!.children.push(node);
    } else {
      roots.push(node);
    }
  });

  const assignDepth = (nodes: CategoryTreeNode[], depth: number) => {
    nodes.sort((a, b) => a.sortOrder - b.sortOrder);
    nodes.forEach((n) => {
      n.depth = depth;
      assignDepth(n.children, depth + 1);
    });
  };
  assignDepth(roots, 1);

  return roots;
}

/** Returns true if `candidateId` is `ancestorId` itself or a descendant of it (used to block cyclic re-parenting). */
export function isDescendantOf(candidateId: string, ancestorId: string, categories: Category[]): boolean {
  let current = categories.find((c) => c.id === candidateId) ?? null;
  const seen = new Set<string>();
  while (current) {
    if (current.id === ancestorId) return true;
    if (seen.has(current.id)) break;
    seen.add(current.id);
    current = categories.find((c) => c.id === current!.parentId) ?? null;
  }
  return false;
}
