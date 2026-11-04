import { AUTOCOMPLETE_MAX_SUGGESTIONS, HYBRID_SEARCH_CONFIG } from '../config/index.js';

export interface SearchParams {
  q?: string;
  category?: string;
  categoryId?: string;
  brand?: string | string[];
  sellerId?: string;
  minPrice?: number;
  maxPrice?: number;
  minRating?: number;
  minSellerRating?: number;
  deliverySpeed?: string | string[];
  stockStatus?: string | string[];
  inStock?: boolean;
  sortBy?: 'relevance' | 'price_asc' | 'price_desc' | 'rating' | 'newest';
  page?: number;
  limit?: number;
}

/** Shared `filter` clauses — reused by the BM25 query, the kNN filter, and
 *  (via a `post_filter`-free design) they stay consistent with returned aggregations.
 */
export function buildFilterClauses(params: SearchParams): any[] {
  const filter: any[] = [{ term: { status: 'active' } }];

  if (params.category) filter.push({ term: { category: params.category } });
  if (params.categoryId) filter.push({ term: { categoryId: params.categoryId } });
  if (params.sellerId) filter.push({ term: { sellerId: params.sellerId } });

  if (params.brand) {
    const brands = Array.isArray(params.brand) ? params.brand : [params.brand];
    filter.push({ terms: { brand: brands } });
  }

  if (params.deliverySpeed) {
    const speeds = Array.isArray(params.deliverySpeed) ? params.deliverySpeed : [params.deliverySpeed];
    filter.push({ terms: { deliverySpeed: speeds } });
  }

  if (params.stockStatus) {
    const statuses = Array.isArray(params.stockStatus) ? params.stockStatus : [params.stockStatus];
    filter.push({ terms: { stockStatus: statuses } });
  }

  if (params.inStock !== undefined) filter.push({ term: { inStock: params.inStock } });

  if (params.minPrice !== undefined || params.maxPrice !== undefined) {
    const range: Record<string, number> = {};
    if (params.minPrice !== undefined) range.gte = params.minPrice;
    if (params.maxPrice !== undefined) range.lte = params.maxPrice;
    filter.push({ range: { price: range } });
  }

  if (params.minRating !== undefined) {
    filter.push({ range: { rating: { gte: params.minRating } } });
  }

  if (params.minSellerRating !== undefined) {
    filter.push({ range: { sellerRating: { gte: params.minSellerRating } } });
  }

  return filter;
}

/** BM25 (lexical) branch: multi-field match with typo tolerance via fuzziness. */
export function buildBM25Query(params: SearchParams, filter: any[]): any {
  const must: any[] = [];

  if (params.q) {
    must.push({
      bool: {
        should: [
          {
            multi_match: {
              query: params.q,
              fields: ['name^4', 'brand^2', 'description', 'tags^2', 'category', 'sellerName'],
              fuzziness: 'AUTO',
              prefix_length: 2,
              type: 'best_fields',
            },
          },
          {
            match_phrase: {
              name: { query: params.q, boost: 3, slop: 1 },
            },
          },
          {
            match: {
              'name.autocomplete': { query: params.q, boost: 1 },
            },
          },
        ],
        minimum_should_match: 1,
      },
    });
  } else {
    must.push({ match_all: {} });
  }

  return { bool: { must, filter } };
}

/** Semantic (vector) branch: k-NN over the product embedding field. Combined
 *  natively by Elasticsearch with the BM25 `query` score for hybrid ranking.
 */
export function buildKnnClause(queryVector: number[], filter: any[]): any {
  return {
    field: 'embedding',
    query_vector: queryVector,
    k: HYBRID_SEARCH_CONFIG.k,
    num_candidates: HYBRID_SEARCH_CONFIG.numCandidates,
    filter,
    boost: HYBRID_SEARCH_CONFIG.knnBoost,
  };
}

export function buildSort(sortBy: SearchParams['sortBy']): any {
  switch (sortBy) {
    case 'price_asc':
      return [{ price: 'asc' }];
    case 'price_desc':
      return [{ price: 'desc' }];
    case 'rating':
      return [{ rating: 'desc' }, '_score'];
    case 'newest':
      return [{ createdAt: 'desc' }];
    default:
      return ['_score'];
  }
}

/** Multi-faceted aggregations: category tree, brand, price buckets, rating,
 *  seller rating, delivery speed, and stock status.
 */
export function buildAggregations(): Record<string, any> {
  return {
    categories: { terms: { field: 'category', size: 50 } },
    categoryTree: {
      terms: { field: 'categoryTree.level1', size: 30 },
      aggs: {
        level2: {
          terms: { field: 'categoryTree.level2', size: 30 },
          aggs: {
            level3: { terms: { field: 'categoryTree.level3', size: 30 } },
          },
        },
      },
    },
    brands: { terms: { field: 'brand', size: 30 } },
    priceRanges: {
      range: {
        field: 'price',
        ranges: [
          { key: 'under_10k', to: 10000 },
          { key: '10k_50k', from: 10000, to: 50000 },
          { key: '50k_200k', from: 50000, to: 200000 },
          { key: 'over_200k', from: 200000 },
        ],
      },
    },
    priceStats: { stats: { field: 'price' } },
    ratingRanges: {
      range: {
        field: 'rating',
        ranges: [
          { key: '4_and_up', from: 4 },
          { key: '3_and_up', from: 3 },
          { key: '2_and_up', from: 2 },
        ],
      },
    },
    sellerRatingRanges: {
      range: {
        field: 'sellerRating',
        ranges: [
          { key: '4_and_up', from: 4 },
          { key: '3_and_up', from: 3 },
        ],
      },
    },
    deliverySpeed: { terms: { field: 'deliverySpeed', size: 10 } },
    stockStatus: { terms: { field: 'stockStatus', size: 10 } },
  };
}

/** Prefix/edge-n-gram query used for the autocomplete field. */
export function buildAutocompleteQuery(prefix: string): any {
  return {
    bool: {
      must: [{ term: { status: 'active' } }],
      should: [
        { match: { 'name.autocomplete': { query: prefix, boost: 2 } } },
        { match_phrase_prefix: { name: { query: prefix } } },
      ],
      minimum_should_match: 1,
    },
  };
}

export function buildSuggestAggregations(): Record<string, any> {
  return {
    suggested_queries: {
      terms: { field: 'name.keyword', size: AUTOCOMPLETE_MAX_SUGGESTIONS },
    },
    suggested_categories: {
      terms: { field: 'category', size: 5 },
    },
  };
}

/** Term suggester (did-you-mean) for typo correction when a query returns few/no hits. */
export function buildDidYouMeanSuggest(query: string): Record<string, any> {
  return {
    didYouMean: {
      text: query,
      phrase: {
        field: 'name',
        size: 1,
        gram_size: 2,
        direct_generator: [
          {
            field: 'name',
            suggest_mode: 'popular',
            min_word_length: 3,
          },
        ],
        highlight: {
          pre_tag: '',
          post_tag: '',
        },
      },
    },
  };
}
