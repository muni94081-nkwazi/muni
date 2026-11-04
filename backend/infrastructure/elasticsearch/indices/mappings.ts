/**
 * MUNI Platform — Elasticsearch Index Mappings
 * Run setupAllIndices() on search-service startup.
 */

import { ensureIndex } from '../client.js';

// ─── Product Index ────────────────────────────────────────────────────────────

export const PRODUCT_INDEX = 'muni-products';

export const productIndexMapping = {
  settings: {
    number_of_shards:   2,
    number_of_replicas: 1,
    analysis: {
      analyzer: {
        product_analyzer: {
          type:      'custom',
          tokenizer: 'standard',
          filter:    ['lowercase', 'asciifolding', 'stop'],
        },
      },
    },
  },
  mappings: {
    properties: {
      id:            { type: 'keyword' },
      name:          { type: 'text', analyzer: 'product_analyzer', fields: { keyword: { type: 'keyword' } } },
      description:   { type: 'text', analyzer: 'product_analyzer' },
      slug:          { type: 'keyword' },
      category:      { type: 'keyword' },
      categoryPath:  { type: 'keyword' },
      brand:         { type: 'keyword' },
      sellerId:      { type: 'keyword' },
      sellerName:    { type: 'text', fields: { keyword: { type: 'keyword' } } },
      price:         { type: 'double' },
      currency:      { type: 'keyword' },
      rating:        { type: 'float' },
      reviewCount:   { type: 'integer' },
      stock:         { type: 'integer' },
      inStock:       { type: 'boolean' },
      images:        { type: 'keyword', index: false },
      tags:          { type: 'keyword' },
      attributes:    { type: 'object', dynamic: true },
      status:        { type: 'keyword' },
      createdAt:     { type: 'date' },
      updatedAt:     { type: 'date' },
      // Geo for seller location search
      sellerLocation: { type: 'geo_point' },
    },
  },
};

// ─── Order Index ──────────────────────────────────────────────────────────────

export const ORDER_INDEX = 'muni-orders';

export const orderIndexMapping = {
  settings: { number_of_shards: 2, number_of_replicas: 1 },
  mappings: {
    properties: {
      id:           { type: 'keyword' },
      userId:       { type: 'keyword' },
      sellerId:     { type: 'keyword' },
      status:       { type: 'keyword' },
      total:        { type: 'double' },
      currency:     { type: 'keyword' },
      itemCount:    { type: 'integer' },
      items: {
        type: 'nested',
        properties: {
          productId:   { type: 'keyword' },
          productName: { type: 'text' },
          quantity:    { type: 'integer' },
          price:       { type: 'double' },
        },
      },
      shippingAddress: { type: 'object', dynamic: true },
      paymentMethod:   { type: 'keyword' },
      createdAt:       { type: 'date' },
      updatedAt:       { type: 'date' },
    },
  },
};

// ─── User Index (for admin search) ───────────────────────────────────────────

export const USER_INDEX = 'muni-users';

export const userIndexMapping = {
  settings: { number_of_shards: 1, number_of_replicas: 1 },
  mappings: {
    properties: {
      id:          { type: 'keyword' },
      email:       { type: 'keyword' },
      firstName:   { type: 'text', fields: { keyword: { type: 'keyword' } } },
      lastName:    { type: 'text', fields: { keyword: { type: 'keyword' } } },
      fullName:    { type: 'text', analyzer: 'standard' },
      roles:       { type: 'keyword' },
      active:      { type: 'boolean' },
      createdAt:   { type: 'date' },
    },
  },
};

// ─── Seller Index ─────────────────────────────────────────────────────────────

export const SELLER_INDEX = 'muni-sellers';

export const sellerIndexMapping = {
  settings: { number_of_shards: 1, number_of_replicas: 1 },
  mappings: {
    properties: {
      id:                 { type: 'keyword' },
      userId:             { type: 'keyword' },
      storeName:          { type: 'text', fields: { keyword: { type: 'keyword' } } },
      storeSlug:          { type: 'keyword' },
      description:        { type: 'text' },
      categories:         { type: 'keyword' },
      rating:             { type: 'float' },
      reviewCount:        { type: 'integer' },
      totalSales:         { type: 'long' },
      status:             { type: 'keyword' },
      verificationStatus: { type: 'keyword' },
      location: {
        properties: {
          city:    { type: 'keyword' },
          country: { type: 'keyword' },
          geo:     { type: 'geo_point' },
        },
      },
      joinedAt: { type: 'date' },
    },
  },
};

// ─── Setup All Indices ────────────────────────────────────────────────────────

export async function setupAllIndices(): Promise<void> {
  await Promise.all([
    ensureIndex(PRODUCT_INDEX, productIndexMapping),
    ensureIndex(ORDER_INDEX,   orderIndexMapping),
    ensureIndex(USER_INDEX,    userIndexMapping),
    ensureIndex(SELLER_INDEX,  sellerIndexMapping),
  ]);
  console.log('[elasticsearch] ✅ All indices ready');
}
