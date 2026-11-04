jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('expo-secure-store', () => ({
  __esModule: true,
  getItemAsync: jest.fn(async () => null),
  setItemAsync: jest.fn(async () => undefined),
  deleteItemAsync: jest.fn(async () => undefined),
}));
jest.mock('expo-router', () => ({ router: { replace: jest.fn(), push: jest.fn() } }));

import { productsApi } from '../products.api';
import { storefrontApi } from '../storefront.api';
import { apiClient } from '../client';
import { variantLabel, type Product } from '@/types';

/**
 * The shape product-service actually sends, versus the shape mobile declared.
 *
 * Five field names on the mobile Product type did not exist on the wire, and
 * because the API layer passes the response through untouched, every one read
 * `undefined` at runtime:
 *
 *   images → imageUrls, rating → averageRating, stock → stockQuantity,
 *   originalPrice → compareAtPrice, and sellerName, which the catalogue does
 *   not carry at all.
 *
 * The result was a mobile storefront with no product images, no ratings, no
 * sale prices, and nothing ever showing as out of stock.
 *
 * These assert against a response copied from product-service's formatProduct,
 * so a rename on either side fails here rather than in a shopper's hands.
 */

/** Exactly what formatProduct emits for one product. */
const SERVER_PRODUCT = {
  id: 'prod-1',
  name: 'Kabira Coffee Press',
  slug: 'kabira-coffee-press',
  description: 'A press',
  sku: 'KAB-001',
  price: 45000,
  compareAtPrice: 60000,
  currency: 'UGX',
  stockQuantity: 7,
  inStock: true,
  lowStock: false,
  category: { id: 'c1', name: 'Home', slug: 'home' },
  brand: { id: 'b1', name: 'Kabira', slug: 'kabira' },
  sellerId: 'seller-user-9f2',
  status: 'ACTIVE',
  averageRating: 4.6,
  reviewCount: 12,
  imageUrls: ['https://cdn.example.test/press.webp'],
  tags: ['kitchen'],
  variants: [
    {
      id: 'v1',
      sku: 'KAB-001-RED',
      attributes: { color: 'Red', size: 'M' },
      price: 45000,
      compareAtPrice: 60000,
      stock: 10,
      reserved: 3,
      availableStock: 7,
      images: [],
    },
  ],
};

beforeEach(() => {
  jest.clearAllMocks();
});

describe('the product a screen receives carries the fields it reads', () => {
  it('passes the server response through under its real names', async () => {
    jest.spyOn(apiClient, 'get').mockResolvedValue({
      data: { data: SERVER_PRODUCT },
    } as never);

    const product = (await productsApi.getProductById('prod-1')) as Product;

    // The five that were undefined before.
    expect(product.imageUrls).toEqual(['https://cdn.example.test/press.webp']);
    expect(product.averageRating).toBe(4.6);
    expect(product.stockQuantity).toBe(7);
    expect(product.compareAtPrice).toBe(60000);
    expect(product.sellerId).toBe('seller-user-9f2');
  });

  it('carries no field the server does not send', async () => {
    jest.spyOn(apiClient, 'get').mockResolvedValue({
      data: { data: SERVER_PRODUCT },
    } as never);

    const product = (await productsApi.getProductById('prod-1')) as unknown as Record<string, unknown>;

    // Reading any of these is the bug: they are gone from the type, and a
    // screen reaching for one would have rendered blank.
    for (const absent of ['images', 'rating', 'stock', 'originalPrice', 'sellerName']) {
      expect(product[absent]).toBeUndefined();
    }
  });

  it('reports stock as the server computed it, net of reservations', async () => {
    jest.spyOn(apiClient, 'get').mockResolvedValue({
      data: { data: { ...SERVER_PRODUCT, stockQuantity: 0, inStock: false } },
    } as never);

    const product = (await productsApi.getProductById('prod-1')) as Product;

    // `undefined <= 0` was false, so a sold-out product never showed as one.
    expect(product.inStock).toBe(false);
    expect(product.stockQuantity <= 0).toBe(true);
  });
});

describe('variants use the real attribute/price/stock model', () => {
  it('labels a variant from its attributes, not a `label` field', () => {
    const variant = SERVER_PRODUCT.variants[0];

    expect(variantLabel(variant as never)).toBe('Red · M');
  });

  it('carries an absolute price and availableStock, not a priceModifier', async () => {
    jest.spyOn(apiClient, 'get').mockResolvedValue({
      data: { data: SERVER_PRODUCT },
    } as never);

    const product = (await productsApi.getProductById('prod-1')) as Product;
    const variant = product.variants?.[0];

    expect(variant?.price).toBe(45000);
    // stock 10 − reserved 3. Offering the reserved 3 is how a checkout fails
    // at the reservation step after payment details are entered.
    expect(variant?.availableStock).toBe(7);
    expect((variant as unknown as Record<string, unknown>)?.priceModifier).toBeUndefined();
  });
});

describe('the seller is resolved from marketplace-service', () => {
  it('asks for the store by the product’s sellerId', async () => {
    const get = jest.spyOn(apiClient, 'get').mockResolvedValue({
      data: { data: { userId: 'seller-user-9f2', storeName: 'Kabira Home Goods' } },
    } as never);

    await storefrontApi.getStore('seller-user-9f2');

    expect(get).toHaveBeenCalledWith('/api/v1/marketplace/stores/seller-user-9f2');
  });

  it('asks once for the same seller, however many screens want it', async () => {
    const get = jest.spyOn(apiClient, 'get').mockResolvedValue({
      data: { data: { userId: 'seller-dedupe', storeName: 'Shop' } },
    } as never);

    await Promise.all([
      storefrontApi.getStore('seller-dedupe'),
      storefrontApi.getStore('seller-dedupe'),
      storefrontApi.getStore('seller-dedupe'),
    ]);

    expect(get).toHaveBeenCalledTimes(1);
  });

  it('retries after a failure instead of remembering the seller as shopless', async () => {
    const get = jest
      .spyOn(apiClient, 'get')
      .mockRejectedValueOnce(new Error('network'))
      .mockResolvedValueOnce({ data: { data: { userId: 'seller-retry', storeName: 'Shop' } } } as never);

    await expect(storefrontApi.getStore('seller-retry')).rejects.toBeDefined();
    await expect(storefrontApi.getStore('seller-retry')).resolves.toMatchObject({
      storeName: 'Shop',
    });
    expect(get).toHaveBeenCalledTimes(2);
  });
});
