import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { productsApi } from '@/api/products.api';
import { apiClient } from '@/api/axios.config';
import type { PaginatedResponse } from '@/types/api.types';
import type { Category, Product } from '@/types/product.types';
import { ProductList } from '@/components/product/ProductList';
import { DynamicContainer, type ContainerData } from '@/components/home/DynamicContainer';
import { OptimizedImage } from '@/components/common/OptimizedImage/OptimizedImage';
import { handleImageError, IMAGE_FALLBACK_SRC } from '@/utils/imageFallback';
import { useCurrency } from '@/hooks/useCurrency';
import { useMediaQuery, REDUCED_MOTION_QUERY } from '@/hooks/useMediaQuery';
import styles from './HomePage.module.css';

// ─── How much of the catalogue this page asks for ─────────────────────────────
//
// Every section is now its own server-side query, so these are real page sizes
// rather than slices of one over-fetched list. Product-service caps `limit` at
// 100 and trending at 20.
const TOP_PICKS_LIMIT = 8;
const NEW_ARRIVALS_LIMIT = 8;
/** How many real categories get their own row. */
const DEPARTMENT_SECTIONS = 4;
const DEPARTMENT_LIMIT = 6;
const PROMO_TILE_ITEMS = 4;

/**
 * The product's first usable image.
 *
 * `imageUrls` is what product-service sends — formatProduct maps the `images`
 * column onto it, falling back to the cheapest variant's images. This used to
 * check `images`, `imageUrl`, `thumbnailUrl` and `image` and not `imageUrls`,
 * so it missed the only field that is ever populated and every product on this
 * page rendered a placeholder.
 *
 * `images` is still read as a second choice because the Product type declares
 * it as ProductImage[]; a caller that has enriched a product keeps working.
 */
export function getProductImage(product: Product): string {
  return firstImageUrl(product.imageUrls) ?? firstImageUrl(product.images) ?? IMAGE_FALLBACK_SRC;
}

function firstImageUrl(value: unknown): string | undefined {
  if (typeof value === 'string') return value || undefined;
  if (!Array.isArray(value)) return undefined;
  for (const entry of value) {
    if (typeof entry === 'string' && entry) return entry;
    if (entry && typeof entry === 'object') {
      const url = (entry as { url?: unknown }).url;
      if (typeof url === 'string' && url) return url;
    }
  }
  return undefined;
}

/**
 * The product detail route is `/products/:slug`, and it resolves through
 * fetchProductBySlug → GET /products/slug/:slug. A product id in that position
 * is looked up as a slug and 404s, which is what every hero chip and promo
 * thumbnail on this page used to do.
 */
export function productPath(product: Pick<Product, 'slug'>): string {
  return `/products/${product.slug}`;
}

/** Same product twice in one row is a duplicate card and a duplicate React key. */
export function dedupeById<T extends { id: string }>(products: T[]): T[] {
  const seen = new Set<string>();
  return products.filter((product) => {
    if (seen.has(product.id)) return false;
    seen.add(product.id);
    return true;
  });
}

/**
 * Genuinely discounted products, best discount first.
 *
 * A deal is a product whose seller set a compareAtPrice above the price being
 * charged — the only discount evidence the product contract carries. This
 * section used to be `sort by price ascending`, which made the eight cheapest
 * items in the catalogue "Today's Deals" whether or not anything was reduced.
 *
 * product-service has no discount filter (ListProductsSchema has no such
 * field), so this is derived from the products the page has already loaded
 * rather than from a query. When nothing is discounted it returns nothing, and
 * the tile says so.
 */
export function selectDeals(products: Product[], limit: number): Product[] {
  return dedupeById(products.filter(isDiscounted))
    .sort((a, b) => discountPercent(b) - discountPercent(a))
    .slice(0, limit);
}

function isDiscounted(product: Product): boolean {
  return typeof product.compareAtPrice === 'number' && product.compareAtPrice > product.price;
}

export function discountPercent(product: Product): number {
  if (!isDiscounted(product)) return 0;
  return Math.round(((product.compareAtPrice! - product.price) / product.compareAtPrice!) * 100);
}

