import { apiClient } from './axios.config';
import type { Product, ProductStatus, ModerationCounts } from '@/types/product.types';

// ─── Admin Products API ───────────────────────────────────────────────────────
//
// Every call goes to /api/v1/admin/products, gated at the gateway by
// requireRole('ROLE_ADMIN', 'ROLE_SUPER_ADMIN') and proxied to product-service.
// The admin's identity is stamped as x-user-id from the verified JWT, which is
// what product-service records in Product.moderatedBy — nothing is sent from here.

export interface ProductPage {
  data: Product[];
  meta: { current_page: number; last_page: number; per_page: number; total: number };
}

export const productsApi = {
  /** Moderation queue. Defaults to PENDING_APPROVAL, oldest submission first. */
  list: async (
    page = 1,
    pageSize = 20,
    status: ProductStatus = 'PENDING_APPROVAL',
    q?: string,
  ): Promise<ProductPage> => {
    const { data } = await apiClient.get('/admin/products', {
      // product-service pages from 0; this UI pages from 1.
      params: { page: Math.max(0, page - 1), limit: pageSize, status, q: q || undefined },
    });
    return { data: data.data, meta: data.meta };
  },

  /** Per-status totals, for the queue badges. */
  counts: async (): Promise<ModerationCounts> => {
    const { data } = await apiClient.get('/admin/products/counts');
    return data.data;
  },

  getById: async (id: string): Promise<Product> => {
    const { data } = await apiClient.get(`/admin/products/${id}`);
    return data.data;
  },

  approve: async (id: string): Promise<Product> => {
    const { data } = await apiClient.patch(`/admin/products/${id}/moderate`, { action: 'approve' });
    return data.data;
  },

  // product-service requires a reason on reject — it is what the seller is
  // shown, so there is no reasonless variant of this call.
  reject: async (id: string, reason: string): Promise<Product> => {
    const { data } = await apiClient.patch(`/admin/products/${id}/moderate`, { action: 'reject', reason });
    return data.data;
  },
};

// ─── Admin/Owner product creation ─────────────────────────────────────────────
//
// Deliberately POSTs /seller/products — the SAME endpoint sellers use. There is
// no admin create endpoint in product-service, and adding one would be a second
// way to write the same table.
//
// The gateway's seller router already admits admins:
//   requireRole('ROLE_SELLER', 'ROLE_ADMIN', 'ROLE_SUPER_ADMIN')
// and product.controller.create takes the owner from the gateway-stamped
// x-user-id. So an admin creating a listing owns it, exactly as the backend
// already decides. Creating one *on behalf of another seller* is not something
// product-service supports, so this does not offer it — no sellerId is sent,
// and one would be ignored if it were.
//
// The payload shape matches seller-center's toPayload, including the single
// default variant: product-service derives `inStock` from its variants, so a
// product created without one is permanently unbuyable.

export interface AdminProductFormValues {
  name:            string;
  description?:    string;
  price:           number | string;
  compareAtPrice?: number | string;
  sku?:            string;
  stock?:          number | string;
  category?:       string;
  brand?:          string;
  tags?:           string;        // comma-separated in the form
  imageUrls?:      string[];
  status?:         'DRAFT' | 'PENDING_APPROVAL';
}

/** Match product-service's CreateProductSchema: /^[a-z0-9-]+$/ */
function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 200);
}

function toCreatePayload(values: AdminProductFormValues) {
  const compareAt =
    values.compareAtPrice === '' || values.compareAtPrice == null
      ? undefined
      : Number(values.compareAtPrice);

  const basePrice = Number(values.price);
  const stock = Number(values.stock);

  return {
    name:           values.name,
    slug:           slugify(values.name),
    description:    values.description || undefined,
    categoryId:     values.category || undefined,
    basePrice,
    compareAtPrice: compareAt,
    currency:       'UGX',
    brand:          values.brand || undefined,
    tags:           (values.tags ?? '').split(',').map((t) => t.trim()).filter(Boolean),
    images:         (values.imageUrls ?? []).filter(Boolean),
    // product-service rejects 'ACTIVE' as an input: that status is an outcome
    // of moderation. An admin-created listing goes through the same queue.
    status:         values.status ?? 'PENDING_APPROVAL',
    variants: [
      {
        // Omitted rather than empty — product-service generates a SKU from the
        // slug when absent, and '' fails its min(1).
        sku:        values.sku?.trim() || undefined,
        attributes: {},
        price:      basePrice,
        // Number('') is 0 but Number(undefined) is NaN, which 422s the create.
        stock:      Number.isFinite(stock) ? stock : 0,
      },
    ],
  };
}

export const adminProductCreateApi = {
  create: async (values: AdminProductFormValues) => {
    const { data } = await apiClient.post('/seller/products', toCreatePayload(values));
    return data.data;
  },
};
