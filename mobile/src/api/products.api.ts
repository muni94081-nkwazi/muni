import { apiClient, type ApiEnvelope } from './client';
import type { Category, Product } from '@/types';

// ─── Reviews ──────────────────────────────────────────────────────────────────
//
// The gateway routes /reviews straight to review-service (customer.routes.ts:
// `pub('/reviews', targets.review)`) — NOT through product-service, despite
// where this method lives. Reading is public; POST requires an actor.

export interface CreateReviewInput {
  productId: string;
  rating: number;
  body: string;
  title?: string;
  variantId?: string;
  /** Ties the review to a specific purchase when the buyer ordered twice. */
  orderId?: string;
}

export interface Review {
  id: string;
  productId: string;
  userId: string;
  rating: number;
  title?: string;
  body: string;
  verifiedPurchase?: boolean;
  createdAt: string;
}

export interface ProductListParams {
  page?: number;
  limit?: number;
  categoryId?: string;
  sort?: string;
  [key: string]: string | number | boolean | undefined;
}

export interface ProductListResult {
  products: Product[];
  total: number;
  page: number;
}

/**
 * Raw envelope of `GET /api/v1/products`.
 *
 * product-service does `res.json({ success: true, ...result })` — it SPREADS
 * the service result rather than nesting it, so `data` is the product array and
 * the paging lives in a sibling `meta`. There is no `data.data.products`, which
 * is what this client used to read.
 */
interface ProductListEnvelope {
  success: boolean;
  data: Product[];
  meta: {
    current_page: number;
    last_page: number;
    per_page: number;
    total: number;
  };
}

export interface ProductSearchResult {
  products: Product[];
  total: number;
  /** 1-indexed here, unlike the 0-indexed page on GET /products. */
  page: number;
  pages: number;
  /** Spelling correction search-service offers when a query barely matched. */
  didYouMean?: string | null;
}

/** The sort modes search-service accepts; anything else is a 400. */
export type ProductSortBy = 'relevance' | 'price_asc' | 'price_desc' | 'rating' | 'newest';

/**
 * Exactly the query search-service's `SearchQuerySchema` parses
 * (search-service/src/controllers/search.controller.ts). Typed rather than an
 * open Record so the UI can only offer filters the service really applies —
 * an unknown key is silently dropped there, which would show the shopper a
 * control that does nothing.
 */
export interface ProductSearchFilters {
  category?: string;
  categoryId?: string;
  sellerId?: string;
  minPrice?: number;
  maxPrice?: number;
  minRating?: number;
  inStock?: 'true' | 'false';
  sortBy?: ProductSortBy;
  /** 1-indexed. */
  page?: number;
  limit?: number;
}

export const productsApi = {
  /**
   * Normalises product-service's `{ data, meta }` into the flatter shape the
   * screens use. Doing it here means one place knows about `meta.current_page`
   * rather than every caller.
   */
  getProducts: async (params?: ProductListParams): Promise<ProductListResult> => {
    const { data } = await apiClient.get<ProductListEnvelope>('/api/v1/products', {
      params,
    });
    return {
      products: data.data ?? [],
      total: data.meta?.total ?? 0,
      page: data.meta?.current_page ?? 1,
    };
  },

  getProductById: async (id: string): Promise<Product> => {
    const { data } = await apiClient.get<ApiEnvelope<Product>>(`/api/v1/products/${id}`);
    return data.data;
  },

  /**
   * Full-text product search.
   *
   * `/api/v1/search` is served by product-service now, not search-service (see
   * the note on the route in api-gateway/src/routes/customer.routes.ts), and it
   * answers with the same `{ data, meta }` shape as `/api/v1/products` above —
   * NOT search-service's `{ data: { products, total, pages, didYouMean } }`.
   *
   * This read `data.data.products` with a `?? []` fallback. Against the new
   * response `data.data` is the array itself, so `.products` is undefined and
   * every search would have quietly returned zero results — no error, no empty
   * state distinguishable from "nothing matched". The fallbacks that were meant
   * to make this robust are exactly what would have hidden it.
   *
   * `didYouMean` is search-service's spelling correction and has no equivalent
   * in product-service's response. Reported as null rather than dropped from
   * the type, so the screens that render it keep compiling and simply never
   * show a suggestion.
   */
  searchProducts: async (
    query: string,
    filters?: ProductSearchFilters
  ): Promise<ProductSearchResult> => {
    const { sortBy, page, inStock, ...rest } = filters ?? {};

    const { data } = await apiClient.get<ProductListEnvelope>('/api/v1/search', {
      params: {
        q: query,
        ...rest,
        // Sent only when true. ListProductsSchema parses this with
        // `z.coerce.boolean()`, and Boolean('false') is TRUE — every non-empty
        // string is. Sending inStock='false' would therefore filter to in-stock
        // only, the exact opposite of what it asks for. Omitting it means "no
        // stock filter", which is what the app means by false anyway.
        ...(inStock === 'true' ? { inStock: 'true' } : {}),
        // ListProductsSchema calls it `sort`, and rejects an unknown sort value
        // rather than ignoring it.
        ...(sortBy ? { sort: sortBy } : {}),
        // These filters are 1-indexed in the app and 0-indexed in the API. Sent
        // as-is, page 1 silently skipped the first page of results.
        ...(page !== undefined ? { page: Math.max(0, page - 1) } : {}),
      },
    });

    const total = data.meta?.total ?? 0;
    const perPage = data.meta?.per_page ?? 20;

    return {
      products: data.data ?? [],
      total,
      // Back to 1-indexed for the screens.
      page: (data.meta?.current_page ?? 0) + 1,
      pages: perPage > 0 ? Math.max(1, Math.ceil(total / perPage)) : 1,
      didYouMean: null,
    };
  },

  /**
   * `/api/v1/categories`, not `/api/v1/products/categories` — the latter has no
   * route and falls through to `/products/:id` with id="categories", so it
   * 404'd on every call. The gateway mounts this publicly
   * (`pub('/categories', targets.product)`), so it works signed-out.
   *
   * Enveloped as `{ success, data }` here, unlike the product list above.
   */
  getCategories: async (): Promise<Category[]> => {
    const { data } = await apiClient.get<ApiEnvelope<Category[]>>('/api/v1/categories');
    return data.data;
  },

  getRelatedProducts: async (productId: string): Promise<Product[]> => {
    const { data } = await apiClient.get<ApiEnvelope<Product[]>>(
      `/api/v1/products/${productId}/related`
    );
    return data.data;
  },

  /**
   * POST /api/v1/reviews
   *
   * review-service enforces its own eligibility rules server-side — a 403 here
   * means "you have not bought this / already reviewed it", which is authoritative
   * regardless of what the client believed when it showed the form.
   *
   * `body` must be at least 10 characters or the service rejects it with a 400.
   */
  createReview: async (input: CreateReviewInput): Promise<Review> => {
    const { data } = await apiClient.post<ApiEnvelope<Review>>('/api/v1/reviews', input);
    return data.data;
  },
};
