import { Client } from '@elastic/elasticsearch';
import { logger } from '../utils/logger.js';
import { INDEX_NAME, VECTOR_SEARCH_ENABLED, AUTOCOMPLETE_MAX_SUGGESTIONS } from '../config/index.js';
import { buildProductIndexMapping } from '../config/mappings.js';
import { embedBatch, embedQuery, productTextForEmbedding } from './embedding.service.js';
import {
  buildAggregations,
  buildAutocompleteQuery,
  buildBM25Query,
  buildDidYouMeanSuggest,
  buildFilterClauses,
  buildKnnClause,
  buildSort,
  buildSuggestAggregations,
  type SearchParams,
} from './vector-query.builder.js';

const ES_URL = process.env.ELASTICSEARCH_URL ?? 'http://localhost:9200';
export const esClient = new Client({
  node: ES_URL,
  auth: process.env.ELASTICSEARCH_USERNAME
    ? { username: process.env.ELASTICSEARCH_USERNAME, password: process.env.ELASTICSEARCH_PASSWORD ?? '' }
    : undefined,
});

export async function connectES(): Promise<boolean> {
  try {
    const ping = await esClient.ping();
    if (ping) {
      logger.info('✅ Connected to Elasticsearch');
      // ensureIndex() is NOT called here any more.
      //
      // product-service owns `muni-products` and creates it with the mapping it
      // writes documents against. Creating it from here raced that: whichever
      // service booted first won the mapping, and the loser's documents and
      // queries then referred to fields the index did not have — which is how
      // search came to return nothing for real products.
      //
      // buildProductIndexMapping() is kept in config/mappings.ts because its
      // field names are the canonical ones product-service's mapping now
      // follows, and because the query builder here still reads them.
      return true;
    }
  } catch (error) {
    logger.warn('⚠️ Could not connect to Elasticsearch on startup (non-fatal)', { error: (error as Error).message });
  }
  return false;
}

async function ensureIndex() {
  try {
    const exists = await esClient.indices.exists({ index: INDEX_NAME });
    if (!exists) {
      logger.info(`Creating index ${INDEX_NAME}`);
      const mapping = buildProductIndexMapping();
      await esClient.indices.create({
        index: INDEX_NAME,
        settings: mapping.settings as any,
        mappings: mapping.mappings as any,
      });
      logger.info(`✅ Index ${INDEX_NAME} created (hybrid BM25 + kNN, autocomplete, synonyms)`);
    }
  } catch (error) {
    logger.error(`Failed to ensure index ${INDEX_NAME}`, { error: (error as Error).message });
  }
}

// ─── Document normalization ────────────────────────────────────────────────

function computeStockStatus(stock: number): 'in_stock' | 'low_stock' | 'out_of_stock' {
  if (stock <= 0) return 'out_of_stock';
  if (stock <= 5) return 'low_stock';
  return 'in_stock';
}

function computeDeliverySpeed(days: number | undefined): 'same_day' | 'next_day' | 'standard' | 'extended' {
  if (days === undefined) return 'standard';
  if (days <= 0) return 'same_day';
  if (days === 1) return 'next_day';
  if (days <= 4) return 'standard';
  return 'extended';
}

/** Fills in derived/facetable fields (category tree, stock status, delivery
 *  speed bucket) so callers only need to supply the raw product fields.
 */
function normalizeProductDoc(doc: any): any {
  const categoryPath: string[] = doc.categoryPath ?? (doc.category ? [doc.category] : []);
  const category = doc.category ?? categoryPath[categoryPath.length - 1];
  const stock = doc.stock ?? 0;

  return {
    ...doc,
    category,
    categoryPath,
    categoryTree: doc.categoryTree ?? {
      level1: categoryPath[0],
      level2: categoryPath[1],
      level3: categoryPath[2],
    },
    stock,
    inStock: doc.inStock ?? stock > 0,
    stockStatus: doc.stockStatus ?? computeStockStatus(stock),
    sellerRating: doc.sellerRating ?? doc.rating ?? 0,
    deliverySpeed: doc.deliverySpeed ?? computeDeliverySpeed(doc.deliveryEstimateDays),
  };
}

// ─── Write path ─────────────────────────────────────────────────────────────

export async function indexProduct(doc: any) {
  try {
    const normalized = normalizeProductDoc(doc);
    const [embedding] = await embedBatch([productTextForEmbedding(normalized)]);
    await esClient.index({
      index: INDEX_NAME,
      id: normalized.id,
      document: { ...normalized, embedding },
    });
  } catch (error) {
    logger.error('Error indexing product', { error: (error as Error).message, id: doc.id });
  }
}

export async function deleteProduct(id: string) {
  try {
    await esClient.delete({ index: INDEX_NAME, id });
  } catch (error) {
    logger.error('Error deleting product', { error: (error as Error).message, id });
  }
}

