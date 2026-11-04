import { describe, it, expect } from '@jest/globals';
import {
  buildFilterClauses,
  buildSort,
  buildKnnClause,
} from '../services/vector-query.builder.js';

// ─── Query construction ───────────────────────────────────────────────────────
//
// These are the pure half of search: everything that decides *what* is asked of
// Elasticsearch, with no cluster involved. Worth pinning because a filter that
// silently stops being applied does not fail — it just quietly returns products
// the caller excluded.

describe('buildFilterClauses', () => {
  it('always constrains to active products', () => {
    // A dropped status filter surfaces archived and pending-approval listings
    // in customer search results.
    expect(buildFilterClauses({})).toContainEqual({ term: { status: 'active' } });
  });

  it('accepts a single brand or a list, and always emits a terms clause', () => {
    const one  = buildFilterClauses({ brand: 'Nike' });
    const many = buildFilterClauses({ brand: ['Nike', 'Puma'] });

    expect(one).toContainEqual({ terms: { brand: ['Nike'] } });
    expect(many).toContainEqual({ terms: { brand: ['Nike', 'Puma'] } });
  });

  it('builds a one-sided price range when only one bound is given', () => {
    expect(buildFilterClauses({ minPrice: 1000 }))
      .toContainEqual({ range: { price: { gte: 1000 } } });
    expect(buildFilterClauses({ maxPrice: 5000 }))
      .toContainEqual({ range: { price: { lte: 5000 } } });
    expect(buildFilterClauses({ minPrice: 1000, maxPrice: 5000 }))
      .toContainEqual({ range: { price: { gte: 1000, lte: 5000 } } });
  });

  it('treats inStock:false as a filter rather than as "unset"', () => {
    // `if (params.inStock)` would drop this, since false is falsy.
    expect(buildFilterClauses({ inStock: false }))
      .toContainEqual({ term: { inStock: false } });
  });

  it('adds nothing beyond the status floor for an empty query', () => {
    expect(buildFilterClauses({})).toHaveLength(1);
  });
});

describe('buildSort', () => {
  it('returns a sort spec for every supported mode', () => {
    for (const mode of ['price_asc', 'price_desc', 'rating', 'newest'] as const) {
      expect(buildSort(mode)).toBeDefined();
    }
  });
});

describe('buildKnnClause', () => {
  it('carries the query vector and the filter through to the kNN clause', () => {
    const filter = buildFilterClauses({ sellerId: 's1' });
    const knn    = buildKnnClause([0.1, 0.2, 0.3], filter);

    expect(JSON.stringify(knn)).toContain('0.1');
    expect(JSON.stringify(knn)).toContain('s1');
  });
});
