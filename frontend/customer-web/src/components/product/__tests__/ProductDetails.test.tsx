// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders, signedIn } from '@/test-utils/renderWithProviders';

// ─── The buy box works off the selected variant ───────────────────────────────
//
// The PDP laid itself out as a single column at every width, so on a desktop
// the price and Add to Cart sat below the image rather than beside it. These
// cover the behaviour that came with the relayout — the gallery, the variant
// wiring, and the two purchase actions — against the contract
// product-service actually serves.

const addItem = vi.fn<(payload: Record<string, unknown>) => Promise<void>>(() => Promise.resolve());
vi.mock('@/hooks/useCart', () => ({
  useCart: () => ({ addItem, isLoading: false }),
}));

const save = vi.fn(() => Promise.resolve(true));
const savedIds = new Set<string>();
vi.mock('@/hooks/useWishlist', () => ({
  useWishlist: () => ({ isSaved: (id: string) => savedIds.has(id), save, isHydrated: true }),
}));

const getStore = vi.fn();
vi.mock('@/api/storefront.api', () => ({
  storefrontApi: { getStore: (...a: unknown[]) => getStore(...a) },
}));

const navigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { ...actual, useNavigate: () => navigate };
});

const { ProductDetails } = await import('../ProductDetails');

const SELLER_ID = 'seller-user-3b8';

function product(overrides: Record<string, unknown> = {}) {
  return {
    id: 'prod-9',
    name: 'Masaka Shea Butter 200ml',
    slug: 'masaka-shea-butter-200ml',
    description: 'Unrefined shea butter.',
    sellerId: SELLER_ID,
    price: 30000,
    compareAtPrice: null,
    currency: 'UGX',
    imageUrls: ['https://media.muni.test/products/shea-1.jpg'],
    inStock: true,
    stockQuantity: 9,
    averageRating: 0,
    reviewCount: 0,
    brand: undefined,
    ...overrides,
  } as never;
}

function variant(id: string, over: Record<string, unknown> = {}) {
  return {
    id,
    productId: 'prod-9',
    sku: `sku-${id}`,
    attributes: { size: id.toUpperCase() },
    price: 30000,
    stockQuantity: 5,
    inStock: true,
    ...over,
  } as never;
}

const render = (p = product(), variants: never[] = []) =>
  renderWithProviders(<ProductDetails product={p} variants={variants} />, {
    preloadedState: signedIn(),
  });

beforeEach(() => {
  vi.clearAllMocks();
  savedIds.clear();
  getStore.mockRejectedValue(new Error('no storefront'));
});

describe('real product data renders', () => {
  it('shows the product name, brand and price from the record', async () => {
    render(product({ brand: 'Masaka Naturals' }));

    expect(screen.getByRole('heading', { level: 1, name: /Masaka Shea Butter 200ml/ })).toBeTruthy();
    expect(screen.getByText('Masaka Naturals')).toBeTruthy();
    expect(screen.getByText(/30,000/)).toBeTruthy();
  });

  it('renders the seller-uploaded image, not a remote placeholder', () => {
    render();
    const img = screen.getByAltText('Masaka Shea Butter 200ml') as HTMLImageElement;
    expect(img.getAttribute('src')).toContain('shea-1.jpg');
    expect(img.getAttribute('src')).not.toMatch(/placehold|unsplash/);
  });

  it('shows no rating for a product nobody has reviewed', () => {
    render();
    expect(screen.queryByText(/review/i)).toBeNull();
  });

  it('shows the real rating and review count when they exist', () => {
    render(product({ averageRating: 4.2, reviewCount: 17 }));
    expect(screen.getByText(/17 reviews/)).toBeTruthy();
  });
});

describe('the gallery', () => {
  it('renders no thumbnail rail for a single image', () => {
    render();
    expect(screen.queryByRole('button', { name: /view image/i })).toBeNull();
  });

  it('switches the main image when a thumbnail is chosen', async () => {
    render(product({ imageUrls: ['/media/a.jpg', '/media/b.jpg'] }));

    const main = () => screen.getByAltText('Masaka Shea Butter 200ml') as HTMLImageElement;
    expect(main().getAttribute('src')).toContain('a.jpg');

    await userEvent.click(screen.getByRole('button', { name: /view image 2 of 2/i }));
    await waitFor(() => expect(main().getAttribute('src')).toContain('b.jpg'));
  });
});

describe('variants drive price, stock and the cart payload', () => {
  const variants = [
    variant('v1', { price: 30000, stockQuantity: 4, inStock: true }),
    variant('v2', { price: 46000, stockQuantity: 0, inStock: false }),
  ];

  it('renders no variant selector when the product has none', () => {
    render(product(), []);
    expect(screen.queryByText(/select variant/i)).toBeNull();
  });

  it('shows the first in-stock variant price rather than a stale base price', async () => {
    render(product({ price: 99999 }), variants as never[]);

    // The variant's price appears in the buy box AND on its own selector
    // button, so this asserts on the absence of the base price instead: the
    // point is that 99,999 is never shown once a variant is resolved.
    await waitFor(() => expect(screen.getAllByText(/30,000/).length).toBeGreaterThan(0));
    expect(screen.queryByText(/99,999/)).toBeNull();
  });

  it('sends the selected variant id with Add to Cart', async () => {
    render(product(), variants as never[]);

    await waitFor(() => expect(screen.getByRole('button', { name: /add to cart/i })).toBeTruthy());
    await userEvent.click(screen.getByRole('button', { name: /add to cart/i }));

    await waitFor(() => expect(addItem).toHaveBeenCalled());
    expect(addItem.mock.calls[0][0]).toMatchObject({
      productId: 'prod-9',
      sellerId: SELLER_ID,
      variantId: 'v1',
      price: 30000,
    });
  });
});