export async function updateProductField(id: string, partialDoc: any) {
  try {
    const patch = { ...partialDoc };
    if (patch.stock !== undefined) {
      patch.stockStatus = patch.stockStatus ?? computeStockStatus(patch.stock);
      patch.inStock = patch.inStock ?? patch.stock > 0;
    }
    await esClient.update({ index: INDEX_NAME, id, doc: patch });
  } catch (error) {
    logger.error('Error updating product field', { error: (error as Error).message, id, partialDoc });
  }
}

export async function reindexAll(products: any[]) {
  if (products.length === 0) return;
  try {
    const normalized = products.map(normalizeProductDoc);
    const embeddings = await embedBatch(normalized.map(productTextForEmbedding));
    const docs = normalized.map((doc, i) => ({ ...doc, embedding: embeddings[i] }));

    const operations = docs.flatMap((doc) => [{ index: { _index: INDEX_NAME, _id: doc.id } }, doc]);
    const bulkResponse = await esClient.bulk({ refresh: true, operations });
    if (bulkResponse.errors) {
      logger.error('Bulk insert errors', { errors: bulkResponse.items });
    } else {
      logger.info(`✅ Successfully bulk indexed ${products.length} products`);
    }
  } catch (error) {
    logger.error('Failed to bulk index', { error: (error as Error).message });
    throw error;
  }
}

// ─── Read path: hybrid search ──────────────────────────────────────────────

export async function search(params: SearchParams) {
  const page = params.page ?? 1;
  const size = Math.min(params.limit ?? 20, 100);
  const from = (page - 1) * size;

  const filter = buildFilterClauses(params);
  const query = buildBM25Query(params, filter);
  const sort = buildSort(params.sortBy ?? 'relevance');

  const request: any = {
    index: INDEX_NAME,
    query,
    sort,
    from,
    size,
    aggs: buildAggregations(),
  };

  if (params.q) {
    request.suggest = buildDidYouMeanSuggest(params.q);

    if (VECTOR_SEARCH_ENABLED) {
      try {
        const queryVector = await embedQuery(params.q);
        request.knn = buildKnnClause(queryVector, filter);
      } catch (error) {
        logger.warn('Failed to compute query embedding, falling back to BM25-only search', {
          error: (error as Error).message,
        });
      }
    }
  }

  try {
    const res = await esClient.search(request);

    const hits = res.hits.hits.map((h: any) => ({ ...h._source, _score: h._score }));
    const total = (res.hits.total as any).value;
    const didYouMeanOptions = (res.suggest as any)?.didYouMean?.[0]?.options ?? [];

    return {
      hits,
      total,
      aggregations: res.aggregations,
      didYouMean: didYouMeanOptions.length > 0 ? didYouMeanOptions[0].text : null,
      page,
      limit: size,
      pages: Math.ceil(total / size),
    };
  } catch (error) {
    logger.error('Search failed', { error: (error as Error).message });
    throw error;
  }
}

// ─── Autocomplete / suggest ────────────────────────────────────────────────

export async function suggest(q: string) {
  try {
    const res = await esClient.search({
      index: INDEX_NAME,
      size: AUTOCOMPLETE_MAX_SUGGESTIONS,
      query: buildAutocompleteQuery(q),
      aggs: buildSuggestAggregations(),
      suggest: buildDidYouMeanSuggest(q),
      _source: ['id', 'name', 'slug', 'images', 'price', 'currency', 'rating', 'category'],
    });

    const products = res.hits.hits.map((h: any) => h._source);
    const queryBuckets = (res.aggregations as any)?.suggested_queries?.buckets ?? [];
    const categoryBuckets = (res.aggregations as any)?.suggested_categories?.buckets ?? [];
    const didYouMeanOptions = (res.suggest as any)?.didYouMean?.[0]?.options ?? [];

    return {
      queries: queryBuckets.map((b: any) => b.key),
      categories: categoryBuckets.map((b: any) => ({ name: b.key, count: b.doc_count })),
      products,
      didYouMean: didYouMeanOptions.length > 0 ? didYouMeanOptions[0].text : null,
    };
  } catch (error) {
    logger.error('Suggest failed', { error: (error as Error).message });
    throw error;
  }
}

export async function getCategories() {
  try {
    const res = await esClient.search({
      index: INDEX_NAME,
      size: 0,
      aggs: buildAggregations(),
    });
    const aggs = res.aggregations as any;
    return {
      categories: aggs?.categories?.buckets ?? [],
      categoryTree: aggs?.categoryTree?.buckets ?? [],
      brands: aggs?.brands?.buckets ?? [],
    };
  } catch (error) {
    logger.error('Failed to get categories', { error: (error as Error).message });
    throw error;
  }
}

export async function getProduct(id: string) {
  try {
    const res = await esClient.search({
      index: INDEX_NAME,
      query: { term: { id } },
      size: 1,
    });
    const hits = res.hits.hits;
    if (hits.length > 0) return hits[0]._source;
    return null;
  } catch (error) {
    logger.error('Failed to get product', { error: (error as Error).message, id });
    throw error;
  }
}
