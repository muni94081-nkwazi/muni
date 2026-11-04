import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { Provider } from 'react-redux';
import { store } from '@/store';
import type { PaginatedResponse } from '@/types/api.types';
import type { Category, Product } from '@/types/product.types';
import { IMAGE_FALLBACK_SRC } from '@/utils/imageFallback';

// ─── Catalogue doubles ────────────────────────────────────────────────────────
//
// HomePage used to decide it could not reach the backend by checking whether
// every section had come back empty. A rejected request and a legitimately
// empty catalogue were collapsed to the same value before that check ran, so
// the page could not tell them apart. These tests pin the four states it must
// now distinguish, because two of them were previously reported wrongly:
//
//   • an empty catalogue was blamed on the customer's connection;
//   • a product-service failure with categories still answering showed no
//     message at all — the more common outage, silently rendered as an empty
//     grid.

const trending = vi.fn();
const list = vi.fn();
const getCategories = vi.fn();
const apiGet = vi.fn();

vi.mock('@/api/products.api', () => ({
  productsApi: {
    trending: (...args: unknown[]) => trending(...args),
    list: (...args: unknown[]) => list(...args),
    getCategories: (...args: unknown[]) => getCategories(...args),
  },
}));

vi.mock('@/api/axios.config', () => ({
  apiClient: { get: (...args: unknown[]) => apiGet(...args) },
}));

const { HomePage, getProductImage, productPath, dedupeById, selectDeals, discountPercent } =
  await import('./HomePage');

const page = (data: Product[]): PaginatedResponse<Product> => ({
  data,
  meta: { current_page: 0, last_page: 1, total: data.length },
});

const product = (id: string, overrides: Partial<Product> = {}): Product =>
  ({
    id,
    name: `Product ${id}`,
    // A slug that is deliberately nothing like the id: the product detail route
    // resolves by slug, and an id in that position 404s.
    slug: `slug-${id}`,
    price: 1000,
    currency: 'UGX',
    imageUrls: [],
    images: [],
    inStock: true,
    averageRating: 0,
    reviewCount: 0,
    ...overrides,
  }) as unknown as Product;

const category = (id: number): Category =>
  ({ id, name: `Category ${id}`, slug: `cat-${id}` }) as unknown as Category;

/**
 * jsdom implements no matchMedia at all, and the carousel has to ask it whether
 * the reader wants reduced motion. Defaults to "no preference" so the ordinary
 * path is what most tests exercise.
 */
function stubMatchMedia(reducedMotion: boolean) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: reducedMotion && query.includes('prefers-reduced-motion'),
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })) as unknown as typeof window.matchMedia;
}

/** Every product-detail link the page rendered ("see all" links carry a query). */
const productLinks = (): string[] =>
  Array.from(document.querySelectorAll('a[href^="/products/"]'))
    .map((a) => a.getAttribute('href') ?? '')
    .filter((href) => !href.includes('?'));

const renderHome = () =>
  render(
    // The real store: ProductCard and OptimizedImage both read from it, and a
    // stub for each would be more scaffolding than the thing under test.
    <Provider store={store}>
      <MemoryRouter>
        <HomePage />
      </MemoryRouter>
    </Provider>,
  );

const CONNECTION_MESSAGE = /can't reach the MUNI catalog/i;
const PARTIAL_MESSAGE    = /some of the catalog could not be loaded/i;
const EMPTY_MESSAGE      = /no products are available yet/i;

beforeEach(() => {
  vi.clearAllMocks();
  stubMatchMedia(false);
  // Containers are promotional furniture, not catalogue. Resolved by default
  // so each test controls only the thing it is about.
  apiGet.mockResolvedValue({ data: { success: true, data: [] } });
});