describe('purchase actions', () => {
  it('adds to cart with the real sellerId', async () => {
    render();
    await userEvent.click(screen.getByRole('button', { name: /add to cart/i }));

    await waitFor(() => expect(addItem).toHaveBeenCalledTimes(1));
    expect(addItem.mock.calls[0][0]).toMatchObject({ sellerId: SELLER_ID, quantity: 1 });
  });

  it('Buy now puts the same selection in the cart and goes to checkout', async () => {
    // It routes through the real cart on purpose: CheckoutPage reads
    // `cart.items` and has no single-item mode, so a `?productId=` would be
    // ignored and the shopper would be charged for the whole basket anyway.
    render();
    await userEvent.click(screen.getByRole('button', { name: /buy now/i }));

    await waitFor(() => expect(addItem).toHaveBeenCalledTimes(1));
    expect(navigate).toHaveBeenCalledWith('/checkout');
  });

  it('offers no purchase action for an out-of-stock product', () => {
    render(product({ inStock: false, stockQuantity: 0 }));

    // Once as the availability line, once as the disabled button's label.
    expect(screen.getAllByText('Out of stock').length).toBeGreaterThan(0);
    expect(screen.queryByRole('button', { name: /^add to cart$/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /buy now/i })).toBeNull();
  });

  it('does not disable Add to Cart just because the cart is loading', () => {
    // useCart().isLoading is true while the cart fetches anything at all, and
    // the buy box used to wire it straight to this button — so it rendered
    // busy and unclickable on every page load.
    render();
    const button = screen.getByRole('button', { name: /add to cart/i }) as HTMLButtonElement;
    expect(button.disabled).toBe(false);
  });
});

describe('the seller is real or absent', () => {
  it('never names MUNI as the seller', async () => {
    render();
    await waitFor(() => expect(getStore).toHaveBeenCalled());
    expect(screen.queryByText(/^MUNI$/)).toBeNull();
  });

  it('shows no seller panel when the seller has no storefront', async () => {
    render();
    await waitFor(() => expect(getStore).toHaveBeenCalled());
    expect(screen.queryByText(/sold by/i)).toBeNull();
  });

  it('shows the real store when marketplace-service resolves one', async () => {
    getStore.mockResolvedValue({
      userId: SELLER_ID,
      storeName: 'Masaka Naturals Ltd',
      rating: 4.6,
      totalSales: 120,
      verificationStatus: 'verified',
      joinedAt: '2026-01-01T00:00:00.000Z',
      logo: null,
    });

    render();
    await waitFor(() => expect(screen.getByText('Masaka Naturals Ltd')).toBeTruthy());
    expect(screen.getByText(/sold by/i)).toBeTruthy();
  });
});

describe('wishlist', () => {
  it('reflects an already-saved product', () => {
    savedIds.add('prod-9');
    render();
    expect(screen.getByRole('button', { name: /is in your wishlist/i })).toBeTruthy();
  });

  it('saves the product when the heart is pressed', async () => {
    render();
    await userEvent.click(screen.getByRole('button', { name: /save .* to your wishlist/i }));
    await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
  });
});

describe('discounts', () => {
  it('shows nothing when there is no genuine compare-at price', () => {
    render();
    expect(screen.queryByText(/^-\d+%$/)).toBeNull();
    expect(screen.queryByText(/^Save /)).toBeNull();
  });

  it('shows the real percentage and saving when the price is genuinely reduced', () => {
    render(product({ price: 30000, compareAtPrice: 40000 }));
    expect(screen.getByText('-25%')).toBeTruthy();
    expect(screen.getByText(/Save .*10,000/)).toBeTruthy();
  });
});

// ─── Customer-web reads product images; it does not own them ──────────────────
//
// The PDP used to render a drag-and-drop uploader under the thumbnails and
// merge whatever it found in `localStorage` into the gallery. Those images were
// browser-local: the seller never saw them, no other shopper saw them, and they
// vanished on another device — while sitting in the gallery looking exactly
// like catalogue photography. Uploading belongs to the product's owner: sellers
// in Seller Center and admins in the admin panel, both through media-service.

describe('image ownership', () => {
  it('offers no upload control on the customer PDP', () => {
    render();

    expect(screen.queryByText(/drag/i)).toBeNull();
    expect(screen.queryByText(/upload/i)).toBeNull();
    expect(document.querySelector('input[type="file"]')).toBeNull();
  });

  it('builds the gallery only from the catalogue images', () => {
    // Anything a previous build left in localStorage must not reappear in the
    // gallery of a product it was never part of.
    window.localStorage.setItem(
      'muni_local_product_images',
      JSON.stringify({ 'prod-9': ['data:image/png;base64,AAAA'] }),
    );

    render(product({ imageUrls: ['/media/only-real.jpg'] }));

    const main = screen.getByAltText('Masaka Shea Butter 200ml') as HTMLImageElement;
    expect(main.getAttribute('src')).toContain('only-real.jpg');
    // One catalogue image means no thumbnail rail; a localStorage entry must
    // not have added a second.
    expect(screen.queryByRole('button', { name: /view image/i })).toBeNull();

    window.localStorage.clear();
  });

  it('still falls back to the MUNI placeholder when a product has no images', () => {
    render(product({ imageUrls: [] }));

    const main = screen.getByAltText('Masaka Shea Butter 200ml') as HTMLImageElement;
    const src = main.getAttribute('src') ?? '';
    expect(src).not.toMatch(/placehold|unsplash/);
    expect(src.startsWith('data:image/svg+xml')).toBe(true);
  });
});
