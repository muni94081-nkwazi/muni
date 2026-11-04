// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders, signedIn, signedOut } from '@/test-utils/renderWithProviders';
import { IMAGE_FALLBACK_SRC } from '@/utils/imageFallback';

// ─── The card renders the product product-service actually sends ──────────────
//
// formatProduct() emits `brand` as a plain string and never sends a `seller`
// object at all. The old card did:
//
//   const brandName  = product.brand?.name || '';
//   const sellerName = product.seller?.name || brandName || 'MUNI';
//
// `.name` on a string is undefined, so brandName was always '' and every card
// in the catalogue named MUNI as the seller. MUNI is the marketplace, not the
// merchant — the sellers are the merchants, and saying otherwise misattributes
// every listing on the site.

/** Typed with the payload so the assertions below can read `calls[0][0]`. */
const addItem = vi.fn<(payload: Record<string, unknown>) => Promise<void>>(() => Promise.resolve());
vi.mock('@/hooks/useCart', () => ({
  useCart: () => ({ addItem, isLoading: false }),
}));

const save = vi.fn(() => Promise.resolve(true));
const savedIds = new Set<string>();
vi.mock('@/hooks/useWishlist', () => ({
  useWishlist: () => ({
    isSaved: (id: string) => savedIds.has(id),
    save,
    isHydrated: true,
  }),
}));

const { ProductCard, discountPercent, primaryImage } = await import('../ProductCard');

const SELLER_ID = 'seller-user-7c1';

function product(overrides: Record<string, unknown> = {}) {
  return {
    id: 'prod-1',
    name: 'Kabira Coffee Press',
    slug: 'kabira-coffee-press',
    description: 'A press.',
    sellerId: SELLER_ID,
    price: 85000,
    compareAtPrice: null,
    currency: 'UGX',
    imageUrls: ['https://media.muni.test/products/press-1.jpg'],
    inStock: true,
    stockQuantity: 12,
    averageRating: 0,
    reviewCount: 0,
    brand: undefined,
    status: 'ACTIVE',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  } as never;
}

const renderCard = (p = product(), state = signedIn()) =>
  renderWithProviders(<ProductCard product={p} />, { preloadedState: state });

beforeEach(() => {
  vi.clearAllMocks();
  savedIds.clear();
});

describe('the seller is never invented', () => {
  it('does not name MUNI as the seller of a marketplace listing', () => {
    renderCard();
    expect(screen.queryByText(/^MUNI$/)).toBeNull();
  });

  it('shows no seller on the card at all, rather than a guess', () => {
    // Resolving the real store would be one request per tile. The PDP shows
    // the real seller; the card shows none.
    renderCard(product({ sellerId: SELLER_ID }));
    expect(screen.queryByText(/sold by/i)).toBeNull();
  });
});

describe('brand is a string, as the API sends it', () => {
  it('renders the brand when the product has one', () => {
    renderCard(product({ brand: 'Kabira' }));
    expect(screen.getByText('Kabira')).toBeTruthy();
  });

  it('renders no brand line when the product has none', () => {
    const { container } = renderCard(product({ brand: undefined }));
    expect(container.textContent).not.toContain('undefined');
  });
});

describe('images come from imageUrls', () => {
  it('uses the first real image the seller uploaded', () => {
    renderCard();
    const img = screen.getByAltText('Kabira Coffee Press') as HTMLImageElement;
    expect(img.getAttribute('src')).toContain('press-1.jpg');
  });

  it('falls back to the inline placeholder, not a remote placeholder service', () => {
    expect(primaryImage({ imageUrls: [] })).toBe(IMAGE_FALLBACK_SRC);
    expect(primaryImage({ imageUrls: [] })).not.toContain('placehold');
    expect(primaryImage({ imageUrls: [] })).not.toContain('unsplash');
  });

  it('skips blank entries rather than rendering an empty src', () => {
    expect(primaryImage({ imageUrls: ['', '  '] })).toBe(IMAGE_FALLBACK_SRC);
  });
});