describe('HomePage catalogue loading', () => {
  it('reports a connection problem when every catalogue request fails', async () => {
    trending.mockRejectedValue(new Error('network'));
    list.mockRejectedValue(new Error('network'));
    getCategories.mockRejectedValue(new Error('network'));

    renderHome();

    expect(await screen.findByText(CONNECTION_MESSAGE)).toBeInTheDocument();
  });

  it('does not blame the connection when the catalogue is merely empty', async () => {
    // The false positive: every request succeeded, there is just nothing to
    // sell. Telling the customer to check their connection is wrong.
    trending.mockResolvedValue(page([]));
    list.mockResolvedValue(page([]));
    getCategories.mockResolvedValue([]);

    renderHome();

    expect(await screen.findByText(EMPTY_MESSAGE)).toBeInTheDocument();
    expect(screen.queryByText(CONNECTION_MESSAGE)).not.toBeInTheDocument();
  });

  it('surfaces a product-service failure that categories would otherwise mask', async () => {
    // The false negative, and the worse one: the old check required ALL three
    // sections empty, so a working categories response hid the outage
    // completely and the page rendered an empty grid with no explanation.
    trending.mockRejectedValue(new Error('product-service down'));
    list.mockRejectedValue(new Error('product-service down'));
    getCategories.mockResolvedValue([category(1), category(2)]);

    renderHome();

    expect(await screen.findByText(PARTIAL_MESSAGE)).toBeInTheDocument();
    expect(screen.queryByText(CONNECTION_MESSAGE)).not.toBeInTheDocument();
  });

  it('says nothing when the catalogue loads normally', async () => {
    trending.mockResolvedValue(page([product('p1')]));
    list.mockResolvedValue(page([product('p2')]));
    getCategories.mockResolvedValue([category(1)]);

    renderHome();

    await waitFor(() => expect(trending).toHaveBeenCalled());
    await waitFor(() => {
      expect(screen.queryByText(CONNECTION_MESSAGE)).not.toBeInTheDocument();
      expect(screen.queryByText(PARTIAL_MESSAGE)).not.toBeInTheDocument();
      expect(screen.queryByText(EMPTY_MESSAGE)).not.toBeInTheDocument();
    });
  });

  it('reports partial trouble when only categories fail', async () => {
    trending.mockResolvedValue(page([product('p1')]));
    list.mockResolvedValue(page([product('p2')]));
    getCategories.mockRejectedValue(new Error('categories down'));

    renderHome();

    expect(await screen.findByText(PARTIAL_MESSAGE)).toBeInTheDocument();
  });

  it('does not raise a catalogue alarm when only containers fail', async () => {
    // Containers are promotional decoration. Their absence is not a broken
    // catalogue and must not be reported as one.
    trending.mockResolvedValue(page([product('p1')]));
    list.mockResolvedValue(page([product('p2')]));
    getCategories.mockResolvedValue([category(1)]);
    apiGet.mockRejectedValue(new Error('containers down'));

    renderHome();

    await waitFor(() => expect(trending).toHaveBeenCalled());
    await waitFor(() => {
      expect(screen.queryByText(CONNECTION_MESSAGE)).not.toBeInTheDocument();
      expect(screen.queryByText(PARTIAL_MESSAGE)).not.toBeInTheDocument();
    });
  });

  it('shows no empty-catalogue notice while a request is still failing', async () => {
    // "Empty" is only meaningful once the requests that would have filled it
    // actually answered. A failure must not be dressed up as an empty shop.
    trending.mockRejectedValue(new Error('down'));
    list.mockRejectedValue(new Error('down'));
    getCategories.mockResolvedValue([category(1)]);

    renderHome();

    await screen.findByText(PARTIAL_MESSAGE);
    expect(screen.queryByText(EMPTY_MESSAGE)).not.toBeInTheDocument();
  });
});

// ─── Product links ────────────────────────────────────────────────────────────
//
// The detail route is /products/:slug and resolves through fetchProductBySlug →
// GET /products/slug/:slug. Every hero chip and promo thumbnail used to link by
// product id, so the cuid was looked up as a slug and 404'd — fourteen dead
// links above the fold on a fully working catalogue.

