import { apiClient } from './axios.config';
import type { Category } from '@/types/category.types';
import type { ApiEnvelope } from '@/types/api.types';

// ─── Categories ───────────────────────────────────────────────────────────────
//
// Backed by product-service:
//   GET    /api/v1/categories/flat      the whole tree, flattened
//   POST   /api/v1/admin/categories
//   PATCH  /api/v1/admin/categories/:id
//   DELETE /api/v1/admin/categories/:id
//
// This module used to be an in-memory store seeded from a generator, with a
// comment saying "there is no real backend for this batch". There is — these
// routes existed the whole time.
//
// ── Field mapping ──
// product-service names the flag `active`; the panel has always called it
// `isActive`. Mapping here rather than renaming across the UI keeps the change
// contained, and one place to look when the shapes drift.

/** product-service's wire shape for a category. */
interface CategoryDto {
  id: string;
  name: string;
  slug: string;
  description?: string | null;
  imageUrl?: string | null;
  parentId: string | null;
  sortOrder: number;
  active: boolean;
  commissionFeePercent: number | string;
  createdAt: string;
}

function toCategory(dto: CategoryDto): Category {
  return {
    id: dto.id,
    name: dto.name,
    slug: dto.slug,
    parentId: dto.parentId ?? null,
    sortOrder: dto.sortOrder,
    imageUrl: dto.imageUrl ?? undefined,
    isActive: dto.active,
    createdAt: dto.createdAt,
    // Prisma serialises Decimal as a string; Number() handles both shapes.
    commissionFeePercent: Number(dto.commissionFeePercent ?? 0),
  };
}

/** Panel shape → product-service's create/update body. */
function toRequest(data: Partial<Category>): Record<string, unknown> {
  const body: Record<string, unknown> = {};
  if (data.name !== undefined) body.name = data.name;
  if (data.slug !== undefined) body.slug = data.slug;
  if (data.parentId !== undefined) body.parentId = data.parentId ?? undefined;
  if (data.sortOrder !== undefined) body.sortOrder = data.sortOrder;
  if (data.imageUrl !== undefined) body.imageUrl = data.imageUrl;
  if (data.isActive !== undefined) body.active = data.isActive;
  if (data.commissionFeePercent !== undefined) body.commissionFeePercent = data.commissionFeePercent;
  return body;
}

export const categoriesApi = {
  list: async (): Promise<ApiEnvelope<Category[]>> => {
    // `/flat` rather than the nested tree: the panel builds its own hierarchy
    // from parentId and needs every node addressable.
    const { data } = await apiClient.get<ApiEnvelope<CategoryDto[]>>('/categories/flat');
    return { ...data, data: (data.data ?? []).map(toCategory) };
  },

  create: async (payload: Partial<Category>): Promise<ApiEnvelope<Category>> => {
    const { data } = await apiClient.post<ApiEnvelope<CategoryDto>>(
      '/admin/categories',
      toRequest(payload),
    );
    return { ...data, data: toCategory(data.data) };
  },

  update: async (id: string, payload: Partial<Category>): Promise<ApiEnvelope<Category>> => {
    const { data } = await apiClient.patch<ApiEnvelope<CategoryDto>>(
      `/admin/categories/${encodeURIComponent(id)}`,
      toRequest(payload),
    );
    return { ...data, data: toCategory(data.data) };
  },

  delete: async (id: string): Promise<ApiEnvelope<void>> => {
    const { data } = await apiClient.delete<ApiEnvelope<void>>(
      `/admin/categories/${encodeURIComponent(id)}`,
    );
    return data;
  },

  /**
   * Persist a drag-and-drop reorder.
   *
   * product-service exposes no bulk-reorder route, so this issues one PATCH per
   * moved node. Sequential rather than parallel: a burst of concurrent writes
   * against the same tree is how sortOrder collisions happen, and a reorder is
   * a handful of rows at most.
   */
  reorder: async (orderings: { id: string; sortOrder: number }[]): Promise<ApiEnvelope<void>> => {
    for (const { id, sortOrder } of orderings) {
      await apiClient.patch(`/admin/categories/${encodeURIComponent(id)}`, { sortOrder });
    }
    return { success: true, data: undefined };
  },
};
