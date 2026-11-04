import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { formatMoney } from '@/utils/formatters';
import { handleImageError } from '@/utils/imageFallback';
import { OptimizedImage } from '@/components/common/OptimizedImage/OptimizedImage';
import { useAuth } from '@/hooks/useAuth';
import { wishlistApi, type Wishlist, type WishlistItem } from '@/api/wishlist.api';

// ─── Saved wishlist ───────────────────────────────────────────────────────────
//
// This page used to hold its items in `useState<WishlistItem[]>([])` with no API
// module, no store slice and no fetch — so it rendered an empty wishlist for
// everyone, forever, and "remove" only edited local state. wishlist-service and
// its seven tables were live the whole time; nothing on the website talked to
// them.
//
// It now reads the signed-in customer's real list. Identity is never sent from
// here: the gateway stamps it from the JWT and the service scopes every query
// to it, so there is nothing on this page that could ask for someone else's
// wishlist.
//
// Fields the backend does not return are not displayed. The old mock rendered a
// stock badge and an "Add to cart" button from invented data; the real contract
// carries no stock information, so claiming "In Stock" here would be a guess
// shown to a shopper as fact.

/** A saved price above the current one is a genuine drop, so show it. */
function priceDropPercent(item: WishlistItem): number {
  if (!item.priceAtAdd || item.priceAtAdd <= item.currentPrice) return 0;
  return Math.round(((item.priceAtAdd - item.currentPrice) / item.priceAtAdd) * 100);
}

function savedOn(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString();
}

const panel = {
  textAlign: 'center' as const,
  padding: 'var(--space-12)',
  background: 'var(--color-surface)',
  borderRadius: 'var(--radius-lg)',
  border: '1px solid var(--color-border)',
};