describe('HomePage product links', () => {
  it('builds a detail path from the slug, never the id', () => {
    expect(productPath({ slug: 'blue-shirt' })).toBe('/products/blue-shirt');
  });

  it('links hero chips and promo thumbnails by slug', async () => {
    trending.mockResolvedValue(page([product('cuid-1'), product('cuid-2')]));
    list.mockResolvedValue(page([product('cuid-3')]));
    getCategories.mockResolvedValue([]);

    renderHome();

    await waitFor(() => expect(productLinks().length).toBeGreaterThan(0));

    const links = productLinks();
    expect(links).toContain('/products/slug-cuid-1');
    // Every detail link is a slug path; none is a bare id.
    for (const href of links) {
      expect(href).toMatch(/^\/products\/slug-/);
    }
  });
});

// ─── Images ───────────────────────────────────────────────────────────────────
//
// getProductImage checked `images`, `imageUrl`, `thumbnailUrl` and `image`, and
// not `imageUrls` — which is the only one product-service sends. Every product
// on the page therefore fell through to a remote placehold.co placeholder.

describe('HomePage product images', () => {
  it('reads the imageUrls the API actually sends', () => {
    expect(getProductImage(product('a', { imageUrls: ['/media/real-image.jpg'] }))).toBe(
      '/media/real-image.jpg',
    );
  });

  it('still reads an enriched images array when a caller supplies one', () => {
    const enriched = product('a', {
      imageUrls: [],
      images: [{ url: '/media/enriched.jpg' }],
    } as unknown as Partial<Product>);
    expect(getProductImage(enriched)).toBe('/media/enriched.jpg');
  });

  it('falls back to the local placeholder, not a remote one', () => {
    expect(getProductImage(product('a'))).toBe(IMAGE_FALLBACK_SRC);
    expect(IMAGE_FALLBACK_SRC.startsWith('data:image/svg+xml')).toBe(true);
  });

  it('requests no image from an external placeholder service', async () => {
    trending.mockResolvedValue(page([product('p1', { imageUrls: ['/media/real-image.jpg'] })]));
    list.mockResolvedValue(page([product('p2')]));
    getCategories.mockResolvedValue([]);

    renderHome();

    await waitFor(() => expect(productLinks().length).toBeGreaterThan(0));

    const sources = Array.from(document.querySelectorAll('img')).map(
      (img) => img.getAttribute('src') ?? '',
    );
    expect(sources.some((src) => src.includes('/media/real-image.jpg'))).toBe(true);
    expect(sources.some((src) => src.includes('placehold.co'))).toBe(false);
  });
});

// ─── Request contract ─────────────────────────────────────────────────────────
//
// ListProductsSchema names the page size `limit`, and Zod drops unknown keys —
// so the old `size` parameter was discarded in silence and a request for fifty
// products returned the server default of twenty.

describe('HomePage request contract', () => {
  beforeEach(() => {
    trending.mockResolvedValue(page([]));
    list.mockResolvedValue(page([]));
    getCategories.mockResolvedValue([]);
  });

  it('asks the catalogue for a page size by its real name', async () => {
    renderHome();

    await waitFor(() => expect(list).toHaveBeenCalled());

    const query = list.mock.calls[0][0] as Record<string, unknown>;
    expect(query).toMatchObject({ sort: 'newest' });
    expect(typeof query.limit).toBe('number');
    expect(query).not.toHaveProperty('size');
  });

  it('passes trending a limit rather than a dropped page size', async () => {
    renderHome();

    await waitFor(() => expect(trending).toHaveBeenCalled());
    expect(trending).toHaveBeenCalledWith(expect.any(Number));
  });

  it('filters departments server-side by category instead of slicing one page', async () => {
    getCategories.mockResolvedValue([
      { id: 'c1', name: 'Home & Kitchen', slug: 'home-kitchen' } as unknown as Category,
    ]);

    renderHome();

    await waitFor(() =>
      expect(list).toHaveBeenCalledWith(expect.objectContaining({ category: 'home-kitchen' })),
    );
  });
});

// ─── Departments ──────────────────────────────────────────────────────────────

