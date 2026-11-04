import { describe, expect, it, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders, signedIn, signedOut } from '@/test-utils/renderWithProviders';

// ─── Wishlist page ────────────────────────────────────────────────────────────
//
// This page shipped as `useState<WishlistItem[]>([])` with no API module and no
// fetch, so it rendered an empty wishlist for every customer forever and its
// "remove" button only edited local state. wishlist-service and its seven
// tables were live the whole time.
//
// These assertions cover what the page must now do: read the signed-in
// customer's real list, render what the backend actually returns, remove
// through the API, and say something useful when there is nothing to show, the
// session has expired, or the call failed.

const list = vi.fn();
const removeItem = vi.fn();

vi.mock('@/api/wishlist.api', () => ({
  wishlistApi: {
    list: (...a: unknown[]) => list(...a),
    removeItem: (...a: unknown[]) => removeItem(...a),
    create: vi.fn(),
    addItem: vi.fn(),
  },
  resolveDefaultWishlist: vi.fn(),
  DEFAULT_WISHLIST_NAME: 'My Wishlist',
}));

const { WishlistPage } = await import('../WishlistPage');

function item(overrides: Record<string, unknown> = {}) {
  return {
    id: 'item-1',
    productId: 'prod-1',
    productName: 'Kampala Coffee Press',
    productImage: 'https://example.test/press.jpg',
    price: 45000,
    addedAt: '2026-09-01T10:00:00.000Z',
    priceAtAdd: 45000,
    currentPrice: 45000,
    ...overrides,
  };
}

function wishlist(items: ReturnType<typeof item>[]) {
  return [{
    id: 'wl-1', userId: 'user-1', name: 'My Wishlist', isPublic: false,
    items, createdAt: '2026-09-01T10:00:00.000Z', updatedAt: '2026-09-01T10:00:00.000Z',
  }];
}

beforeEach(() => {
  list.mockReset();
  removeItem.mockReset();
});

describe('a signed-in customer sees their real wishlist', () => {
  it('loads from the API and renders the returned product', async () => {
    list.mockResolvedValue(wishlist([item()]));

    renderWithProviders(<WishlistPage />, { preloadedState: signedIn() });

    expect(await screen.findByText('Kampala Coffee Press')).toBeInTheDocument();
    expect(list).toHaveBeenCalledTimes(1);
  });

  it('shows a loading state before the list arrives', async () => {
    list.mockReturnValue(new Promise(() => { /* never settles */ }));

    renderWithProviders(<WishlistPage />, { preloadedState: signedIn() });

    expect(await screen.findByText(/loading your saved items/i)).toBeInTheDocument();
  });

  it('counts the saved items', async () => {
    list.mockResolvedValue(wishlist([item(), item({ id: 'item-2', productName: 'Second' })]));

    renderWithProviders(<WishlistPage />, { preloadedState: signedIn() });

    expect(await screen.findByText('2 Items Saved')).toBeInTheDocument();
  });

  it('shows a price drop when the saved price was higher', async () => {
    list.mockResolvedValue(wishlist([item({ priceAtAdd: 50000, currentPrice: 40000 })]));

    renderWithProviders(<WishlistPage />, { preloadedState: signedIn() });

    expect(await screen.findByText(/20% PRICE DROP/)).toBeInTheDocument();
  });

  it('does not invent a stock badge the backend never sent', async () => {
    list.mockResolvedValue(wishlist([item()]));

    renderWithProviders(<WishlistPage />, { preloadedState: signedIn() });
    await screen.findByText('Kampala Coffee Press');

    expect(screen.queryByText(/in stock/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/out of stock/i)).not.toBeInTheDocument();
  });
});

describe('removing an item goes through the API', () => {
  it('calls removeItem and drops the row from the list', async () => {
    list.mockResolvedValue(wishlist([item()]));
    removeItem.mockResolvedValue({
      id: 'wl-1', userId: 'user-1', name: 'My Wishlist', isPublic: false,
      items: [], createdAt: '', updatedAt: '',
    });

    renderWithProviders(<WishlistPage />, { preloadedState: signedIn() });
    await screen.findByText('Kampala Coffee Press');

    await userEvent.click(screen.getByRole('button', { name: /remove kampala coffee press/i }));

    await waitFor(() => expect(removeItem).toHaveBeenCalledWith('wl-1', 'item-1'));
    // Re-rendered from the server's answer, not an optimistic guess.
    await waitFor(() => expect(screen.queryByText('Kampala Coffee Press')).not.toBeInTheDocument());
    expect(await screen.findByText(/your wishlist is empty/i)).toBeInTheDocument();
  });

  it('reports a failed removal instead of pretending it worked', async () => {
    list.mockResolvedValue(wishlist([item()]));
    removeItem.mockRejectedValue({ response: { status: 500 } });

    renderWithProviders(<WishlistPage />, { preloadedState: signedIn() });
    await screen.findByText('Kampala Coffee Press');

    await userEvent.click(screen.getByRole('button', { name: /remove kampala coffee press/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/could not be removed/i);
  });
});

describe('the states a real wishlist has to handle', () => {
  it('renders an empty state with a route back to shopping', async () => {
    list.mockResolvedValue([]);

    renderWithProviders(<WishlistPage />, { preloadedState: signedIn() });

    expect(await screen.findByText(/your wishlist is empty/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /start shopping/i })).toHaveAttribute('href', '/products');
  });

  it('renders an error state with a retry when the API fails', async () => {
    list.mockRejectedValue({ response: { status: 500 } });

    renderWithProviders(<WishlistPage />, { preloadedState: signedIn() });

    expect(await screen.findByRole('alert')).toHaveTextContent(/could not load your wishlist/i);
    expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument();
  });

  it('retries the fetch when the retry button is pressed', async () => {
    list.mockRejectedValueOnce({ response: { status: 500 } })
        .mockResolvedValueOnce(wishlist([item()]));

    renderWithProviders(<WishlistPage />, { preloadedState: signedIn() });
    await screen.findByRole('alert');

    await userEvent.click(screen.getByRole('button', { name: /try again/i }));

    expect(await screen.findByText('Kampala Coffee Press')).toBeInTheDocument();
  });

  it('explains an expired session rather than showing an empty wishlist', async () => {
    list.mockRejectedValue({ response: { status: 401 } });

    renderWithProviders(<WishlistPage />, { preloadedState: signedIn() });

    expect(await screen.findByRole('alert')).toHaveTextContent(/session has expired/i);
  });
});

describe('a signed-out visitor', () => {
  it('is invited to sign in and no request is made', async () => {
    renderWithProviders(<WishlistPage />, { preloadedState: signedOut() });

    expect(await screen.findByText(/sign in to see your wishlist/i)).toBeInTheDocument();
    // A wishlist is personal data; there is nothing to ask the server for.
    expect(list).not.toHaveBeenCalled();
  });

  it('stays on the storefront rather than redirecting away', async () => {
    renderWithProviders(<WishlistPage />, { preloadedState: signedOut() });

    // The heading is still the wishlist page — this is a browsing surface.
    expect(await screen.findByRole('heading', { name: /my saved wishlist/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /sign in/i })).toHaveAttribute('href', '/login');
  });
});