// ─── Hero ─────────────────────────────────────────────────────────────────────
//
// No banner artwork. The three slides used to load 1600x600 images from
// placehold.co — an external service on the critical path of the page's largest
// element, showing grey "Account Perks" mock-ups in production. MUNI has no
// banner asset (public/assets holds logos and favicons only), and inventing a
// marketing image to fill the space would be worse than not having one, so each
// slide is a flat brand gradient behind real copy. The headline is then the LCP
// element: text, which needs no network at all.
//
// Every claim below is one the app can keep: the payment rails named are the
// ones payment-service implements, and no discount, delivery or stock promise
// is made here.
const HERO_BANNERS = [
  {
    id: 1,
    background: 'linear-gradient(120deg, #131921 0%, #232f3e 60%, #37475a 100%)',
    textColor: '#ffffff',
    ctaBg: 'var(--color-accent-yellow, #febd69)',
    ctaColor: '#111111',
    headline: 'Get more with a Muni account',
    sub: 'Track orders, save what you like, and pay with MTN Mobile Money or Airtel Money.',
    cta: 'Sign in',
    href: '/login',
    productSource: 'trending' as const,
  },
  {
    id: 2,
    background: 'linear-gradient(120deg, #06342a 0%, #0d5c4a 60%, #157f66 100%)',
    textColor: '#ffffff',
    ctaBg: '#ffffff',
    ctaColor: '#111111',
    headline: 'Shop the marketplace',
    sub: 'Browse listings from sellers across Uganda, delivered to your door.',
    cta: 'Browse products',
    href: '/products',
    productSource: 'trending' as const,
  },
  {
    id: 3,
    background: 'linear-gradient(120deg, #2a0810 0%, #7a1f2b 60%, #a8323f 100%)',
    textColor: '#ffffff',
    ctaBg: '#ffffff',
    ctaColor: '#111111',
    headline: 'Just landed',
    sub: 'The newest listings on MUNI, straight from the sellers who added them.',
    cta: 'Shop new arrivals',
    href: '/products?sortBy=newest',
    productSource: 'newArrivals' as const,
  },
];

const HERO_INTERVAL_MS = 5000;

/**
 * The hero's dominant image: one real listing, shown large.
 *
 * This replaces a row of two 84px chips that sat in the corner of the slide.
 * The brief asked for a hero the image leads, and the only honest source of
 * imagery here is the catalogue itself — so the visual is a product a seller
 * actually uploaded, captioned with its real name and its real price, and it
 * links through to that product. No stock photography, no invented banner.
 */
/**
 * The hero's visual half.
 *
 * The slot is ALWAYS rendered, so the hero keeps its two-part composition
 * whether or not the catalogue has anything in it. Only the contents vary:
 *
 *   • a real listing  → its own photograph, captioned with its real name and
 *     real price, linking through to that product;
 *   • nothing yet     → a brand-treated empty panel.
 *
 * The empty panel is deliberately not a product. There is no banner artwork in
 * this repository and no stock imagery is introduced, so inventing a product,
 * a price or a photograph to fill the space is the one thing this must not do
 * — an empty marketplace that looks stocked is a lie told at the top of the
 * page. What it shows instead is the MUNI wordmark and nothing else, and the
 * moment a seller's listing exists the same slot renders it.
 */
function HeroVisualSlot({ product, textColor }: { product?: Product; textColor: string }) {
  const { format: formatPrice } = useCurrency();

  if (!product) {
    return (
      <div className={styles.heroVisual} aria-hidden="true">
        <div className={`${styles.heroVisualFrame} ${styles.heroVisualEmpty}`}>
          <span className={styles.heroVisualMark} style={{ color: textColor }}>
            Muni<span className={styles.heroVisualMarkDot}>.</span>
          </span>
        </div>
      </div>
    );
  }

  return (
    <Link
      to={productPath(product)}
      className={styles.heroVisual}
      // The caption repeats both, so the image itself adds nothing for a
      // screen reader; the accessible name comes from the caption text.
      aria-label={`${product.name}, ${formatPrice(product.price, product.currency)}`}
    >
      <div className={styles.heroVisualFrame}>
        <OptimizedImage
          src={getProductImage(product)}
          alt=""
          width={480}
          height={480}
          // The hero image is the largest thing on the page above the fold.
          priority
          sizes="(max-width: 700px) 60vw, 480px"
          onError={handleImageError}
          className={styles.heroVisualImage}
        />
        <span className={styles.heroVisualCaption}>
          <span className={styles.heroVisualName}>{product.name}</span>
          <span className={styles.heroVisualPrice}>
            {formatPrice(product.price, product.currency)}
          </span>
        </span>
      </div>
    </Link>
  );
}

