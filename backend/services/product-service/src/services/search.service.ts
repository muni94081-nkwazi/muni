import { Client } from '@elastic/elasticsearch';

const INDEX = 'muni-products';

let client: Client | null = null;

function getClient(): Client {
  if (!client) {
    client = new Client({
      node: process.env.ELASTICSEARCH_URL ?? 'http://localhost:9200',
      auth: process.env.ELASTICSEARCH_USERNAME
        ? { username: process.env.ELASTICSEARCH_USERNAME, password: process.env.ELASTICSEARCH_PASSWORD ?? '' }
        : undefined,
    });
  }
  return client;
}

/**
 * The document shape stored in `muni-products`.
 *
 * These field names are canonical, and they are search-service's names, not the
 * database's. That is deliberate.
 *
 * Both services were writing this one index with different mappings —
 * product-service using `basePrice`/`averageRating`/`categorySlug`,
 * search-service using `price`/`rating`/`category`. Whichever booted first
 * created the index; the other's documents and queries then referred to fields
 * that were not in the mapping, and matched nothing.
 *
 * product-service now owns the index, so it could have imposed its own names.
 * It adopts search-service's instead because search-service keeps the richer
 * read path — hybrid BM25 + kNN, autocomplete, synonyms, faceting — and that
 * query builder is written against these names. Renaming the mapping is a
 * one-file change here; rewriting that query builder is not.
 *
 * `price` is the PRODUCT's basePrice, not a variant price. Per-variant pricing
 * is resolved at checkout from the database, never from this index.
 */
interface ProductDocument {
  id:           string;
  name:         string;
  description:  string;
  slug:         string;
  brand:        string | null;
  sellerId:     string;

  /** Nested so a facet can show a readable name without a second lookup. */
  category: {
    id:   string | null;
    slug: string | null;
    name: string | null;
    path: string | null;
  };

  tags:         string[];
  /** The seller's product-level list price. Unchanged meaning. */
  price:        number;
  /** Cheapest ACTIVE variant — what the card shows, and what price filters
   *  and price sorting run on. Declared explicitly so a freshly created index
   *  does not depend on dynamic mapping inferring it from the first document. */
  minVariantPrice: number;
  currency:     string;
  rating:       number;
  reviewCount:  number;

  /** Sellable units across every active variant, net of cart reservations. */
  stock:        number;
  inStock:      boolean;
  /** in_stock | low_stock | out_of_stock — a keyword so it can be faceted. */
  stockStatus:  'in_stock' | 'low_stock' | 'out_of_stock';

  images:       string[];
  status:       string;
  createdAt:    string;
  updatedAt:    string;

  /**
   * Dense vector for semantic search. Written as null until an embedding
   * service is wired up — the field exists in the mapping now so that turning
   * vector search on later does not need a full reindex of the catalogue.
   */
  embedding?:   number[] | null;
}

export async function ensureIndex(): Promise<void> {
  const es = getClient();
  const exists = await es.indices.exists({ index: INDEX });
  if (!exists) {
    await es.indices.create({
      index: INDEX,
      mappings: {
        properties: {
          id:          { type: 'keyword' },
          name:        { type: 'text', analyzer: 'english', fields: { keyword: { type: 'keyword' } } },
          description: { type: 'text', analyzer: 'english' },
          slug:        { type: 'keyword' },
          brand:       { type: 'keyword', fields: { text: { type: 'text' } } },
          sellerId:    { type: 'keyword' },

          // An object, not a flat keyword: a category facet needs the display
          // name alongside the slug it filters on, and fetching that per bucket
          // from SQL would be a query per facet on every search.
          category: {
            properties: {
              id:   { type: 'keyword' },
              slug: { type: 'keyword' },
              name: { type: 'keyword', fields: { text: { type: 'text' } } },
              path: { type: 'keyword' },
            },
          },

          tags:        { type: 'keyword' },
          price:           { type: 'double'  },
          minVariantPrice: { type: 'double'  },
          currency:    { type: 'keyword' },
          rating:      { type: 'float'   },
          reviewCount: { type: 'integer' },
          stock:       { type: 'integer' },
          inStock:     { type: 'boolean' },
          stockStatus: { type: 'keyword' },
          images:      { type: 'keyword', index: false },
          status:      { type: 'keyword' },
          createdAt:   { type: 'date'    },
          updatedAt:   { type: 'date'    },

          // Declared now, populated later. Adding a field to a live index is
          // cheap; changing an existing field's type is not — it needs a
          // reindex of everything. Dimensions match the all-MiniLM-L6-v2 output
          // search-service's embedding.service is written against.
          embedding: {
            type:       'dense_vector',
            dims:       384,
            index:      true,
            similarity: 'cosine',
          },
        },
      },
      settings: {
        analysis: {
          analyzer: { english: { type: 'english' } },
        },
        number_of_shards:   1,
        number_of_replicas: 1,
      },
    });
  }
}

export async function indexProduct(product: ProductDocument): Promise<void> {
  const es = getClient();
  await es.index({ index: INDEX, id: product.id, document: product });
}

