import { describe, expect, it, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders, signedOut, withCurrency } from '@/test-utils/renderWithProviders';

// ─── Public seller storefront ─────────────────────────────────────────────────
//
// The page shipped as a fixture: a hardcoded "Kampala Tech Official Store" with
// a 4.9 rating, 14,200 followers, a 99.4% response rate and stock photography,
// and `products` pinned to []. Every seller's shop rendered the same invented
// business and no products at all.
//
// These assertions cover the real thing: the store comes from
// marketplace-service, the catalogue from product-service filtered by that
// seller, and nothing that the backend does not send is drawn on the page.

const getStore = vi.fn();
const listBySeller = vi.fn();

vi.mock('@/api/storefront.api', () => ({
  storefrontApi: { getStore: (...a: unknown[]) => getStore(...a) },
}));

vi.mock('@/api/products.api', () => ({
  productsApi: { listBySeller: (...a: unknown[]) => listBySeller(...a) },
}));

let routeParam = 'kampala-crafts';
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { ...actual, useParams: () => ({ sellerId: routeParam }) };
});

const { SellerStorefrontPage } = await import('../SellerStorefrontPage');

function store(overrides: Record<string, unknown> = {}) {
  return {
    id: 'store-1',
    userId: 'seller-user-1',
    storeName: 'Kampala Crafts Collective',
    storeSlug: 'kampala-crafts',
    description: 'Handwoven baskets and ceramics.',
    logo: null,
    banner: null,
    categories: ['home'],
    location: { city: 'Kampala', country: 'UG' },
    rating: 0,
    reviewCount: 0,
    totalSales: 0,
    verificationStatus: 'pending',
    joinedAt: '2025-04-02T00:00:00.000Z',
    ...overrides,
  };
}

function product(overrides: Record<string, unknown> = {}) {
  return {
    id: 'prod-1',
    name: 'Woven Basket',
    slug: 'woven-basket',
    description: 'A basket.',
    price: 45000,
    basePrice: 45000,
    sellerId: 'seller-user-1',
    status: 'ACTIVE',
    imageUrls: ['https://example.test/basket.jpg'],
    images: [],
    averageRating: 0,
    reviewCount: 0,
    variants: [],
    ...overrides,
  };
}

const paged = (items: unknown[], total = items.length, last_page = 0) => ({
  data: items,
  meta: { current_page: 0, last_page, per_page: 24, total },
});

beforeEach(() => {
  routeParam = 'kampala-crafts';
  getStore.mockReset();
  listBySeller.mockReset();
});

/** The storefront is public, so every test renders it signed out. */
const renderPage = () =>
  renderWithProviders(<SellerStorefrontPage />, {
    preloadedState: { ...signedOut(), ...withCurrency() },
  });

describe('a public storefront loads without a session', () => {
  it('renders the real store name and description', async () => {
    getStore.mockResolvedValue(store());
    listBySeller.mockResolvedValue(paged([]));

    renderPage();

    expect(await screen.findByRole('heading', { name: 'Kampala Crafts Collective' })).toBeInTheDocument();
    expect(screen.getByText('Handwoven baskets and ceramics.')).toBeInTheDocument();
  });

  it('resolves the store from the URL parameter, slug or id', async () => {
    getStore.mockResolvedValue(store());
    listBySeller.mockResolvedValue(paged([]));

    renderPage();
    await screen.findByRole('heading', { name: 'Kampala Crafts Collective' });

    expect(getStore).toHaveBeenCalledWith('kampala-crafts');
  });

  it('shows a loading state first', async () => {
    getStore.mockReturnValue(new Promise(() => { /* never settles */ }));

    renderPage();

    expect(await screen.findByText(/loading store/i)).toBeInTheDocument();
  });
});

describe('the catalogue belongs to this seller', () => {
  it('renders the seller’s real products', async () => {
    getStore.mockResolvedValue(store());
    listBySeller.mockResolvedValue(paged([product()]));

    renderPage();

    expect(await screen.findByText('Woven Basket')).toBeInTheDocument();
  });

  it('asks for products by the store’s seller id, not the URL parameter', async () => {
    // The URL may be a slug; ownership comes from the store record.
    getStore.mockResolvedValue(store());
    listBySeller.mockResolvedValue(paged([product()]));

    renderPage();
    await screen.findByText('Woven Basket');

    expect(listBySeller).toHaveBeenCalledWith('seller-user-1', 0, 24);
    expect(listBySeller.mock.calls[0][0]).not.toBe('kampala-crafts');
  });

  it('renders an empty-store state when the seller has listed nothing', async () => {
    getStore.mockResolvedValue(store());
    listBySeller.mockResolvedValue(paged([]));

    renderPage();

    expect(await screen.findByText(/no products yet/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /browse all products/i })).toHaveAttribute('href', '/products');
  });
});