function ChevronIcon({ direction, size = 16 }: { direction: 'left' | 'right'; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d={direction === 'left' ? 'M10 3l-5 5 5 5' : 'M6 3l5 5-5 5'}
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function PauseIcon({ paused }: { paused: boolean }) {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
      {paused ? <path d="M4 3l9 5-9 5z" /> : <path d="M4.5 3h2.5v10H4.5zM9 3h2.5v10H9z" />}
    </svg>
  );
}

function PromoTile({
  title,
  href,
  products,
  isLoading,
  emptyMessage,
}: {
  title: string;
  href: string;
  products: Product[];
  isLoading: boolean;
  /** Shown instead of thumbnails when there is honestly nothing to show. */
  emptyMessage: string;
}) {
  const items = products.slice(0, PROMO_TILE_ITEMS);

  return (
    <div style={{
      background: 'var(--color-surface)',
      borderRadius: 'var(--radius-md)',
      padding: 'var(--space-4)',
      boxShadow: 'var(--shadow-card)',
      display: 'flex',
      flexDirection: 'column',
      gap: 'var(--space-3)',
      flex: 1,
      minWidth: 200,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h3 style={{ fontSize: 'var(--text-base)', fontWeight: 700, color: 'var(--color-text-primary)' }}>
          {title}
        </h3>
        <Link
          to={href}
          style={{ fontSize: 'var(--text-sm)', color: 'var(--color-interactive)', fontWeight: 600, textDecoration: 'none' }}
        >
          See all →
        </Link>
      </div>

      {!isLoading && items.length === 0 ? (
        <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-muted)', margin: 0 }}>
          {emptyMessage}
        </p>
      ) : (
        <div style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: 'var(--space-2)',
        }}>
          {isLoading && items.length === 0
            ? Array.from({ length: PROMO_TILE_ITEMS }).map((_, i) => (
                <div
                  key={i}
                  style={{
                    aspectRatio: '1 / 1',
                    borderRadius: 'var(--radius-sm)',
                    background: 'var(--color-surface-muted)',
                  }}
                />
              ))
            : items.map((product) => (
                <Link
                  key={product.id}
                  to={productPath(product)}
                  title={product.name}
                  style={{
                    display: 'block',
                    aspectRatio: '1 / 1',
                    borderRadius: 'var(--radius-sm)',
                    overflow: 'hidden',
                    border: '1px solid var(--color-border-light)',
                    transition: 'border-color var(--duration-fast)',
                  }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLElement).style.borderColor = 'var(--color-primary)';
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLElement).style.borderColor = 'var(--color-border-light)';
                  }}
                >
                  <OptimizedImage
                    src={getProductImage(product)}
                    alt={product.name}
                    width={160}
                    height={160}
                    sizes="(max-width: 768px) 25vw, 160px"
                    onError={handleImageError}
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  />
                </Link>
              ))}
        </div>
      )}
    </div>
  );
}

/** One real category and the products product-service returned for it. */
interface DepartmentSection {
  category: Category;
  products: Product[];
}

