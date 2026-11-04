import { apiClient } from './axios.config';
import type { ApiEnvelope, PaginatedResponse } from '@/types/api.types';
import type {
  Category,
  CreateReviewPayload,
  Product,
  ProductFilters,
  ProductReview,
  ProductVariant,
} from '@/types/product.types';

/**
 * Per-request options callers can thread through. Currently just the abort
 * signal, which search-as-you-type needs so a superseded keystroke's request is
 * cancelled rather than left racing the current one.
 */
export interface RequestOptions {
  signal?: AbortSignal;
}

/**
 * The query product-service's ListProductsSchema actually parses.
 *
 * Named exactly as the server names them — `limit`, not `size`; `sort`, not
 * `sortBy`; `category`, not `categoryId`. Zod silently discards anything it
 * does not declare, so a mis-spelled key here is not an error anywhere: it is
 * a filter that quietly stops being applied.
 */
export interface ListProductsQuery {
  /** 0-indexed. */
  page?: number;
  /** Page size. Server default 20, hard maximum 100. */
  limit?: number;
  /** Category slug or id — listProducts resolves either. */
  category?: string;
  sort?: 'relevance' | 'price_asc' | 'price_desc' | 'newest' | 'rating';
  sellerId?: string;
  minPrice?: number;
  maxPrice?: number;
  minRating?: number;
  inStock?: boolean;
}