export function WishlistPage() {
  const { isAuthenticated } = useAuth();

  const [wishlist, setWishlist] = useState<Wishlist | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notification, setNotification] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);

  const showNotification = (msg: string) => {
    setNotification(msg);
    setTimeout(() => setNotification(null), 3000);
  };

  const load = useCallback(async () => {
    if (!isAuthenticated) { setLoading(false); return; }
    setLoading(true);
    setError(null);
    try {
      const lists = await wishlistApi.list();
      // The service models several named lists; the storefront shows the first,
      // and null simply means this customer has not saved anything yet.
      setWishlist(lists[0] ?? null);
    } catch (err) {
      const status = (err as { status?: number; response?: { status?: number } }).status
        ?? (err as { response?: { status?: number } }).response?.status;
      setError(
        status === 401
          ? 'Your session has expired. Please sign in again to see your saved items.'
          : 'We could not load your wishlist just now. Please try again.',
      );
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated]);

  useEffect(() => { void load(); }, [load]);

  const removeItem = async (item: WishlistItem) => {
    if (!wishlist || removingId) return;
    setRemovingId(item.id);
    try {
      // The service returns the updated wishlist, so the list re-renders from
      // the server's answer rather than from an optimistic guess.
      setWishlist(await wishlistApi.removeItem(wishlist.id, item.id));
      showNotification(`${item.productName} removed from your wishlist.`);
    } catch (err) {
      const status = (err as { status?: number; response?: { status?: number } }).status
        ?? (err as { response?: { status?: number } }).response?.status;
      setError(
        status === 401
          ? 'Your session has expired. Please sign in again.'
          : 'That item could not be removed. Please try again.',
      );
    } finally {
      setRemovingId(null);
    }
  };

  const items = wishlist?.items ?? [];

  return (
    <div style={{ paddingBottom: 'var(--space-8)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-6)' }}>
        <div>
          <h1 style={{ fontSize: 'var(--text-2xl)', fontWeight: 800, color: 'var(--color-text-primary)' }}>My Saved Wishlist</h1>
          <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)', marginTop: 'var(--space-1)' }}>
            Track price drops and save your favorite items for later
          </p>
        </div>
        {isAuthenticated && !loading && !error && (
          <span style={{ background: '#e0f2fe', color: '#0369a1', padding: '6px 14px', borderRadius: '20px', fontSize: 'var(--text-xs)', fontWeight: 600 }}>
            {items.length} {items.length === 1 ? 'Item' : 'Items'} Saved
          </span>
        )}
      </div>

      {notification && (
        <div style={{ background: '#dcfce7', border: '1px solid #86efac', color: '#166534', padding: '12px 16px', borderRadius: 'var(--radius-md)', marginBottom: 'var(--space-4)', fontSize: 'var(--text-sm)' }}>
          ✓ {notification}
        </div>
      )}

      {/* Signed out. The wishlist is personal data, so there is nothing to show
          — but this is a browsing page, so it invites a sign-in instead of
          redirecting away from the storefront. */}
      {!isAuthenticated ? (
        <div style={panel}>
          <h3 style={{ fontSize: 'var(--text-lg)', marginBottom: 'var(--space-2)' }}>Sign in to see your wishlist</h3>
          <p style={{ color: 'var(--color-text-secondary)', marginBottom: 'var(--space-4)' }}>
            Your saved items are kept with your MUNI account, so they follow you between devices.
          </p>
          <Link to="/login" style={{ padding: '10px 24px', background: 'var(--color-primary)', color: '#fff', borderRadius: 'var(--radius-md)', textDecoration: 'none', fontWeight: 600 }}>
            Sign in
          </Link>
        </div>
      ) : loading ? (
        <div style={panel}>
          <p style={{ color: 'var(--color-text-secondary)' }}>Loading your saved items…</p>
        </div>
      ) : error ? (
        <div style={panel}>
          <h3 style={{ fontSize: 'var(--text-lg)', marginBottom: 'var(--space-2)' }}>We hit a problem</h3>
          <p role="alert" style={{ color: 'var(--color-text-secondary)', marginBottom: 'var(--space-4)' }}>{error}</p>
          <button
            onClick={() => void load()}
            style={{ padding: '10px 24px', background: 'var(--color-primary)', color: '#fff', border: 'none', borderRadius: 'var(--radius-md)', fontWeight: 600, cursor: 'pointer' }}
          >
            Try again
          </button>
        </div>
      ) : items.length === 0 ? (
        <div style={panel}>
          <h3 style={{ fontSize: 'var(--text-lg)', marginBottom: 'var(--space-2)' }}>Your wishlist is empty</h3>
          <p style={{ color: 'var(--color-text-secondary)', marginBottom: 'var(--space-4)' }}>
            Explore products and click the heart icon to save items for later.
          </p>
          <Link to="/products" style={{ padding: '10px 24px', background: 'var(--color-primary)', color: '#fff', borderRadius: 'var(--radius-md)', textDecoration: 'none', fontWeight: 600 }}>
            Start Shopping
          </Link>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 'var(--space-4)' }}>
          {items.map((item) => {
            const drop = priceDropPercent(item);
            return (
              <div
                key={item.id}
                style={{
                  background: 'var(--color-surface)',
                  border: '1px solid var(--color-border)',
                  borderRadius: 'var(--radius-lg)',
                  overflow: 'hidden',
                  display: 'flex',
                  flexDirection: 'column',
                  boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
                  position: 'relative',
                  opacity: removingId === item.id ? 0.5 : 1,
                }}
              >
                {drop > 0 && (
                  <div style={{ position: 'absolute', top: 12, left: 12, background: '#ef4444', color: '#fff', fontSize: 'var(--text-xs)', fontWeight: 700, padding: '4px 10px', borderRadius: '12px' }}>
                    🔥 {drop}% PRICE DROP
                  </div>
                )}

                <OptimizedImage
                  src={item.productImage}
                  alt={item.productName}
                  width={260}
                  height={180}
                  sizes="(max-width: 768px) 50vw, 260px"
                  onError={handleImageError}
                  style={{ width: '100%', height: 180, objectFit: 'cover' }}
                />

                <div style={{ padding: 'var(--space-4)', flex: 1, display: 'flex', flexDirection: 'column' }}>
                  <Link
                    to={`/products/${item.productId}`}
                    style={{ fontSize: 'var(--text-sm)', fontWeight: 700, color: 'var(--color-text-primary)', textDecoration: 'none', marginBottom: 'var(--space-2)', lineHeight: 1.4 }}
                  >
                    {item.productName}
                  </Link>

                  <div style={{ marginTop: 'auto' }}>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 'var(--space-2)', marginBottom: 'var(--space-2)' }}>
                      <span style={{ fontSize: 'var(--text-lg)', fontWeight: 800, color: 'var(--color-primary)' }}>
                        {formatMoney(item.currentPrice)}
                      </span>
                      {drop > 0 && (
                        <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)', textDecoration: 'line-through' }}>
                          {formatMoney(item.priceAtAdd)}
                        </span>
                      )}
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', marginBottom: 'var(--space-3)' }}>
                      <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)' }}>
                        Saved {savedOn(item.addedAt)}
                      </span>
                    </div>

                    <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
                      <Link
                        to={`/products/${item.productId}`}
                        style={{ flex: 1, padding: '8px 12px', background: 'var(--color-primary)', color: '#fff', borderRadius: 'var(--radius-md)', fontSize: 'var(--text-xs)', fontWeight: 700, textAlign: 'center', textDecoration: 'none' }}
                      >
                        View product
                      </Link>
                      <button
                        onClick={() => void removeItem(item)}
                        disabled={removingId === item.id}
                        aria-label={`Remove ${item.productName} from wishlist`}
                        style={{
                          padding: '8px 12px',
                          background: 'transparent',
                          border: '1px solid var(--color-border)',
                          borderRadius: 'var(--radius-md)',
                          fontSize: 'var(--text-xs)',
                          fontWeight: 600,
                          color: 'var(--color-text-secondary)',
                          cursor: removingId === item.id ? 'default' : 'pointer',
                        }}
                      >
                        {removingId === item.id ? 'Removing…' : 'Remove'}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