function SectionCard({ title, href, children }: { title: string; href: string; children: React.ReactNode }) {
  return (
    <section className="container" style={{ paddingBottom: 'var(--space-6)' }}>
      <div style={{
        background: 'var(--color-surface)',
        borderRadius: 'var(--radius-md)',
        padding: 'var(--space-5)',
        boxShadow: 'var(--shadow-card)',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-4)' }}>
          <h2 style={{ fontSize: 'var(--text-xl)', fontWeight: 700 }}>{title}</h2>
          <Link to={href} style={{ fontSize: 'var(--text-sm)', color: 'var(--color-interactive)', fontWeight: 600 }}>
            See all →
          </Link>
        </div>
        {children}
      </div>
    </section>
  );
}

export function HomePage() {
  const [trending, setTrending] = useState<Product[]>([]);
  const [newArrivals, setNewArrivals] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [departments, setDepartments] = useState<DepartmentSection[]>([]);
  const [dynamicContainers, setDynamicContainers] = useState<ContainerData[]>([]);
  const [heroIndex, setHeroIndex] = useState(0);
  const [heroPaused, setHeroPaused] = useState(false);
  const [heroStopped, setHeroStopped] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  /** Every catalogue request answered, and there are simply no products. */
  const [catalogueEmpty, setCatalogueEmpty] = useState(false);

  const prefersReducedMotion = useMediaQuery(REDUCED_MOTION_QUERY);

  useEffect(() => {
    const emptyPage: PaginatedResponse<Product> = {
      data: [],
      meta: { current_page: 0, last_page: 0, total: 0 },
    };

    // Each call is caught individually so one failing endpoint (or the whole
    // backend being down) degrades to an empty section instead of rejecting
    // the entire Promise.all — that previously surfaced as an unhandled
    // "Uncaught (in promise) ApiError" with nothing on screen ever loading.
    //
    // `settled` keeps *why* a section is empty, which the value alone cannot
    // say. Collapsing a rejection to `emptyPage` and then inferring trouble
    // from "everything came back empty" got both directions wrong: it blamed
    // the customer's connection for a catalogue that was simply empty, and it
    // stayed silent when product-service was down but categories still
    // answered — the more common failure, shown as an empty grid with no
    // explanation at all.
    const settled = <T,>(promise: Promise<T>, fallback: T) =>
      promise.then(
        (value) => ({ ok: true as const, value }),
        () => ({ ok: false as const, value: fallback }),
      );

    Promise.all([
      settled(productsApi.trending(TOP_PICKS_LIMIT), emptyPage),
      // Actually the newest products, ordered by the server. This used to be an
      // unsorted page of the whole catalogue called `newArrivals`, which was
      // then filtered four different ways in the browser to stand in for four
      // departments.
      settled(productsApi.list({ sort: 'newest', limit: NEW_ARRIVALS_LIMIT }), emptyPage),
      settled(productsApi.getCategories(), [] as Category[]),
      // Relative path through `apiClient` (baseURL '/api/v1'), NOT a hardcoded
      // 'http://localhost:8080/...' fetch — an absolute URL here would bypass
      // the Vite dev proxy and hit the backend directly, cross-origin.
      settled(
        apiClient.get('/containers').then((res) => (res.data?.success ? res.data.data : [])),
        [] as ContainerData[],
      ),
    ])
      .then(([trendingRes, newRes, categoriesRes, containersRes]) => {
        setTrending(dedupeById(trendingRes.value.data));
        setNewArrivals(dedupeById(newRes.value.data));
        setCategories(categoriesRes.value.slice(0, 8));
        setDynamicContainers(containersRes.value);

        // Only the catalogue requests decide the banner. Containers are
        // promotional furniture — their absence is not a broken catalogue, and
        // it should not raise an alarm about one.
        const catalogueFailures = [trendingRes, newRes, categoriesRes].filter((r) => !r.ok).length;

        if (catalogueFailures === 3) {
          setLoadError("Can't reach the MUNI catalog right now. Check your connection and try again.");
        } else if (catalogueFailures > 0) {
          // A working categories response must not hide a product-service
          // failure. Partial is its own state: some of the page is real, some
          // of it is missing, and the reader needs to know which.
          setLoadError('Some of the catalog could not be loaded. Parts of this page may be missing.');
        } else {
          // Everything answered. Empty is then a fact about the catalogue, not
          // a symptom, and it gets said plainly rather than dressed up as a
          // connection problem.
          setLoadError(null);
        }

        setCatalogueEmpty(
          trendingRes.ok && newRes.ok &&
          trendingRes.value.data.length === 0 &&
          newRes.value.data.length === 0,
        );
      })
      .finally(() => setIsLoading(false));
  }, []);

  // Department rows, one server-side query per real category.
  //
  // Deliberately a second pass rather than part of the health check above: the
  // categories have to come back before there is anything to ask for, and a
  // department that fails is one missing row, not evidence about the catalogue
  // as a whole. Folding these into `settled` would let a single empty
  // department change the page-level message.
  useEffect(() => {
    if (categories.length === 0) {
      setDepartments([]);
      return;
    }

    let cancelled = false;
    const picked = categories.slice(0, DEPARTMENT_SECTIONS);

    void Promise.all(
      picked.map((category) =>
        productsApi
          // Slug, not id: listProducts resolves either, and a slug keeps the
          // request readable in the network log.
          .list({ category: category.slug, limit: DEPARTMENT_LIMIT })
          .then((response) => ({ category, products: dedupeById(response.data) }))
          .catch(() => ({ category, products: [] as Product[] })),
      ),
    ).then((rows) => {
      if (cancelled) return;
      // A department with nothing in it is not a section worth a heading.
      setDepartments(rows.filter((row) => row.products.length > 0));
    });

    return () => {
      cancelled = true;
    };
  }, [categories]);

  // The carousel advances on its own, so it must be stoppable — and must not
  // start at all for a reader who asked for reduced motion. `heroStopped` is
  // the explicit control; `heroPaused` is hover/focus.
  const heroAutoplay = !prefersReducedMotion && !heroPaused && !heroStopped;

  useEffect(() => {
    if (!heroAutoplay) return;
    const timer = setInterval(() => setHeroIndex((i) => (i + 1) % HERO_BANNERS.length), HERO_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [heroAutoplay]);

  function prevSlide() {
    setHeroIndex((i) => (i - 1 + HERO_BANNERS.length) % HERO_BANNERS.length);
  }

  function nextSlide() {
    setHeroIndex((i) => (i + 1) % HERO_BANNERS.length);
  }

  // Discounts are read off the products already on the page; there is no
  // server-side deal query to ask instead (see selectDeals).
  const deals = useMemo(
    () => selectDeals([...trending, ...newArrivals, ...departments.flatMap((d) => d.products)], PROMO_TILE_ITEMS),
    [trending, newArrivals, departments],
  );

  /**
   * The largest genuine discount on the page, or 0.
   *
   * The strip used to read "Save up to 40% on featured items" as static copy,
   * with nothing in the data behind the number. It now states the real figure,
   * and says nothing at all when there is nothing reduced.
   */
  const bestDiscount = deals.length > 0 ? discountPercent(deals[0]) : 0;

  const promoSources: Record<'trending' | 'newArrivals', Product[]> = {
    trending,
    newArrivals,
  };

  const hero = HERO_BANNERS[heroIndex];
  // One listing carries the slide. `[0]` is the top trending / newest item
  // from the same response the grids below render, so nothing extra is fetched.
  const heroProduct = promoSources[hero.productSource][0];

  return (
    <div style={{ background: 'var(--color-surface-muted)' }}>
      {loadError && (
        <div
          role="alert"
          className="container"
          style={{
            marginTop: 'var(--space-4)',
            padding: 'var(--space-3) var(--space-4)',
            background: 'var(--color-warning-surface, #FFF4E5)',
            border: '1px solid var(--color-warning-border, #F0B429)',
            borderRadius: 'var(--radius-md, 8px)',
            color: 'var(--color-warning-text, #7A4E00)',
          }}
        >
          {loadError}
        </div>
      )}

      {/* Everything loaded and the catalogue is genuinely empty. Neutral, not
          an alert: nothing is broken, there is just nothing to sell yet. */}
      {!loadError && !isLoading && catalogueEmpty && (
        <div
          role="status"
          className="container"
          style={{
            marginTop: 'var(--space-4)',
            padding: 'var(--space-3) var(--space-4)',
            background: 'var(--color-surface)',
            border: '1px solid var(--color-border-light)',
            borderRadius: 'var(--radius-md, 8px)',
            color: 'var(--color-text-secondary)',
          }}
        >
          No products are available yet. Please check back soon.
        </div>
      )}

      <section className="container" style={{ paddingTop: 'var(--space-4)' }}>
        <div
          aria-roledescription="carousel"
          aria-label="MUNI highlights"
          // Hover and keyboard focus both hold the slide still, so a reader is
          // never carried away from something they are pointing at or tabbing
          // through.
          onMouseEnter={() => setHeroPaused(true)}
          onMouseLeave={() => setHeroPaused(false)}
          onFocusCapture={() => setHeroPaused(true)}
          onBlurCapture={() => setHeroPaused(false)}
          className={styles.hero}
          style={{ background: hero.background }}
        >
          <div className={styles.heroInner}>
            <div className={styles.heroCopy} style={{ color: hero.textColor }}>
              <h2 className={styles.heroHeadline}>{hero.headline}</h2>
              <p className={styles.heroSub}>{hero.sub}</p>
              <Link
                to={hero.href}
                className={styles.heroCta}
                style={{ background: hero.ctaBg, color: hero.ctaColor }}
              >
                {hero.cta}
              </Link>
            </div>

            {/* Always present, so the composition does not collapse to a
                text banner on an empty catalogue. */}
            <HeroVisualSlot product={heroProduct} textColor={hero.textColor} />
          </div>

          <button
            onClick={prevSlide}
            aria-label="Previous slide"
            className={`${styles.heroControl} ${styles.heroControlPrev}`}
          >
            <ChevronIcon direction="left" />
          </button>
          <button
            onClick={nextSlide}
            aria-label="Next slide"
            className={`${styles.heroControl} ${styles.heroControlNext}`}
          >
            <ChevronIcon direction="right" />
          </button>
        </div>

        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 6, paddingTop: 'var(--space-3)' }}>
          {HERO_BANNERS.map((banner, i) => (
            <button
              key={banner.id}
              onClick={() => setHeroIndex(i)}
              aria-label={`Slide ${i + 1}: ${banner.headline}`}
              // Marks which slide is showing for anyone who cannot see which
              // dot is filled.
              aria-current={i === heroIndex ? 'true' : undefined}
              style={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                border: '1.5px solid var(--color-text-secondary, #717171)',
                background: i === heroIndex ? 'var(--color-text-secondary, #717171)' : 'transparent',
                padding: 0,
                cursor: 'pointer',
                transition: 'background 0.25s',
              }}
            />
          ))}

          {/* Only meaningful while something is moving — a reader with reduced
              motion has no rotation to stop. */}
          {!prefersReducedMotion && (
            <button
              onClick={() => setHeroStopped((stopped) => !stopped)}
              aria-label={heroStopped ? 'Start automatic slide rotation' : 'Stop automatic slide rotation'}
              style={{
                marginLeft: 'var(--space-2)',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: 22,
                height: 22,
                borderRadius: '50%',
                border: '1.5px solid var(--color-text-secondary, #717171)',
                background: 'transparent',
                color: 'var(--color-text-secondary, #717171)',
                padding: 0,
                cursor: 'pointer',
              }}
            >
              <PauseIcon paused={heroStopped} />
            </button>
          )}
        </div>
      </section>

      <section className="container" style={{ paddingBlock: 'var(--space-6)' }}>
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: 'var(--space-4)',
        }}>
          <PromoTile
            title="Trending now"
            href="/products"
            products={trending}
            isLoading={isLoading}
            emptyMessage="Nothing trending yet."
          />
          <PromoTile
            title="Today's Deals"
            href="/products?sortBy=price_asc"
            products={deals}
            isLoading={isLoading}
            emptyMessage="No discounted items right now."
          />
          <PromoTile
            title="New arrivals"
            href="/products?sortBy=newest"
            products={newArrivals}
            isLoading={isLoading}
            emptyMessage="No new listings yet."
          />
        </div>
      </section>

      {/*
        The "on sale" strip.

        This card used to also carry three promotional badges — Mobile Money,
        Easy Returns, Secure checkout — which have been removed from the
        homepage. Only their tiles are gone: MTN MoMo and Airtel Money are
        still the rails payment-service implements, /returns is still routed
        and still states the published policy, and checkout still encrypts
        payment details. None of that was ever implemented here; this was
        advertising for it.

        The section is now conditional on there being a real discount, because
        with the badges gone there is nothing else in it — and an empty surface
        card with padding and a shadow is worse than no section at all.
      */}
      {bestDiscount > 0 && (
        <section className="container" style={{ paddingBottom: 'var(--space-5)' }}>
          <div style={{
            background: 'var(--color-surface)',
            borderRadius: 'var(--radius-md)',
            padding: 'var(--space-4) var(--space-5)',
            boxShadow: 'var(--shadow-card)',
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--space-5)',
            flexWrap: 'wrap',
          }}>
            <div>
              <div style={{ fontSize: 'var(--text-xs)', fontWeight: 700, color: 'var(--color-primary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                On sale now
              </div>
              <div style={{ fontSize: 'var(--text-xl)', fontWeight: 700, color: 'var(--color-text-primary)' }}>
                Save up to {bestDiscount}% on reduced items
              </div>
            </div>
          </div>
        </section>
      )}

      <SectionCard title="Top Picks" href="/products">
        <ProductList products={trending} isLoading={isLoading} emptyMessage="No top picks available yet." />
      </SectionCard>

      <SectionCard title="New arrivals" href="/products?sortBy=newest">
        <ProductList products={newArrivals} isLoading={isLoading} emptyMessage="No new listings yet." />
      </SectionCard>

      {/* One row per real category, each filled by its own server-side query.
          These used to be five hardcoded department headings — Appliances,
          Fashion, Home & Kitchen, Beauty, Sports — rendering slices of one
          generic product page, so "Appliances" showed whatever the catalogue
          returned and Home & Kitchen showed anything matching either word
          twice. */}
      {departments.map(({ category, products }) => (
        <SectionCard key={category.id} title={category.name} href={`/products?categoryId=${category.id}`}>
          <ProductList products={products} isLoading={false} emptyMessage={`No ${category.name} items available yet.`} />
        </SectionCard>
      ))}

      {/* Admin & Seller Configured Homepage Containers */}
      {dynamicContainers.map((container) => (
        <section key={container.id} className="container">
          <DynamicContainer container={container} />
        </section>
      ))}

      <section className="container" style={{ paddingBottom: 'var(--space-8)' }}>
        <div style={{
          background: 'linear-gradient(135deg, #131921 0%, #232f3e 100%)',
          color: '#fff',
          borderRadius: 'var(--radius-md)',
          padding: 'var(--space-8) var(--space-6)',
          textAlign: 'center',
        }}>
          <h2 style={{ fontSize: 'var(--text-3xl)', fontWeight: 700, marginBottom: 'var(--space-3)' }}>
            Shop Muni on your phone
          </h2>
          <p style={{ opacity: 0.85, marginBottom: 'var(--space-5)', fontSize: 'var(--text-lg)' }}>
            Fast, easy and secure — buy anything across Uganda and pay with MTN MoMo or Airtel Money.
          </p>
          <div style={{ display: 'flex', gap: 'var(--space-3)', justifyContent: 'center', flexWrap: 'wrap' }}>
            <Link
              to="/register"
              style={{
                background: 'var(--color-accent-yellow)',
                color: '#111',
                fontWeight: 700,
                padding: 'var(--space-3) var(--space-6)',
                borderRadius: 'var(--radius-md)',
                textDecoration: 'none',
              }}
            >
              Create a free account
            </Link>
            <Link
              to="/products"
              style={{
                background: 'transparent',
                color: '#fff',
                fontWeight: 600,
                padding: 'var(--space-3) var(--space-6)',
                borderRadius: 'var(--radius-md)',
                border: '1px solid rgba(255,255,255,0.5)',
                textDecoration: 'none',
              }}
            >
              Browse products
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}


