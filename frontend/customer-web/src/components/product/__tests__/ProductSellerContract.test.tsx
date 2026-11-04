import { describe, expect, it, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders, signedIn } from '@/test-utils/renderWithProviders';

const addItem = vi.fn();
vi.mock('@/hooks/useCart', () => ({
  useCart: () => ({ addItem, isLoading: false }),
}));

const getStore = vi.fn();
vi.mock('@/api/storefront.api', () => ({
  storefrontApi: { getStore: (...a: unknown[]) => getStore(...a) },
}));

const { ProductDetails } = await import('../ProductDetails');

const SELLER_ID = 'seller-user-9f2';

function product(overrides: Record<string, unknown> = {}) {
  return {
    id: 'prod-1',
    name: 'Kabira Coffee Press',
    slug: 'kabira-coffee-press',
    sellerId: SELLER_ID,
    price: 45000,
    currency: 'UGX',
    imageUrls: ['https://cdn.example.test/press.webp'],
    inStock: true,
    stockQuantity: 7,
    averageRating: 0,
    reviewCount: 0,
    ...overrides,
  } as never;
}

/** What marketplace-service returns for a public store. */
const STORE = {
  id: 'store-1',
  userId: SELLER_ID,
  storeName: 'Kabira Home Goods',
  storeSlug: 'kabira-home-goods',
  description: '',
  logo: null,
  banner: null,
  categories: [],
  location: null,
  rating: 4.6,
  reviewCount: 12,
  totalSales: 340,
  verificationStatus: 'verified',
  joinedAt: '2026-01-01T00:00:00.000Z',
};

beforeEach(() => {
  addItem.mockReset().mockResolvedValue(undefined);
  getStore.mockReset().mockResolvedValue(STORE);
});

describe('add to cart uses the product’s real sellerId', () => {
  it('adds a product that has only sellerId, with no nested seller object', async () => {
    renderWithProviders(<ProductDetails product={product()} />, { preloadedState: signedIn() });

    await userEvent.click(await screen.findByRole('button', { name: /add to cart/i }));

    await waitFor(() => expect(addItem).toHaveBeenCalled());
    expect(addItem.mock.calls[0][0]).toMatchObject({
      productId: 'prod-1',
      sellerId: SELLER_ID,
    });
  });

  it('does not refuse with the old "no seller information" message', async () => {
    renderWithProviders(<ProductDetails product={product()} />, { preloadedState: signedIn() });

    await userEvent.click(await screen.findByRole('button', { name: /add to cart/i }));

    await waitFor(() => expect(addItem).toHaveBeenCalled());
    expect(screen.queryByText(/has no seller information/i)).not.toBeInTheDocument();
  });

  it('still adds to cart when the seller has no storefront at all', async () => {
    // A 404 from marketplace-service means no public shop page. That is not a
    // reason to block a sale — the seller and their stock are real.
    getStore.mockRejectedValue(Object.assign(new Error('404'), { response: { status: 404 } }));

    renderWithProviders(<ProductDetails product={product()} />, { preloadedState: signedIn() });

    await userEvent.click(await screen.findByRole('button', { name: /add to cart/i }));

    await waitFor(() => expect(addItem).toHaveBeenCalled());
    expect(addItem.mock.calls[0][0]).toMatchObject({ sellerId: SELLER_ID });
  });

  it('refuses only when the product genuinely carries no seller', async () => {
    renderWithProviders(
      <ProductDetails product={product({ sellerId: undefined })} />,
      { preloadedState: signedIn() },
    );

    await userEvent.click(await screen.findByRole('button', { name: /add to cart/i }));

    expect(addItem).not.toHaveBeenCalled();
  });
});

describe('the seller shown is the real store', () => {
  it('looks the store up by the product’s sellerId', async () => {
    renderWithProviders(<ProductDetails product={product()} />, { preloadedState: signedIn() });

    await waitFor(() => expect(getStore).toHaveBeenCalledWith(SELLER_ID));
  });

  it('renders the store name marketplace-service returned', async () => {
    renderWithProviders(<ProductDetails product={product()} />, { preloadedState: signedIn() });

    expect(await screen.findByText(/Kabira Home Goods/)).toBeInTheDocument();
  });

  it('invents no seller when there is no storefront', async () => {
    getStore.mockRejectedValue(new Error('404'));

    renderWithProviders(<ProductDetails product={product()} />, { preloadedState: signedIn() });

    await waitFor(() => expect(getStore).toHaveBeenCalled());
    // No placeholder shop name standing in for one that may not exist.
    expect(screen.queryByText(/Kabira Home Goods/)).not.toBeInTheDocument();
    expect(screen.queryByText(/MUNI Partner Store/)).not.toBeInTheDocument();
  });

  it('asks for nothing when the product has no seller id', async () => {
    renderWithProviders(
      <ProductDetails product={product({ sellerId: undefined })} />,
      { preloadedState: signedIn() },
    );

    await screen.findByRole('button', { name: /add to cart/i });
    expect(getStore).not.toHaveBeenCalled();
  });
});
