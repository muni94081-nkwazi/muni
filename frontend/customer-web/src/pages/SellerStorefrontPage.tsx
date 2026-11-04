import { useCallback, useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { OptimizedImage } from '@/components/common/OptimizedImage/OptimizedImage';
import { handleImageError } from '@/utils/imageFallback';
import { ProductCard } from '@/components/product/ProductCard';
import { storefrontApi, type PublicStore } from '@/api/storefront.api';
import { productsApi } from '@/api/products.api';
import type { Product } from '@/types/product.types';

// ─── Public seller storefront ─────────────────────────────────────────────────
//
// This page was entirely fabricated: a hardcoded store called "Kampala Tech
// Official Store" with a 4.9 rating, 14,200 followers, a 99.4% response rate
// and two Unsplash photographs, plus `products` fixed at []. Every seller's
// shop showed the same invented business, and none of them showed a product.
//
// It now reads marketplace-service for the store and product-service for that
// seller's catalogue. Both endpoints are public — a shop window should not
// require a session — and both were already reachable; nothing on the website
// was calling them.
//
// Only fields the backend actually returns are rendered. The old mock's badge
// tier, follower count, response rate and returns policy have no source in the
// API, so they are gone rather than reproduced as decoration. `rating` and
// `reviewCount` are real columns on the store, but a store with no reviews
// genuinely has none, so they are shown only when there is something to show.

const PAGE_SIZE = 24;

type LoadState = 'loading' | 'ready' | 'not-found' | 'error';

const panel: React.CSSProperties = {
  textAlign: 'center',
  padding: 'var(--space-12)',
  background: 'var(--color-surface)',
  borderRadius: 'var(--radius-lg)',
  border: '1px solid var(--color-border)',
};

function statusOf(err: unknown): number | undefined {
  const e = err as { status?: number; response?: { status?: number } };
  return e.status ?? e.response?.status;
}

export function SellerStorefrontPage() {
  // The route param is historically named sellerId, but the endpoint resolves a
  // slug OR an id, so both /store/<slug> and /store/<id> work.
  const { sellerId: slugOrId } = useParams();

  const [state, setState] = useState<LoadState>('loading');
  const [store, setStore] = useState<PublicStore | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [lastPage, setLastPage] = useState(0);
  const [productsError, setProductsError] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  const load = useCallback(async () => {
    if (!slugOrId) { setState('not-found'); return; }

    setState('loading');
    setProductsError(false);
    try {
      const found = await storefrontApi.getStore(slugOrId);
      setStore(found);
      setState('ready');

      // Products are fetched with the seller id the store record carries, never
      // with the URL parameter — the URL may be a slug, and the ownership link
      // belongs to the database, not the address bar.
      try {
        const res = await productsApi.listBySeller(found.userId, 0, PAGE_SIZE);
        setProducts(res.data);
        setTotal(res.meta.total);
        setLastPage(res.meta.last_page);
        setPage(0);
      } catch {
        // A catalogue that will not load must not hide the shop itself.
        setProductsError(true);
      }
    } catch (err) {
      setState(statusOf(err) === 404 ? 'not-found' : 'error');
    }
  }, [slugOrId]);

  useEffect(() => { void load(); }, [load]);

  const loadMore = async () => {
    if (!store || loadingMore || page >= lastPage) return;
    setLoadingMore(true);
    try {
      const next = page + 1;
      const res = await productsApi.listBySeller(store.userId, next, PAGE_SIZE);
      setProducts((prev) => [...prev, ...res.data]);
      setPage(next);
      setLastPage(res.meta.last_page);
    } catch {
      setProductsError(true);
    } finally {
      setLoadingMore(false);
    }
  };

  if (state === 'loading') {
    return <div style={{ paddingBottom: 'var(--space-8)' }}><div style={panel}><p style={{ color: 'var(--color-text-secondary)' }}>Loading store…</p></div></div>;
  }

  if (state === 'not-found') {
    return (
      <div style={{ paddingBottom: 'var(--space-8)' }}>
        <div style={panel}>
          <h2 style={{ fontSize: 'var(--text-xl)', marginBottom: 'var(--space-2)' }}>Store not found</h2>
          <p style={{ color: 'var(--color-text-secondary)', marginBottom: 'var(--space-4)' }}>
            This store does not exist, or is not currently trading on MUNI.
          </p>
          <Link to="/products" style={{ padding: '10px 24px', background: 'var(--color-primary)', color: '#fff', borderRadius: 'var(--radius-md)', textDecoration: 'none', fontWeight: 600 }}>
            Browse all products
          </Link>
        </div>
      </div>
    );
  }

  if (state === 'error' || !store) {
    return (
      <div style={{ paddingBottom: 'var(--space-8)' }}>
        <div style={panel}>
          <h2 style={{ fontSize: 'var(--text-xl)', marginBottom: 'var(--space-2)' }}>We hit a problem</h2>
          <p role="alert" style={{ color: 'var(--color-text-secondary)', marginBottom: 'var(--space-4)' }}>
            This store could not be loaded just now. Please try again.
          </p>
          <button
            onClick={() => void load()}
            style={{ padding: '10px 24px', background: 'var(--color-primary)', color: '#fff', border: 'none', borderRadius: 'var(--radius-md)', fontWeight: 600, cursor: 'pointer' }}
          >
            Try again
          </button>
        </div>
      </div>
    );
  }

  const place = [store.location?.city, store.location?.country].filter(Boolean).join(', ');
  const joined = (() => {
    const d = new Date(store.joinedAt);
    return Number.isNaN(d.getTime()) ? null : d.getFullYear();
  })();

  return (
    <div style={{ paddingBottom: 'var(--space-8)' }}>
      {/* Banner. Only rendered when the store actually has one — the old page
          fell back to a stock photograph of someone else's shop. */}
      {store.banner && (
        <div style={{ height: 220, borderRadius: 'var(--radius-lg)', overflow: 'hidden', marginBottom: 'var(--space-4)' }}>
          <OptimizedImage
            src={store.banner} alt={`${store.storeName} banner`}
            width={1200} height={220} sizes="100vw" onError={handleImageError}
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          />
        </div>
      )}

      <div style={{
        display: 'flex', flexWrap: 'wrap', gap: 'var(--space-4)', alignItems: 'center',
        background: 'var(--color-surface)', border: '1px solid var(--color-border)',
        borderRadius: 'var(--radius-lg)', padding: 'var(--space-4)', marginBottom: 'var(--space-6)',
      }}>
        {store.logo && (
          <OptimizedImage
            src={store.logo} alt={`${store.storeName} logo`}
            width={72} height={72} sizes="72px" onError={handleImageError}
            style={{ width: 72, height: 72, borderRadius: 'var(--radius-md)', objectFit: 'cover' }}
          />
        )}

        <div style={{ flex: '1 1 260px', minWidth: 0 }}>
          <h1 style={{ fontSize: 'var(--text-2xl)', fontWeight: 800, color: 'var(--color-text-primary)' }}>
            {store.storeName}
          </h1>
          {store.description && (
            <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)', marginTop: 'var(--space-1)' }}>
              {store.description}
            </p>
          )}

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-4)', marginTop: 'var(--space-3)', fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)' }}>
            {/* Shown only when the backend has a figure to show — an unrated
                store is not dressed up with stars it has not earned. */}
            {store.reviewCount > 0 && (
              <span>★ {store.rating.toFixed(1)} ({store.reviewCount.toLocaleString()} reviews)</span>
            )}
            {store.totalSales > 0 && <span>{store.totalSales.toLocaleString()} sales</span>}
            {place && <span>{place}</span>}
            {joined && <span>On MUNI since {joined}</span>}
            {store.verificationStatus === 'verified' && (
              <span style={{ color: 'var(--color-success, #2f7a4d)', fontWeight: 700 }}>✓ Verified seller</span>
            )}
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 'var(--space-4)' }}>
        <h2 style={{ fontSize: 'var(--text-xl)', fontWeight: 700 }}>Products</h2>
        {!productsError && total > 0 && (
          <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)' }}>
            {total.toLocaleString()} {total === 1 ? 'item' : 'items'}
          </span>
        )}
      </div>

      {productsError ? (
        <div style={panel}>
          <p role="alert" style={{ color: 'var(--color-text-secondary)', marginBottom: 'var(--space-4)' }}>
            We could not load this store’s products. Please try again.
          </p>
          <button
            onClick={() => void load()}
            style={{ padding: '10px 24px', background: 'var(--color-primary)', color: '#fff', border: 'none', borderRadius: 'var(--radius-md)', fontWeight: 600, cursor: 'pointer' }}
          >
            Try again
          </button>
        </div>
      ) : products.length === 0 ? (
        <div style={panel}>
          <h3 style={{ fontSize: 'var(--text-lg)', marginBottom: 'var(--space-2)' }}>No products yet</h3>
          <p style={{ color: 'var(--color-text-secondary)', marginBottom: 'var(--space-4)' }}>
            This seller has not listed anything for sale at the moment.
          </p>
          <Link to="/products" style={{ padding: '10px 24px', background: 'var(--color-primary)', color: '#fff', borderRadius: 'var(--radius-md)', textDecoration: 'none', fontWeight: 600 }}>
            Browse all products
          </Link>
        </div>
      ) : (
        <>
          {/* The shared card, so storefront products get the same behaviour as
              the rest of the catalogue — including its existing add-to-cart. */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 'var(--space-4)' }}>
            {products.map((product) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </div>

          {page < lastPage && (
            <div style={{ textAlign: 'center', marginTop: 'var(--space-6)' }}>
              <button
                onClick={() => void loadMore()}
                disabled={loadingMore}
                style={{ padding: '10px 28px', background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', fontWeight: 600, cursor: loadingMore ? 'default' : 'pointer' }}
              >
                {loadingMore ? 'Loading…' : 'Show more products'}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