describe('HomePage departments', () => {
  it('renders a product once even when the API repeats it', () => {
    const repeated = [product('a'), product('b'), product('a')];
    expect(dedupeById(repeated).map((p) => p.id)).toEqual(['a', 'b']);
  });

  it('shows no duplicate cards in a Home & Kitchen section', async () => {
    // The old implementation concatenated a 'home' filter with a 'kitchen'
    // filter, so a category matching both words rendered every product twice —
    // duplicate cards and duplicate React keys.
    trending.mockResolvedValue(page([]));
    getCategories.mockResolvedValue([
      { id: 'c1', name: 'Home & Kitchen', slug: 'home-kitchen' } as unknown as Category,
    ]);
    list.mockImplementation((query: { category?: string }) =>
      Promise.resolve(
        query?.category === 'home-kitchen'
          ? page([product('kettle'), product('kettle'), product('pan')])
          : page([]),
      ),
    );

    renderHome();

    await screen.findByRole('heading', { name: 'Home & Kitchen' });
    await waitFor(() => expect(productLinks()).toContain('/products/slug-kettle'));

    const kettleLinks = productLinks().filter((href) => href === '/products/slug-kettle');
    expect(kettleLinks).toHaveLength(1);
  });
});

// ─── Deals ────────────────────────────────────────────────────────────────────
//
// Today's Deals was `sort by price ascending` — the cheapest items in the
// catalogue, discounted or not. A deal is now evidence-based: a compareAtPrice
// above the price being charged, which is the only discount signal the product
// contract carries.

describe('HomePage deals', () => {
  const discounted = product('sale', { price: 800, compareAtPrice: 1000 });
  const deeplyDiscounted = product('bigsale', { price: 500, compareAtPrice: 1000 });
  const cheapButFullPrice = product('cheap', { price: 100 });

  it('selects only genuinely discounted products', () => {
    const deals = selectDeals([cheapButFullPrice, discounted], 4);
    expect(deals.map((p) => p.id)).toEqual(['sale']);
  });

  it('orders by the size of the discount, not the price', () => {
    const deals = selectDeals([discounted, deeplyDiscounted], 4);
    expect(deals.map((p) => p.id)).toEqual(['bigsale', 'sale']);
  });

  it('treats a compareAtPrice at or below the price as no discount', () => {
    expect(selectDeals([product('x', { price: 1000, compareAtPrice: 1000 })], 4)).toEqual([]);
    expect(selectDeals([product('y', { price: 1000, compareAtPrice: 900 })], 4)).toEqual([]);
    expect(discountPercent(product('z', { price: 1000 }))).toBe(0);
  });

  it('says so honestly when nothing is reduced, rather than listing cheap items', async () => {
    trending.mockResolvedValue(page([cheapButFullPrice]));
    list.mockResolvedValue(page([cheapButFullPrice]));
    getCategories.mockResolvedValue([]);

    renderHome();

    expect(await screen.findByText(/no discounted items right now/i)).toBeInTheDocument();
  });

  it('states the real maximum discount and never a hardcoded one', async () => {
    trending.mockResolvedValue(page([deeplyDiscounted]));
    list.mockResolvedValue(page([]));
    getCategories.mockResolvedValue([]);

    renderHome();

    // 500 off 1000 is 50%, computed from the data on the page.
    expect(await screen.findByText(/save up to 50% on reduced items/i)).toBeInTheDocument();
    expect(screen.queryByText(/40%/)).not.toBeInTheDocument();
  });
});

// ─── Claims the app can keep ──────────────────────────────────────────────────

describe('HomePage commercial claims', () => {
  beforeEach(() => {
    trending.mockResolvedValue(page([product('p1')]));
    list.mockResolvedValue(page([product('p2')]));
    getCategories.mockResolvedValue([]);
  });

  it('promises no delivery threshold, because nothing implements one', async () => {
    renderHome();

    await waitFor(() => expect(trending).toHaveBeenCalled());
    expect(screen.queryByText(/UGX 50,000/)).not.toBeInTheDocument();
    expect(screen.queryByText(/free delivery/i)).not.toBeInTheDocument();
  });

  it('makes no unmeasured security claim', async () => {
    renderHome();

    await waitFor(() => expect(trending).toHaveBeenCalled());
    expect(screen.queryByText(/100%/)).not.toBeInTheDocument();
  });

  it('makes no discount claim when nothing on the page is discounted', async () => {
    renderHome();

    await waitFor(() => expect(trending).toHaveBeenCalled());
    expect(screen.queryByText(/save up to/i)).not.toBeInTheDocument();
  });
});

