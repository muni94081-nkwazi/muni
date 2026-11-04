import { ANALYSIS_SETTINGS } from './analyzers.js';
import { EMBEDDING_DIMENSIONS } from './index.js';

/**
 * Full index configuration for `muni-products`: custom analyzers (autocomplete
 * edge n-grams, stemming, East African synonym dictionary), keyword facet
 * fields for aggregations, and a dense_vector field for hybrid kNN search.
 */
export function buildProductIndexMapping(vectorDims: number = EMBEDDING_DIMENSIONS) {
  return {
    settings: {
      number_of_shards: 2,
      number_of_replicas: 1,
      analysis: ANALYSIS_SETTINGS,
    },
    mappings: {
      properties: {
        id: { type: 'keyword' },

        name: {
          type: 'text',
          analyzer: 'product_search_analyzer',
          search_analyzer: 'product_search_query_analyzer',
          fields: {
            keyword: { type: 'keyword', ignore_above: 256 },
            autocomplete: {
              type: 'text',
              analyzer: 'autocomplete_index_analyzer',
              search_analyzer: 'autocomplete_search_analyzer',
            },
          },
        },
        description: {
          type: 'text',
          analyzer: 'product_search_analyzer',
          search_analyzer: 'product_search_query_analyzer',
        },
        slug: { type: 'keyword' },

        // Flat leaf category + full ancestor path, used together for tree facets:
        // categoryPath lets a single terms agg surface every level of the tree,
        // while categoryTree.level1/2/3 supports drilling down one level at a time.
        category: { type: 'keyword' },
        categoryId: { type: 'keyword' },
        categoryPath: { type: 'keyword' },
        categoryTree: {
          properties: {
            level1: { type: 'keyword' },
            level2: { type: 'keyword' },
            level3: { type: 'keyword' },
          },
        },

        brand: { type: 'keyword', fields: { text: { type: 'text' } } },

        sellerId: { type: 'keyword' },
        sellerName: {
          type: 'text',
          fields: { keyword: { type: 'keyword' } },
        },
        sellerRating: { type: 'float' },

        price: { type: 'double' },
        currency: { type: 'keyword' },

        rating: { type: 'float' },
        reviewCount: { type: 'integer' },

        stock: { type: 'integer' },
        inStock: { type: 'boolean' },
        stockStatus: { type: 'keyword' }, // in_stock | low_stock | out_of_stock

        deliveryEstimateDays: { type: 'integer' },
        deliverySpeed: { type: 'keyword' }, // same_day | next_day | standard | extended

        images: { type: 'keyword', index: false },
        tags: { type: 'keyword' },
        attributes: { type: 'object', dynamic: true },
        status: { type: 'keyword' },

        // Hybrid vector search: semantic embedding of name + description + tags.
        embedding: {
          type: 'dense_vector',
          dims: vectorDims,
          index: true,
          similarity: 'cosine',
        },

        createdAt: { type: 'date' },
        updatedAt: { type: 'date' },
      },
    },
  };
}
