import axiosInstance from './axios.config';
import type { Product } from '../types/product.types';

// ─── Seller Products API ──────────────────────────────────────────────────────
//
// Every call goes to /api/v1/seller/products, which the gateway gates with
// requireRole('ROLE_SELLER', …) and proxies to product-service. The seller id is
// never sent from here: the gateway stamps x-user-id from the verified JWT and
// product-service scopes the query by it. A `vendorId` parameter would be
// decorative at best and a tampering vector at worst.

export interface SellerProductPage {
  data:  Product[];
  meta:  { current_page: number; last_page: number; per_page: number; total: number };
}

export interface ProductFormValues {
  name:            string;
  description?:    string;
  price:           number | string;
  compareAtPrice?: number | string;
  /**
   * The stock-keeping unit for this listing's single SKU.
   *
   * ProductForm has always collected this — as a REQUIRED field — but it was
   * absent from this interface and dropped by toPayload, so it never left the
   * browser. Same for `stock` below.
   */
  sku?:            string;
  stock?:          number | string;
  category?:       string;
  brand?:          string;
  tags?:           string;         // comma-separated in the form
  imageUrls?:      string | string[];
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

function toList(value: string | string[] | undefined): string[] {
  if (!value) return [];
  if (Array.isArray(value)) return value.filter(Boolean);
  return value.split(',').map((v) => v.trim()).filter(Boolean);
}

/**
 * The form collects display values (strings, comma-separated lists); the API
 * takes a typed payload. Converting here keeps ProductForm free of API shape.
 */
function toPayload(values: ProductFormValues) {
  const compareAt = values.compareAtPrice === '' || values.compareAtPrice == null
    ? undefined
    : Number(values.compareAtPrice);

  const basePrice = Number(values.price);

  // Stock is a variant-level concept — there is no product-level stock column,
  // and product-service derives `inStock` from
  // `variants.some(v => v.stock - v.reserved > 0)`. A product created with no
  // variants is therefore permanently out of stock and can never be bought,
  // which is what every listing created through this form used to be: the form
  // collected `sku` and `stock` and this function silently discarded both.
  //
  // One variant, from the values the seller actually typed. Multi-SKU products
  // are managed afterwards through VariantManager on the edit page.
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
    tags:           toList(values.tags),
    images:         toList(values.imageUrls),
    // Submitting for review is the default action. product-service rejects
    // 'ACTIVE' outright — that status is an outcome of moderation, not an input.
    status:         values.status ?? 'PENDING_APPROVAL',
    variants: [
      {
        // Omitted rather than sent empty: product-service generates a SKU from
        // the slug when this is absent, and an empty string fails its min(1).
        sku:        values.sku?.trim() || undefined,
        // No options on the create form, so no attributes. The seller adds
        // colour/size SKUs afterwards on the edit page.
        attributes: {},
        price:      basePrice,
        // Number('') is 0, but Number(undefined) is NaN — which fails the
        // server's int check and 422s the whole create over a blank field.
        stock:      Number.isFinite(stock) ? stock : 0,
      },
    ],
  };
}

export const productsApi = {
  /** The seller's own catalogue — every status, including PENDING_APPROVAL and REJECTED. */
  list: async (page = 1, perPage = 20, status?: string, q?: string): Promise<SellerProductPage> => {
    const { data } = await axiosInstance.get('/seller/products', {
      // product-service pages from 0; the UI pages from 1.
      params: { page: Math.max(0, page - 1), limit: perPage, status: status || undefined, q: q || undefined },
    });
    return { data: data.data, meta: data.meta };
  },

  getById: async (id: string): Promise<Product> => {
    const { data } = await axiosInstance.get(`/seller/products/${id}`);
    return data.data;
  },

  create: async (values: ProductFormValues): Promise<Product> => {
    const { data } = await axiosInstance.post('/seller/products', toPayload(values));
    return data.data;
  },

  update: async (id: string, values: Partial<ProductFormValues>): Promise<Product> => {
    const { data } = await axiosInstance.put(
      `/seller/products/${id}`,
      toPayload(values as ProductFormValues),
    );
    return data.data;
  },

  /** Archives rather than deletes — product-service sets status ARCHIVED. */
  remove: async (id: string): Promise<void> => {
    await axiosInstance.delete(`/seller/products/${id}`);
  },

  getCategories: async () => {
    const { data } = await axiosInstance.get('/categories/flat');
    return data.data ?? data;
  },
};