// ─── Calls to action ──────────────────────────────────────────────────────────

describe('HomePage calls to action', () => {
  it('sends the sign-in call to action to the sign-in page, not registration', async () => {
    trending.mockResolvedValue(page([]));
    list.mockResolvedValue(page([]));
    getCategories.mockResolvedValue([]);

    renderHome();

    const signIn = await screen.findByRole('link', { name: 'Sign in' });
    expect(signIn).toHaveAttribute('href', '/login');
  });
});

// ─── Currency ─────────────────────────────────────────────────────────────────

describe('HomePage prices', () => {
  it('formats through the shared currency system rather than hardcoding UGX', async () => {
    // The hero chip used to print `UGX ${price}` whatever the product's own
    // currency was, and whatever market the shopper had selected.
    trending.mockResolvedValue(page([product('p1', { price: 1000, currency: 'KES' })]));
    list.mockResolvedValue(page([]));
    getCategories.mockResolvedValue([]);

    renderHome();

    // The price appears on the hero chip and again on the product card, so
    // this asks for all of them: what matters is that every one says KES and
    // none says UGX, not that the page prints the price exactly once.
    expect((await screen.findAllByText('KES 1,000')).length).toBeGreaterThan(0);
    expect(screen.queryByText('UGX 1,000')).not.toBeInTheDocument();
  });
});

// ─── Carousel accessibility ───────────────────────────────────────────────────