export const productsApi = {
  /**
   * One seller's public catalogue, for their storefront.
   *
   * The same /products endpoint as `list` — product-service already takes a
   * `sellerId` filter, so this is that contract with a parameter rather than a
   * second API. It also means the storefront inherits the server-side
   * `status: 'ACTIVE'` filter for free: a draft or pending listing cannot
   * appear on a shop page because the query never returns it.
   *
   * Note `limit`, not `size`: ListProductsSchema names the page size `limit`,
   * and Zod drops unknown keys, so a `size` parameter is silently ignored and
   * the server falls back to its default.
   */
  async listBySeller(
    sellerId: string,
    page = 0,
    limit = 24,
    options: RequestOptions = {},
  ): Promise<PaginatedResponse<Product>> {
    const { data } = await apiClient.get<PaginatedResponse<Product>>('/products', {
      params: { sellerId, page, limit },
      signal: options.signal,
    });
    return data;
  },

  /**
   * The catalogue list, in product-service's own vocabulary.
   *
   * Every key here is a field of ListProductsSchema. That is the whole point of
   * the shape: the previous signature took `(page, size)` and sent `size`,
   * which the schema does not declare — and Zod drops unknown keys rather than
   * rejecting them, so `list(0, 50)` asked for fifty products and silently got
   * the server default of twenty. Nothing errored, which is why it survived.
   *
   * Passing a query object rather than positional arguments also makes the
   * server-side filters reachable. `category` accepts a slug or an id (see
   * listProducts), so a caller that wants one department asks the database for
   * that department instead of filtering a generic page in the browser.
   */
  async list(query: ListProductsQuery = {}, options: RequestOptions = {}): Promise<PaginatedResponse<Product>> {
    const { data } = await apiClient.get<PaginatedResponse<Product>>('/products', {
      // Undefined entries are dropped by axios, so an absent filter stays
      // absent rather than arriving as the string "undefined".
      params: {
        page:      query.page,
        limit:     query.limit,
        category:  query.category,
        sort:      query.sort,
        sellerId:  query.sellerId,
        minPrice:  query.minPrice,
        maxPrice:  query.maxPrice,
        minRating: query.minRating,
        inStock:   query.inStock,
      },
      signal: options.signal,
    });
    return data;
  },

  async getById(id: string): Promise<Product> {
    const { data } = await apiClient.get<ApiEnvelope<Product>>(`/products/${id}`);
    return data.data;
  },

  async getBySlug(slug: string): Promise<Product> {
    const { data } = await apiClient.get<ApiEnvelope<Product>>(`/products/slug/${slug}`);
    return data.data;
  },

  async getVariants(productId: string): Promise<ProductVariant[]> {
    const { data } = await apiClient.get<ApiEnvelope<Array<Record<string, unknown>>>>(
      `/products/${productId}/variants`,
    );
    return data.data.map((v) => ({
      id: v.id as string,
      productId: v.productId as string,
      sku: v.sku as string,
      attributes: (v.attributes as Record<string, string>) ?? {},
      price: Number(v.price),
      compareAtPrice: v.compareAtPrice != null ? Number(v.compareAtPrice) : undefined,
      // availableStock (stock minus active reservations) reflects real-time
      // availability; falls back to raw stock if the service didn't compute it.
      stockQuantity: Number(v.availableStock ?? v.stock ?? 0),
      inStock: Boolean(v.inStock ?? Number(v.availableStock ?? v.stock ?? 0) > 0),
      images: (v.images as string[]) ?? undefined,
    }));
  },

  // `listByCategory` was here, calling GET /products/category/:id — a route
  // product-service does not serve. It would have fallen through to
  // `/products/:id` with id="category", so the call could only ever 404. It had
  // zero call sites, and its `categoryId: number` signature was wrong anyway:
  // category ids are cuids, not numbers.
  //
  // Filtering by category is already supported on the list endpoint, which
  // accepts a slug or an id: `productsApi.list({ category })`.

  /**
   * Trending products, scored server-side.
   *
   * `limit` only. The controller reads `req.query.limit` and nothing else —
   * this used to send `size` (dropped, so the default was always returned) and
   * a `page`, which that endpoint does not paginate at all. Asking for a page
   * it cannot serve implied a capability that does not exist.
   *
   * The server caps the result at 20 regardless of what is requested.
   */
  async trending(limit = 12, options: RequestOptions = {}): Promise<PaginatedResponse<Product>> {
    const { data } = await apiClient.get<PaginatedResponse<Product>>('/products/trending', {
      params: { limit },
      signal: options.signal,
    });
    return data;
  },

  /**
   * Full-text product search.
   *
   * Every parameter name here is load-bearing, and all of them were wrong.
   *
   * `/search` is served by product-service (see the note on the route in
   * api-gateway/src/routes/customer.routes.ts), and its ListProductsSchema
   * parses `q`, `category`, `sort`, `page` and `limit`. This sent `query`,
   * `categorySlug`, `sortBy` and `size` — names from search-service's schema,
   * which this app never actually reached.
   *
   * Zod DROPS unknown keys rather than rejecting them, so none of it errored:
   * `query` was discarded, `q` was therefore absent, and a search for "honey"
   * became an unfiltered browse that returned the newest 20 products. The
   * shopper saw results, just never the ones they asked for — which is why this
   * looked like bad relevance rather than a broken request.
   *
   * `brandSlug` and `tags` are dropped deliberately: product-service's schema
   * has no such filters, so sending them only implied a capability that does
   * not exist. `category` does exist and is now wired.
   */
  async search(filters: ProductFilters, options: RequestOptions = {}): Promise<PaginatedResponse<Product>> {
    const { data } = await apiClient.get<PaginatedResponse<Product>>('/search', {
      signal: options.signal,
      params: {
        q:        filters.query,
        category: typeof filters.category === 'string' ? filters.category : undefined,
        minPrice: filters.minPrice,
        maxPrice: filters.maxPrice,
        // The UI still calls this `sortBy`; the API calls it `sort`. Translated
        // here rather than renaming it through every filter component.
        sort:     filters.sortBy ?? filters.sort ?? 'relevance',
        // Both 0-indexed — ListProductsSchema is `page: z.coerce.number().min(0)`.
        page:     filters.page ?? 0,
        limit:    filters.size ?? filters.limit ?? 20,
      },
    });
    return data;
  },

  async getReviews(productId: string, page = 0, size = 10): Promise<PaginatedResponse<ProductReview>> {
    const { data } = await apiClient.get<PaginatedResponse<ProductReview>>(`/products/${productId}/reviews`, {
      params: { page, size },
    });
    return data;
  },

  async addReview(productId: string, payload: CreateReviewPayload): Promise<ApiEnvelope<ProductReview>> {
    const { data } = await apiClient.post<ApiEnvelope<ProductReview>>(`/products/${productId}/reviews`, payload);
    return data;
  },

  async getCategories(): Promise<Category[]> {
    const { data } = await apiClient.get<ApiEnvelope<Category[]>>('/categories');
    return data.data;
  },

  /**
   * The category tree, each root carrying its nested `children`.
   *
   * `/categories`, not `/categories/tree`. There is no `tree` route —
   * product-service serves `/api/v1/categories` (categoryController.getTree, a
   * recursive CTE) and `/api/v1/categories/:id`. So `/categories/tree` matched
   * the `:id` pattern with id="tree" and 404'd on every call, which the
   * productSlice thunk that uses this swallowed into an empty category list.
   *
   * The response is enveloped — `res.json({ success, data })` — so `.data` is
   * unwrapped, matching getCategories above. Reading it bare would have handed
   * the caller the envelope object where it expected an array, so `.map()` on
   * the result would throw.
   *
   * It is now the same call as getCategories(). Kept as a separate name because
   * productSlice imports it, and collapsing the two is a rename across the
   * slice and its tests rather than part of this fix.
   */
  async getCategoryTree(): Promise<Category[]> {
    const { data } = await apiClient.get<ApiEnvelope<Category[]>>('/categories');
    return data.data;
  },

  // `getBrands` was here, calling GET /brands. The gateway mounts that prefix
  // (`pub('/brands', targets.product)`) but product-service serves no
  // /api/v1/brands route, so it 404'd. Zero call sites — deleted rather than
  // pointed somewhere, because there is nowhere to point it: brand is a plain
  // string column on Product with no endpoint that enumerates it. Restore this
  // when such a route exists.
};
