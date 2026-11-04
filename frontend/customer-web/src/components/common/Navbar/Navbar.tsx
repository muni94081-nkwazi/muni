import { type FormEvent, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useCart } from '@/hooks/useCart';
import { useAppDispatch, useAppSelector } from '@/store/hooks/useAppSelector';
import { openCartDrawer, toggleMobileNav } from '@/store/slices/uiSlice';
import { CategoryNav } from '../CategoryNav/CategoryNav';
import styles from './Navbar.module.css';

export function Navbar() {
  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  const { isAuthenticated, user, isAdmin, logout } = useAuth();
  const { cart } = useCart();
  const [query, setQuery] = useState('');
  const count = cart?.totalUnits ?? 0;

  // Assumes uiSlice's state shape is `{ isMobileNavOpen: boolean }` and that
  // toggleMobileNav() flips it. If your slice names this field differently,
  // update this selector to match.
  const isMobileNavOpen = useAppSelector((state) => state.ui.isMobileNavOpen);

  function closeMobileNav() {
    if (isMobileNavOpen) dispatch(toggleMobileNav());
  }

  /**
   * The only way a shopper can end their session. `logout` clears the stored
   * tokens whether or not auth-service answers — an expired or already-revoked
   * session must still let go on this device — so the navigation afterwards is
   * unconditional rather than in a `.then`.
   */
  async function handleSignOut() {
    try {
      await logout();
    } catch {
      // The logout thunk clears both tokens whether or not auth-service
      // answers, so the session is already gone on this device by the time
      // anything can reject. Swallowing it here keeps a failed revoke from
      // surfacing as an unhandled rejection and, more importantly, from
      // stranding the shopper on a page that thinks they are still signed in.
    } finally {
      closeMobileNav();
      navigate('/');
    }
  }

  function handleSearch(event: FormEvent) {
    event.preventDefault();
    if (query.trim()) {
      navigate(`/products?query=${encodeURIComponent(query.trim())}`);
    }
  }

  return (
    <header className={styles.navbar}>
      {/* ---- Category flyout nav (mega menu) + mobile drawer ---- */}
      <CategoryNav isMobileOpen={isMobileNavOpen} onCloseMobile={closeMobileNav} />

      {/* ---- Top bar ---- */}
      <div className={styles.topBar}>
        <button
          type="button"
          className={styles.menuButton}
          aria-label="Open menu"
          aria-expanded={isMobileNavOpen}
          onClick={() => dispatch(toggleMobileNav())}
        >
          ☰
        </button>

        <Link to="/" className={styles.logo}>
          Muni
          <span className={styles.logoSub}>.ug</span>
        </Link>

        <form className={styles.searchForm} onSubmit={handleSearch} role="search">
          <select className={styles.searchSelect} aria-label="Search category">
            <option>All</option>
            <option>Electronics</option>
            <option>Fashion</option>
            <option>Home</option>
            <option>Groceries</option>
          </select>
          <input
            type="search"
            className={styles.searchInput}
            placeholder="Search for anything..."
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            aria-label="Search products"
          />
          <button type="submit" className={styles.searchButton} aria-label="Search">
            🔍
          </button>
        </form>

        <nav className={styles.topBarNav} aria-label="Account navigation">
          {isAuthenticated ? (
            <Link to="/dashboard" className={styles.navItem}>
              <span className={styles.navItemSub}>Hello, {user?.firstName}</span>
              <span className={styles.navItemMain}>Account & Lists ▾</span>
            </Link>
          ) : (
            <Link to="/login" className={styles.navItem}>
              <span className={styles.navItemSub}>Hello, sign in</span>
              <span className={styles.navItemMain}>Account & Lists ▾</span>
            </Link>
          )}

          {/* Until this existed, a signed-in shopper had no way out: the
              logout thunk and endpoint were both implemented, but nothing in
              the customer UI ever called them — only the admin layout did. */}
          {isAuthenticated && (
            <button
              type="button"
              onClick={handleSignOut}
              className={styles.navItem}
              style={{ background: 'none', border: 'none', cursor: 'pointer', font: 'inherit', textAlign: 'left' }}
            >
              <span className={styles.navItemSub}>Not you?</span>
              <span className={styles.navItemMain}>Sign out</span>
            </button>
          )}

          {isAdmin && (
            <Link to="/admin" className={styles.navItem}>
              <span className={styles.navItemSub}>Seller</span>
              <span className={styles.navItemMain}>Admin Panel</span>
            </Link>
          )}
          <Link to="/orders" className={styles.navItem}>
            <span className={styles.navItemSub}>Returns</span>
            <span className={styles.navItemMain}>&amp; Orders</span>
          </Link>

          <button
            type="button"
            onClick={() => dispatch(openCartDrawer())}
            className={styles.cartButton}
            style={{ background: 'none', cursor: 'pointer', font: 'inherit' }}
            aria-label={`Cart, ${count} item${count === 1 ? '' : 's'}`}
          >
            <span className={styles.cartIcon}>🛒</span>
            {count > 0 && (
              <span className={styles.cartCount}>{count > 99 ? '99+' : count}</span>
            )}
            <span className={styles.cartLabel}>Cart</span>
          </button>
        </nav>
      </div>
    </header>
  );
}