describe('HomePage hero carousel', () => {
  const FIRST_SLIDE = /get more with a muni account/i;

  beforeEach(() => {
    trending.mockResolvedValue(page([]));
    list.mockResolvedValue(page([]));
    getCategories.mockResolvedValue([]);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('marks the showing slide with aria-current', async () => {
    renderHome();

    const dots = await screen.findAllByRole('button', { name: /^Slide \d/ });
    const current = dots.filter((dot) => dot.getAttribute('aria-current') === 'true');
    expect(current).toHaveLength(1);
    expect(dots[0]).toHaveAttribute('aria-current', 'true');
    expect(dots[1]).not.toHaveAttribute('aria-current');
  });

  it('offers a control that stops the automatic rotation', async () => {
    renderHome();

    expect(
      await screen.findByRole('button', { name: /stop automatic slide rotation/i }),
    ).toBeInTheDocument();
  });

  it('does not advance on its own when reduced motion is preferred', async () => {
    stubMatchMedia(true);
    vi.useFakeTimers({ shouldAdvanceTime: true });

    renderHome();

    await screen.findByText(FIRST_SLIDE);
    await act(async () => {
      vi.advanceTimersByTime(30_000);
    });

    expect(screen.getByText(FIRST_SLIDE)).toBeInTheDocument();
    // Nothing is moving, so there is nothing to offer to stop.
    expect(
      screen.queryByRole('button', { name: /automatic slide rotation/i }),
    ).not.toBeInTheDocument();
  });

  it('does advance on its own when motion is allowed', async () => {
    // The companion to the test above: without it, a carousel that never
    // rotated at all would pass the reduced-motion assertion for the wrong
    // reason.
    vi.useFakeTimers({ shouldAdvanceTime: true });

    renderHome();

    await screen.findByText(FIRST_SLIDE);
    await act(async () => {
      vi.advanceTimersByTime(6_000);
    });

    await waitFor(() => expect(screen.queryByText(FIRST_SLIDE)).not.toBeInTheDocument());
  });
});

// ─── Hero visual ──────────────────────────────────────────────────────────────

describe('the hero leads with a real listing', () => {
  it('shows a real product as the hero image, captioned with its own name', async () => {
    trending.mockResolvedValue(
      page([product('p1', { name: 'Nakasero Honey 500g', imageUrls: ['/media/honey.jpg'] })]),
    );
    list.mockResolvedValue(page([]));
    getCategories.mockResolvedValue([]);

    renderHome();

    // There is no banner artwork in this repo; the hero's visual is a listing a
    // seller actually uploaded, so it is attributed rather than decorative.
    // Its accessible name carries the price too, which distinguishes it from
    // the same product's card further down the page.
    const hero = await screen.findByRole('link', { name: /Nakasero Honey 500g, UGX/ });
    expect(hero.getAttribute('href')).toBe('/products/slug-p1');
  });

  it('links the hero visual to that product, not to the slide CTA', async () => {
    trending.mockResolvedValue(page([product('p1', { imageUrls: ['/media/a.jpg'] })]));
    list.mockResolvedValue(page([]));
    getCategories.mockResolvedValue([]);

    renderHome();

    await waitFor(() => expect(productLinks()).toContain('/products/slug-p1'));
  });

  it('renders no hero visual at all when the catalogue is empty', async () => {
    // An empty frame would be worse than none, and there is nothing legitimate
    // to put in it.
    trending.mockResolvedValue(page([]));
    list.mockResolvedValue(page([]));
    getCategories.mockResolvedValue([]);

    renderHome();

    await screen.findByText(EMPTY_MESSAGE);
    expect(productLinks()).toHaveLength(0);
  });

  it('keeps the slide headline and CTA regardless of the visual', async () => {
    trending.mockResolvedValue(page([]));
    list.mockResolvedValue(page([]));
    getCategories.mockResolvedValue([]);

    renderHome();

    // The Account Perks promotion is legitimate existing MUNI content and must
    // survive the redesign.
    expect(await screen.findByText(/Get more with a Muni account/i)).toBeInTheDocument();
    const cta = screen.getByRole('link', { name: /^Sign in$/i });
    // "Sign in" must go to sign-in, not registration.
    expect(cta.getAttribute('href')).toBe('/login');
  });
});

// ─── Hero visual slot ─────────────────────────────────────────────────────────

describe('the hero visual slot', () => {
  it('renders the real listing image in the slot when the catalogue has one', async () => {
    trending.mockResolvedValue(
      page([product('p1', { name: 'Nakasero Honey 500g', imageUrls: ['/media/honey.jpg'] })]),
    );
    list.mockResolvedValue(page([]));
    getCategories.mockResolvedValue([]);

    renderHome();

    const hero = await screen.findByRole('link', { name: /Nakasero Honey 500g, UGX/ });
    const img = hero.querySelector('img');
    expect(img).not.toBeNull();
    // The seller's own upload, not a stand-in.
    expect(img!.getAttribute('src')).toContain('honey.jpg');
  });

  it('holds the slot open with a brand panel when there is nothing to show', async () => {
    trending.mockResolvedValue(page([]));
    list.mockResolvedValue(page([]));
    getCategories.mockResolvedValue([]);

    renderHome();

    // The composition must not collapse to a text banner on an empty
    // catalogue — but the panel is explicitly not a product. It carries the
    // wordmark and nothing else: no caption, no stand-in copy.
    const panel = await screen.findByText('Muni');
    expect(panel).toBeInTheDocument();
    expect(screen.queryByText(/seller listings appear here/i)).not.toBeInTheDocument();
  });

  it('invents no product, price or image for the empty slot', async () => {
    trending.mockResolvedValue(page([]));
    list.mockResolvedValue(page([]));
    getCategories.mockResolvedValue([]);

    renderHome();

    await screen.findByText('Muni');
    const sources = Array.from(document.querySelectorAll('img')).map((i) => i.getAttribute('src') ?? '');
    expect(sources.some((src) => /placehold|unsplash/.test(src))).toBe(false);
    expect(productLinks()).toHaveLength(0);
  });

  it('keeps the Account Perks promotion and its sign-in destination', async () => {
    trending.mockResolvedValue(page([product('p1', { imageUrls: ['/media/a.jpg'] })]));
    list.mockResolvedValue(page([]));
    getCategories.mockResolvedValue([]);

    renderHome();

    expect(await screen.findByText(/Get more with a Muni account/i)).toBeInTheDocument();
    expect(
      screen.getByText(/Track orders, save what you like, and pay with MTN Mobile Money or Airtel Money/i),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /^Sign in$/i }).getAttribute('href')).toBe('/login');
  });
});
