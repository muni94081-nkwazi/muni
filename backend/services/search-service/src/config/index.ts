export const INDEX_NAME = process.env.ELASTICSEARCH_PRODUCTS_INDEX ?? 'muni-products';

export const EMBEDDING_PROVIDER = (process.env.EMBEDDING_PROVIDER ?? 'local') as
  | 'openai'
  | 'huggingface'
  | 'local';

export const EMBEDDING_MODEL =
  process.env.EMBEDDING_MODEL ??
  (EMBEDDING_PROVIDER === 'huggingface' ? 'sentence-transformers/all-MiniLM-L6-v2' : 'text-embedding-3-small');

// text-embedding-3-small = 1536 dims, all-MiniLM-L6-v2 = 384 dims. Must match
// the model actually configured, since it's baked into the index mapping.
export const EMBEDDING_DIMENSIONS = Number(
  process.env.EMBEDDING_DIMENSIONS ?? (EMBEDDING_PROVIDER === 'huggingface' ? 384 : 1536)
);

export const VECTOR_SEARCH_ENABLED = process.env.VECTOR_SEARCH_ENABLED !== 'false';

export const HYBRID_SEARCH_CONFIG = {
  // Relative weight given to the kNN (semantic) branch vs the BM25 (lexical) branch.
  knnBoost: Number(process.env.HYBRID_KNN_BOOST ?? 1.5),
  bm25Boost: Number(process.env.HYBRID_BM25_BOOST ?? 1),
  k: Number(process.env.HYBRID_KNN_K ?? 50),
  numCandidates: Number(process.env.HYBRID_KNN_NUM_CANDIDATES ?? 200),
};

export const AUTOCOMPLETE_MAX_SUGGESTIONS = Number(process.env.AUTOCOMPLETE_MAX_SUGGESTIONS ?? 8);
