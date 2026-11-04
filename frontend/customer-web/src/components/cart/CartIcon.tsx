import { useCart } from '@/hooks/useCart';
import { useAppDispatch } from '@/store/hooks/useAppSelector';
import { openCartDrawer } from '@/store/slices/uiSlice';
import styles from '@/components/common/Navbar/Navbar.module.css';

export function CartIcon() {
  const { cart } = useCart();
  const dispatch = useAppDispatch();
  const count = cart?.totalUnits ?? 0;

  return (
    <button
      type="button"
      onClick={() => dispatch(openCartDrawer())}
      className={styles.cartButton}
      style={{ background: 'none', cursor: 'pointer', font: 'inherit' }}
      aria-label={`Cart, ${count} item${count === 1 ? '' : 's'}`}
    >
      🛒
      {count > 0 && <span className={styles.cartBadge}>{count > 99 ? '99+' : count}</span>}
    </button>
  );
}
