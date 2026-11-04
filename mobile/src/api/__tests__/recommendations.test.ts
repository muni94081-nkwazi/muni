jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(async () => null),
  setItemAsync: jest.fn(async () => undefined),
  deleteItemAsync: jest.fn(async () => undefined),
}));
jest.mock('expo-router', () => ({ router: { replace: jest.fn(), push: jest.fn() } }));

import { recommendedProducts, recommendationsApi } from '../recommendations.api';
import { productsApi } from '../products.api';
import type { Product } from '@/types';

jest.mock('../products.api', () => ({
  productsApi: { getProductById: jest.fn() },
}));

const getProductById = productsApi.getProductById as jest.MockedFunction<
  typeof productsApi.getProductById
>;

function product(id: string): Product {
  return { id, name: `Product ${id}`, price: 1000 } as Product;
}

describe('recommendedProducts', () => {
  beforeEach(() => {
    jest.restoreAllMocks();
    getProductById.mockReset();
  });

  it('uses the personalized strategy for a signed-in shopper', async () => {
    const personalized = jest
      .spyOn(recommendationsApi, 'personalized')
      .mockResolvedValue([{ productId: 'p1', score: 0.9, reason: 'personalized' }]);
    const trending = jest.spyOn(recommendationsApi, 'trending').mockResolvedValue([]);
    getProductById.mockResolvedValue(product('p1'));

    const result = await recommendedProducts(true, 4);

    expect(personalized).toHaveBeenCalledWith(4);
    expect(trending).not.toHaveBeenCalled();
    expect(result.map((p) => p.id)).toEqual(['p1']);
  });

  it('uses trending for a guest, since personalization keyed to no user is noise', async () => {
    const personalized = jest.spyOn(recommendationsApi, 'personalized').mockResolvedValue([]);
    const trending = jest
      .spyOn(recommendationsApi, 'trending')
      .mockResolvedValue([{ productId: 'p2', score: 0.5, reason: 'trending' }]);
    getProductById.mockResolvedValue(product('p2'));

    const result = await recommendedProducts(false, 4);

    expect(trending).toHaveBeenCalledWith(4);
    expect(personalized).not.toHaveBeenCalled();
    expect(result.map((p) => p.id)).toEqual(['p2']);
  });

  it('drops references that no longer resolve instead of rendering blanks', async () => {
    jest.spyOn(recommendationsApi, 'trending').mockResolvedValue([
      { productId: 'gone', score: 0.8, reason: 'trending' },
      { productId: 'ok', score: 0.7, reason: 'trending' },
    ]);
    getProductById.mockImplementation(async (id: string) => {
      if (id === 'gone') throw new Error('404');
      return product(id);
    });

    const result = await recommendedProducts(false, 4);

    // A recommendation pointing at a delisted product should vanish, not show
    // as an empty tile.
    expect(result.map((p) => p.id)).toEqual(['ok']);
  });

  it('never asks for more products than the caller wanted', async () => {
    jest.spyOn(recommendationsApi, 'trending').mockResolvedValue(
      Array.from({ length: 10 }, (_, i) => ({
        productId: `p${i}`,
        score: 0.5,
        reason: 'trending' as const,
      })),
    );
    getProductById.mockImplementation(async (id: string) => product(id));

    const result = await recommendedProducts(false, 3);

    expect(getProductById).toHaveBeenCalledTimes(3);
    expect(result).toHaveLength(3);
  });

  it('returns nothing when the service has no recommendations', async () => {
    jest.spyOn(recommendationsApi, 'trending').mockResolvedValue([]);

    await expect(recommendedProducts(false, 4)).resolves.toEqual([]);
    expect(getProductById).not.toHaveBeenCalled();
  });
});
