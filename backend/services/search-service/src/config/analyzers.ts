import { EAST_AFRICAN_SYNONYMS } from './synonyms.js';

/**
 * Custom analysis chain for the products index:
 *  - `product_search_analyzer`   full-text field analysis (stemming + synonyms) used at index time
 *  - `product_search_query_analyzer` same as above minus synonyms, so query-time expansion only
 *    happens once via the indexed synonyms (avoids double-expansion query blowup)
 *  - `autocomplete_index_analyzer` edge n-gram tokenizer for instant prefix matching
 *  - `autocomplete_search_analyzer` plain analyzer used when querying the autocomplete field
 */
export const ANALYSIS_SETTINGS = {
  filter: {
    east_african_synonyms: {
      type: 'synonym_graph',
      lenient: true,
      synonyms: EAST_AFRICAN_SYNONYMS,
    },
    english_stemmer: {
      type: 'stemmer',
      language: 'light_english',
    },
    english_possessive_stemmer: {
      type: 'stemmer',
      language: 'possessive_english',
    },
    edge_ngram_filter: {
      type: 'edge_ngram',
      min_gram: 2,
      max_gram: 20,
    },
  },
  tokenizer: {
    edge_ngram_tokenizer: {
      type: 'edge_ngram',
      min_gram: 2,
      max_gram: 20,
      token_chars: ['letter', 'digit'],
    },
  },
  analyzer: {
    product_search_analyzer: {
      type: 'custom',
      tokenizer: 'standard',
      filter: [
        'lowercase',
        'asciifolding',
        'english_possessive_stemmer',
        'east_african_synonyms',
        'english_stemmer',
      ],
    },
    product_search_query_analyzer: {
      type: 'custom',
      tokenizer: 'standard',
      filter: ['lowercase', 'asciifolding', 'english_possessive_stemmer', 'english_stemmer'],
    },
    autocomplete_index_analyzer: {
      type: 'custom',
      tokenizer: 'edge_ngram_tokenizer',
      filter: ['lowercase', 'asciifolding'],
    },
    autocomplete_search_analyzer: {
      type: 'custom',
      tokenizer: 'standard',
      filter: ['lowercase', 'asciifolding'],
    },
  },
} as const;