describe('the states a real page has to handle', () => {
  it('renders a not-found state for an unknown store', async () => {
    getStore.mockRejectedValue({ response: { status: 404 } });

    renderPage();

    expect(await screen.findByText(/store not found/i)).toBeInTheDocument();
    expect(listBySeller).not.toHaveBeenCalled();
  });

  it('renders a not-found state for a store that is not trading', async () => {
    // marketplace-service answers 404 for a suspended store too, so the page
    // needs no separate branch — this pins that behaviour.
    getStore.mockRejectedValue({ response: { status: 404 } });

    renderPage();

    expect(await screen.findByText(/does not exist, or is not currently trading/i)).toBeInTheDocument();
  });

  it('renders an error state with a retry when the store call fails', async () => {
    getStore.mockRejectedValue({ response: { status: 500 } });

    renderPage();

    expect(await screen.findByRole('alert')).toHaveTextContent(/could not be loaded/i);
    expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument();
  });

  it('still shows the shop when only the catalogue fails', async () => {
    getStore.mockResolvedValue(store());
    listBySeller.mockRejectedValue({ response: { status: 500 } });

    renderPage();

    expect(await screen.findByRole('heading', { name: 'Kampala Crafts Collective' })).toBeInTheDocument();
    expect(await screen.findByRole('alert')).toHaveTextContent(/could not load this store’s products/i);
  });

  it('retries both calls when the retry button is pressed', async () => {
    getStore.mockRejectedValueOnce({ response: { status: 500 } }).mockResolvedValueOnce(store());
    listBySeller.mockResolvedValue(paged([product()]));

    renderPage();
    await screen.findByRole('alert');

    await userEvent.click(screen.getByRole('button', { name: /try again/i }));

    expect(await screen.findByText('Woven Basket')).toBeInTheDocument();
  });
});

describe('nothing is fabricated', () => {
  it('does not show the old hardcoded store', async () => {
    getStore.mockResolvedValue(store());
    listBySeller.mockResolvedValue(paged([product()]));

    renderPage();
    await screen.findByRole('heading', { name: 'Kampala Crafts Collective' });

    const body = document.body.textContent ?? '';
    expect(body).not.toContain('Kampala Tech Official Store');
    expect(body).not.toContain('Gold Supplier Tier');
    expect(body).not.toMatch(/14,?200/);
    expect(body).not.toContain('99.4%');
    expect(body).not.toContain('30-Day Money Back Guarantee');
  });

  it('shows no rating for a store that has no reviews', async () => {
    getStore.mockResolvedValue(store({ rating: 0, reviewCount: 0 }));
    listBySeller.mockResolvedValue(paged([]));

    renderPage();
    await screen.findByRole('heading', { name: 'Kampala Crafts Collective' });

    expect(screen.queryByText(/★/)).not.toBeInTheDocument();
    expect(document.body.textContent).not.toContain('4.9');
  });

  it('shows the real rating once the store genuinely has reviews', async () => {
    getStore.mockResolvedValue(store({ rating: 4.2, reviewCount: 37 }));
    listBySeller.mockResolvedValue(paged([]));

    renderPage();

    expect(await screen.findByText(/★ 4\.2 \(37 reviews\)/)).toBeInTheDocument();
  });

  it('does not render a banner or logo the store does not have', async () => {
    getStore.mockResolvedValue(store({ banner: null, logo: null }));
    listBySeller.mockResolvedValue(paged([]));

    renderPage();
    await screen.findByRole('heading', { name: 'Kampala Crafts Collective' });

    expect(screen.queryByAltText(/banner/i)).not.toBeInTheDocument();
    expect(screen.queryByAltText(/logo/i)).not.toBeInTheDocument();
    expect(document.body.innerHTML).not.toContain('unsplash');
  });

  it('never uses a hardcoded seller identity', async () => {
    getStore.mockResolvedValue(store());
    listBySeller.mockResolvedValue(paged([product()]));

    renderPage();
    await screen.findByText('Woven Basket');

    const calls = JSON.stringify([...getStore.mock.calls, ...listBySeller.mock.calls]);
    expect(calls).not.toContain('sel-901');
    expect(calls).not.toContain('seller-001');
    expect(calls).not.toContain('user-123');
  });
});

describe('private seller data is never displayed', () => {
  it('does not render commission, bank or document fields even if present', async () => {
    // Defence in depth: marketplace-service strips these, and the page must not
    // print them if a future response ever carries them.
    getStore.mockResolvedValue(store({
      commissionRate: 7.5,
      bankAccount: { accountNumber: '1234567890', bankName: 'Test Bank' },
      status: 'ACTIVE',
    } as never));
    listBySeller.mockResolvedValue(paged([]));

    renderPage();
    await screen.findByRole('heading', { name: 'Kampala Crafts Collective' });

    const body = document.body.textContent ?? '';
    expect(body).not.toContain('7.5');
    expect(body).not.toContain('1234567890');
    expect(body).not.toContain('Test Bank');
    expect(body.toLowerCase()).not.toContain('commission');
  });
});

describe('pagination uses the backend’s own meta', () => {
  it('offers more products only when another page exists', async () => {
    getStore.mockResolvedValue(store());
    listBySeller.mockResolvedValue(paged([product()], 30, 1));

    renderPage();
    await screen.findByText('Woven Basket');

    expect(screen.getByRole('button', { name: /show more products/i })).toBeInTheDocument();
  });

  it('hides the control on the last page', async () => {
    getStore.mockResolvedValue(store());
    listBySeller.mockResolvedValue(paged([product()], 1, 0));

    renderPage();
    await screen.findByText('Woven Basket');

    expect(screen.queryByRole('button', { name: /show more products/i })).not.toBeInTheDocument();
  });

  it('appends the next page rather than replacing the list', async () => {
    getStore.mockResolvedValue(store());
    listBySeller
      .mockResolvedValueOnce(paged([product()], 2, 1))
      .mockResolvedValueOnce(paged([product({ id: 'prod-2', name: 'Clay Pot' })], 2, 1));

    renderPage();
    await screen.findByText('Woven Basket');

    await userEvent.click(screen.getByRole('button', { name: /show more products/i }));

    await waitFor(() => expect(screen.getByText('Clay Pot')).toBeInTheDocument());
    expect(screen.getByText('Woven Basket')).toBeInTheDocument();
    expect(listBySeller).toHaveBeenLastCalledWith('seller-user-1', 1, 24);
  });
});