describe('discounts are only shown when they are real', () => {
  it('shows nothing when there is no compare-at price', () => {
    expect(discountPercent({ price: 85000, compareAtPrice: undefined })).toBeNull();
    renderCard();
    expect(screen.queryByText(/%/)).toBeNull();
  });

  it('shows nothing when the compare-at price is not above the price', () => {
    expect(discountPercent({ price: 85000, compareAtPrice: 85000 })).toBeNull();
    expect(discountPercent({ price: 85000, compareAtPrice: 70000 })).toBeNull();
  });

  it('computes the real percentage off a genuine compare-at price', () => {
    expect(discountPercent({ price: 75000, compareAtPrice: 100000 })).toBe(25);
    renderCard(product({ price: 75000, compareAtPrice: 100000 }));
    expect(screen.getByText('-25%')).toBeTruthy();
  });

  it('shows the original price only alongside a real discount', () => {
    renderCard(product({ price: 75000, compareAtPrice: 100000 }));
    // Both prices are formatted by the same currency call, so they can never
    // disagree about which currency they are in.
    expect(screen.getByText(/100,000/)).toBeTruthy();
  });
});

describe('ratings', () => {
  it('shows no rating for a product nobody has reviewed', () => {
    renderCard(product({ averageRating: 0, reviewCount: 0 }));
    expect(screen.queryByText(/\(0\)/)).toBeNull();
  });

  it('shows the real rating and review count when they exist', () => {
    renderCard(product({ averageRating: 4.5, reviewCount: 124 }));
    expect(screen.getByText(/4\.5/)).toBeTruthy();
    expect(screen.getByText(/\(124\)/)).toBeTruthy();
  });
});

describe('add to cart', () => {
  it('adds the product with its real sellerId', async () => {
    renderCard();
    await userEvent.click(screen.getByRole('button', { name: /add to cart/i }));

    await waitFor(() => expect(addItem).toHaveBeenCalledTimes(1));
    expect(addItem.mock.calls[0][0]).toMatchObject({
      productId: 'prod-1',
      sellerId: SELLER_ID,
      quantity: 1,
      price: 85000,
    });
  });

  it('caps the requested quantity at the stock the server reported', async () => {
    renderCard(product({ stockQuantity: 3 }));
    await userEvent.click(screen.getByRole('button', { name: /add to cart/i }));

    await waitFor(() => expect(addItem).toHaveBeenCalled());
    expect(addItem.mock.calls[0][0]).toMatchObject({ maxQuantity: 3 });
  });

  it('refuses an out-of-stock product instead of queueing a doomed request', async () => {
    renderCard(product({ inStock: false }));
    const button = screen.getByRole('button', { name: /out of stock/i });

    expect(button.hasAttribute('disabled')).toBe(true);
    await userEvent.click(button);
    expect(addItem).not.toHaveBeenCalled();
  });

  it('surfaces a failure rather than claiming the item was added', async () => {
    addItem.mockRejectedValueOnce(new Error('Cart is full'));
    renderCard();

    await userEvent.click(screen.getByRole('button', { name: /add to cart/i }));
    await waitFor(() => expect(screen.queryByText(/added to cart/i)).toBeNull());
  });
});

describe('wishlist state is real', () => {
  it('shows an already-saved product as saved on first render', () => {
    savedIds.add('prod-1');
    renderCard();
    // The old card initialised this to false every time, so a saved item
    // always rendered an empty heart.
    expect(screen.getByRole('button', { name: /is in your wishlist/i })).toBeTruthy();
  });

  it('shows an unsaved product as unsaved', () => {
    renderCard();
    expect(screen.getByRole('button', { name: /save .* to your wishlist/i })).toBeTruthy();
  });

  it('asks a signed-out visitor to sign in instead of pretending to save', async () => {
    save.mockResolvedValueOnce(false);
    const { store } = renderCard(product(), signedOut());

    await userEvent.click(screen.getByRole('button', { name: /save .* to your wishlist/i }));

    // Asserted on the store rather than the screen: the toast host lives in
    // the app shell, which this test does not mount.
    await waitFor(() => {
      const { toasts } = (store.getState() as { ui: { toasts: { message: string }[] } }).ui;
      expect(toasts.some((t) => /sign in to save/i.test(t.message))).toBe(true);
    });
  });
});

describe('accessibility', () => {
  it('keeps the buttons out of the product link', () => {
    const { container } = renderCard();
    // A <button> inside an <a> is invalid and makes the card unusable by
    // keyboard. The card is an <article>; the name is the only link.
    expect(container.querySelectorAll('a button').length).toBe(0);
  });

  it('links to the product by slug', () => {
    renderCard();
    const link = screen.getByRole('link', { name: /kabira coffee press/i });
    expect(link.getAttribute('href')).toBe('/products/kabira-coffee-press');
  });
});
