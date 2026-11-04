import axiosInstance from './axios.config';

// ─── Product Variants API ─────────────────────────────────────────────────────
//
// SKU-level CRUD, served by product-service under the /api/v1/products prefix
// (see backend/services/product-service/src/app.ts:93-103).
//
// Note the prefix: these routes are on the PUBLIC `/products` mount, not
// `/seller/products`, so the gateway applies no role check. Authorisation is by
// OWNERSHIP instead — each mutation reads the gateway-stamped `x-user-id` and
// variant.service verifies the caller owns the parent product, answering 403
// otherwise (variant.controller.ts:38-51). That holds because only a
// ROLE_SELLER can create a product to own in the first place. Nothing here
// sends a seller id; doing so would be decorative at best.

/** A variant exactly as product-service returns it. */
export interface Variant {
  id:                string;
  productId:         string;
  sku:               string;
  attributes:        Record<string, string>;
  price:             number;
  compareAtPrice:    number | null;
  stock:             number;
  reserved:          number;
  availableStock?:   number;
  lowStockThreshold: number;
  images:            string[];
  active:            boolean;
}

/** What the create/update endpoints accept — CreateVariantSchema in variant.service.ts. */
export interface VariantInput {
  sku?:               string;   // generated from the product slug when omitted
  attributes:         Record<string, string>;
  price:              number;
  compareAtPrice?:    number;
  stock:              number;
  lowStockThreshold?: number;
  images?:            string[];
}

interface Envelope<T> { success: boolean; data: T }

export const variantsApi = {
  list: async (productId: string): Promise<Variant[]> => {
    const { data } = await axiosInstance.get<Envelope<Variant[]>>(
      `/products/${encodeURIComponent(productId)}/variants`,
    );
    return data.data ?? [];
  },

  create: async (productId: string, input: VariantInput): Promise<Variant> => {
    const { data } = await axiosInstance.post<Envelope<Variant>>(
      `/products/${encodeURIComponent(productId)}/variants`,
      input,
    );
    return data.data;
  },

  update: async (
    productId: string,
    variantId: string,
    input: Partial<VariantInput>,
  ): Promise<Variant> => {
    const { data } = await axiosInstance.put<Envelope<Variant>>(
      `/products/${encodeURIComponent(productId)}/variants/${encodeURIComponent(variantId)}`,
      input,
    );
    return data.data;
  },

  remove: async (productId: string, variantId: string): Promise<void> => {
    await axiosInstance.delete(
      `/products/${encodeURIComponent(productId)}/variants/${encodeURIComponent(variantId)}`,
    );
  },
};
