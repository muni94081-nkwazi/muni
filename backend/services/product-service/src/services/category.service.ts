import { prisma } from '../db/prisma.js';
import { z } from 'zod';

// Zod schemas
export const CreateCategorySchema = z.object({
  name: z.string().min(2).max(100),
  slug: z.string().min(2).max(100).regex(/^[a-z0-9-]+$/),
  description: z.string().optional(),
  imageUrl: z.string().url().optional(),
  parentId: z.string().optional(),
  sortOrder: z.number().int().default(0),
  // 0-100: a category cannot take more than the whole sale.
  commissionFeePercent: z.number().min(0).max(100).default(0),
});

export const UpdateCategorySchema = CreateCategorySchema.partial();
// z.input, not z.infer: fields with `.default()` are optional on the way IN
// and guaranteed on the way OUT. Using the output type here made every
// defaulted field mandatory for callers, which is the opposite of the intent.
export type CreateCategoryInput = z.input<typeof CreateCategorySchema>;

/**
 * Fetch the COMPLETE category tree in a single recursive CTE query.
 * Returns nested structure: { id, name, slug, level, path, children: [...] }
 */
export async function getCategoryTree() {
  // Single recursive CTE — one round trip to the DB
  const flat = await prisma.$queryRaw<Array<{
    id: string; slug: string; name: string; description: string | null;
    imageUrl: string | null; parentId: string | null; level: number;
    path: string; sortOrder: number; active: boolean; createdAt: Date;
  }>>`
    WITH RECURSIVE category_tree AS (
      -- Anchor: root categories (no parent)
      SELECT
        id, slug, name, description, "imageUrl", "parentId",
        0 AS level,
        CAST(slug AS TEXT) AS path,
        "sortOrder", active, "createdAt"
      FROM "Category"
      WHERE "parentId" IS NULL AND active = true

      UNION ALL

      -- Recursive: children of already-found categories
      SELECT
        c.id, c.slug, c.name, c.description, c."imageUrl", c."parentId",
        ct.level + 1,
        ct.path || '/' || c.slug,
        c."sortOrder", c.active, c."createdAt"
      FROM "Category" c
      INNER JOIN category_tree ct ON c."parentId" = ct.id
      WHERE c.active = true
    )
    SELECT * FROM category_tree
    ORDER BY level ASC, "sortOrder" ASC, name ASC;
  `;

  // Build nested tree from flat list
  return buildTree(flat);
}

/** Recursively build nested tree from flat DB rows */
function buildTree(flat: Array<{ id: string; parentId: string | null; [key: string]: unknown }>) {
  const map = new Map<string, Record<string, unknown>>();
  const roots: Record<string, unknown>[] = [];

  for (const row of flat) {
    map.set(row.id, { ...row, children: [] });
  }

  for (const row of flat) {
    const node = map.get(row.id)!;
    if (row.parentId && map.has(row.parentId)) {
      (map.get(row.parentId)!.children as unknown[]).push(node);
    } else {
      roots.push(node);
    }
  }

  return roots;
}

/**
 * Flat list (for selects/dropdowns) with level and path for display.
 */
export async function getCategoriesFlat() {
  return prisma.category.findMany({
    where:   { active: true },
    orderBy: [{ level: 'asc' }, { sortOrder: 'asc' }, { name: 'asc' }],
  });
}

/**
 * Get a single category with its full breadcrumb ancestor chain.
 */
export async function getCategoryById(id: string) {
  const category = await prisma.category.findUnique({
    where:   { id },
    include: { children: { where: { active: true }, orderBy: { sortOrder: 'asc' } } },
  });
  if (!category) return null;

  // Build breadcrumb from path
  const breadcrumb = await prisma.$queryRaw<Array<{ id: string; name: string; slug: string }>>`
    WITH RECURSIVE ancestors AS (
      SELECT id, name, slug, "parentId", 0 AS depth
      FROM "Category" WHERE id = ${id}
      UNION ALL
      SELECT c.id, c.name, c.slug, c."parentId", a.depth + 1
      FROM "Category" c JOIN ancestors a ON c.id = a."parentId"
    )
    SELECT id, name, slug FROM ancestors ORDER BY depth DESC;
  `;

  return { ...category, breadcrumb };
}

/**
 * Get all descendant category IDs (for filtering products by parent category).
 * Returns flat array of IDs including the given category itself.
 */
export async function getCategoryDescendantIds(categoryId: string): Promise<string[]> {
  const rows = await prisma.$queryRaw<Array<{ id: string }>>`
    WITH RECURSIVE descendants AS (
      SELECT id FROM "Category" WHERE id = ${categoryId}
      UNION ALL
      SELECT c.id FROM "Category" c
      INNER JOIN descendants d ON c."parentId" = d.id
    )
    SELECT id FROM descendants;
  `;
  return rows.map((r) => r.id);
}

/**
 * Create a category. Auto-computes level and path from parentId.
 */
export async function createCategory(input: CreateCategoryInput) {
  const validated = CreateCategorySchema.parse(input);

  let level = 0;
  let path  = `/${validated.slug}`;

  if (validated.parentId) {
    const parent = await prisma.category.findUniqueOrThrow({ where: { id: validated.parentId } });
    level = parent.level + 1;
    path  = `${parent.path}/${validated.slug}`;
  }

  return prisma.category.create({
    data: { ...validated, level, path },
  });
}

export async function updateCategory(id: string, input: z.infer<typeof UpdateCategorySchema>) {
  const validated = UpdateCategorySchema.parse(input);
  return prisma.category.update({ where: { id }, data: validated });
}

export async function deleteCategory(id: string) {
  // Check no active products use this category
  const count = await prisma.product.count({ where: { categoryId: id, status: 'ACTIVE' } });
  if (count > 0) {
    throw new Error(`Cannot delete category: ${count} active product(s) use it. Reassign them first.`);
  }
  // Check no children
  const childCount = await prisma.category.count({ where: { parentId: id } });
  if (childCount > 0) {
    throw new Error(`Cannot delete category: it has ${childCount} sub-categor${childCount === 1 ? 'y' : 'ies'}. Delete or move them first.`);
  }
  return prisma.category.update({ where: { id }, data: { active: false } });
}