export async function deleteProductFromIndex(productId: string): Promise<void> {
  const es = getClient();
  await es.delete({ index: INDEX, id: productId }).catch(() => {});
}

export interface SearchFilters {
  q?:         string;
  category?:  string;   // categorySlug or categoryPath prefix
  minPrice?:  number;
  maxPrice?:  number;
  minRating?: number;
  inStock?:   boolean;
  sellerId?:  string;
  sort?:      'relevance' | 'price_asc' | 'price_desc' | 'newest' | 'rating';
  page?:      number;
  limit?:     number;
}

/** Facet bucket returned by a `terms` aggregation. */
export interface CategoryFacet {
  key: string;
  doc_count: number;
}

/** Shape of the `stats` aggregation over basePrice. */
export interface PriceStatsFacet {
  count?: number;
  min?: number | null;
  max?: number | null;
  avg?: number | null;
  sum?: number | null;
}

export interface ProductSearchResult {
  data: ProductDocument[];
  meta: {
    total: number;
    current_page: number;
    last_page: number;
    per_page: number;
  };
  facets: {
    categories: CategoryFacet[];
    priceStats: PriceStatsFacet;
    inStockCount: number;
  };
}

// The return type is annotated rather than inferred. Inference pulls in
// @elastic/elasticsearch's internal AggregationsAggregate union, which TypeScript
// cannot name without a deep relative path into node_modules (TS2742) — the
// error surfaces or not depending on how the package happens to be hoisted.
export async function searchProducts(filters: SearchFilters): Promise<ProductSearchResult> {
  const es = getClient();
  const { q, category, minPrice, maxPrice, minRating, inStock, sellerId, sort = 'relevance', page = 0, limit = 20 } = filters;

  // Build bool query
  const mustClauses: object[] = [];
  const filterClauses: object[] = [{ term: { status: 'ACTIVE' } }];

  // Full-text search on name (weight 3), tags (weight 2), description (weight 1)
  if (q) {
    mustClauses.push({
      multi_match: {
        query:  q,
        fields: ['name^3', 'tags^2', 'description'],
        type:   'best_fields',
        fuzziness: 'AUTO',
      },
    });
  }

  if (category)  filterClauses.push({ term: { 'category.slug': category } });
  if (inStock)   filterClauses.push({ term: { inStock: true } });
  if (sellerId)  filterClauses.push({ term: { sellerId } });
  if (minRating) filterClauses.push({ range: { rating: { gte: minRating } } });

  if (minPrice !== undefined || maxPrice !== undefined) {
    const range: Record<string, number> = {};
    if (minPrice !== undefined) range.gte = minPrice;
    if (maxPrice !== undefined) range.lte = maxPrice;
    // The cheapest purchasable variant — the figure the card shows.     // still carries basePrice for anything that reads the document directly.
    filterClauses.push({ range: { minVariantPrice: range } });
  }

  // Sort
  // Elasticsearch sort entries are either a bare field name ('_score') or a
  // { field: direction } object, so the array is genuinely heterogeneous.
  const sortClause: (string | Record<string, 'asc' | 'desc'>)[] = (() => {
    switch (sort) {
      // minVariantPrice, matching the range filter above and the Postgres
      // browse path. Sorting on `price` (basePrice) while the card displays the
      // cheapest variant produced a "sorted by price" list that was visibly out
      // of order — 1100, 1200, 1300, 1400, 1000 — and disagreed with the same
      // sort on the Postgres path.
      case 'price_asc':  return [{ minVariantPrice: 'asc'  }];
      case 'price_desc': return [{ minVariantPrice: 'desc' }];
      case 'newest':     return [{ createdAt: 'desc' }];
      case 'rating':     return [{ rating: 'desc' }];
      default:           return q ? ['_score'] : [{ createdAt: 'desc' }];
    }
  })();

  const response = await es.search({
    index: INDEX,
    from:  page * limit,
    size:  limit,
    query: {
      bool: {
        must:   mustClauses.length > 0 ? mustClauses : [{ match_all: {} }],
        filter: filterClauses,
      },
    },
    sort: sortClause,
    // Aggregations for facets
    aggs: {
      categories: {
        terms: { field: 'category.slug', size: 20 },
      },
      priceStats: {
        stats: { field: 'price' },
      },
      inStockCount: {
        filter: { term: { inStock: true } },
      },
    },
  });

  const hits = response.hits.hits;
  const total = typeof response.hits.total === 'number'
    ? response.hits.total
    : response.hits.total?.value ?? 0;

  return {
    data: hits.map((h) => h._source as ProductDocument),
    meta: {
      total,
      current_page: page,
      last_page:    Math.max(0, Math.ceil(total / limit) - 1),
      per_page:     limit,
    },
    facets: {
      categories:   (response.aggregations?.categories as { buckets: CategoryFacet[] })?.buckets ?? [],
      priceStats:   (response.aggregations?.priceStats as PriceStatsFacet) ?? {},
      inStockCount: (response.aggregations?.inStockCount as { doc_count: number })?.doc_count ?? 0,
    },
  };
}
