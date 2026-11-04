import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { useCart } from '@/hooks/useCart';
import { useAppDispatch, useAppSelector } from '@/store/hooks/useAppSelector';
import { closeCartDrawer } from '@/store/slices/uiSlice';
import { formatMoney } from '@/utils/formatters';
import { Button } from '@/components/common/Button/Button';
import { CartItem } from '@/components/cart/CartItem';
import { prefetchCart, prefetchCheckout, prefetchHandlers } from '@/router/prefetch';
import styles from './CartDrawer.module.css';

/**
 * Slide-over cart panel, opened from 'Add to cart' and the header cart icon.
 * Reuses the same CartItem row (qty +/-, subtotal) as the full /cart page —
 * this is just a different container for the same live cart state.
 */
export function CartDrawer() {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const isOpen = useAppSelector((state) => state.ui.isCartDrawerOpen);
  const { cart } = useCart();

  function close() {
    dispatch(closeCartDrawer());
  }

  useEffect(() => {
    if (!isOpen) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') close();
    }

    document.addEventListener('keydown', handleKeyDown);
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = '';
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  if (!isOpen) return null;

  const items = cart?.items ?? [];
  const currency = cart?.currency ?? 'UGX';

  function goTo(path: string) {
    close();
    navigate(path);
  }

  return createPortal(
    <div className={styles.overlay} onClick={close} role="presentation">
      <div
        className={styles.panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby="cart-drawer-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className={styles.header}>
          <h2 id="cart-drawer-title" className={styles.title}>
            Your cart {cart && cart.itemCount > 0 ? `(${cart.itemCount})` : ''}
          </h2>
          <button type="button" className={styles.closeButton} onClick={close} aria-label="Close cart">
            ×
          </button>
        </div>

        {items.length === 0 ? (
          <div className={styles.empty}>
            <p>Your cart is empty.</p>
            <Button variant="outline" onClick={() => goTo('/products')}>
              Browse products
            </Button>
          </div>
        ) : (
          <>
            <div className={styles.body}>
              {items.map((item) => (
                <CartItem key={item.id} item={item} currency={currency} />
              ))}
            </div>

            <div className={styles.footer}>
              <div className={styles.subtotalRow}>
                <span>Subtotal</span>
                <span className="price-tag" style={{ fontSize: 'var(--text-lg)' }}>
                  {formatMoney(cart?.subtotal ?? 0, currency)}
                </span>
              </div>
              <Button
                fullWidth
                size="lg"
                onClick={() => goTo('/checkout')}
                {...prefetchHandlers(prefetchCheckout)}
                disabled={cart?.hasUnavailableItems}
              >
                Proceed to checkout
              </Button>
              <Button variant="outline" fullWidth onClick={() => goTo('/cart')} {...prefetchHandlers(prefetchCart)}>
                View full cart
              </Button>
            </div>
          </>
        )}
      </div>
    </div>,
    document.body,
  );
}
