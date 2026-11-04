import type { CartItem as CartItemType } from '@/types/cart.types';
import { formatMoney } from '@/utils/formatters';
import { useCart } from '@/hooks/useCart';
import { handleImageError } from '@/utils/imageFallback';
import { OptimizedImage } from '@/components/common/OptimizedImage/OptimizedImage';
import styles from './CartItem.module.css';

export interface CartItemProps {
  item: CartItemType;
  currency: string;
}

export function CartItem({ item, currency }: CartItemProps) {
  const { updateQuantity, removeItem, isItemPending } = useCart();

  // Scoped to this row. Previously this was the cart-wide `isLoading`, so
  // changing quantity on any row disabled the +/- buttons on all of them —
  // which also silently dropped the common "tap + three times quickly" gesture,
  // since taps 2 and 3 landed on a disabled button.
  const isPending = isItemPending(item.id);

  const maxQuantity = item.stockSnapshot ?? 99;

  return (
    <div className={styles.row}>
      {item.productImageUrl ? (
        <OptimizedImage
          src={item.productImageUrl}
          alt={item.productName}
          width={72}
          height={72}
          sizes="72px"
          onError={handleImageError}
          className={styles.image}
        />
      ) : (
        <div className={styles.image} />
      )}

      <div>
        <p className={styles.name}>{item.productName}</p>
        {!item.isAvailable && <p className={styles.warning}>No longer available</p>}
        {item.exceedsAvailableStock && item.isAvailable && (
          <p className={styles.warning}>Only {item.stockSnapshot} left — reduce quantity</p>
        )}
        <div className={styles.quantityRow}>
          <button
            type="button"
            className={styles.qtyButton}
            onClick={() => updateQuantity(item.id, item.quantity - 1)}
            disabled={item.quantity <= 1 || isPending}
            aria-label="Decrease quantity"
          >
            −
          </button>
          <span className={styles.qtyValue}>{item.quantity}</span>
          <button
            type="button"
            className={styles.qtyButton}
            onClick={() => updateQuantity(item.id, item.quantity + 1)}
            disabled={item.quantity >= maxQuantity || isPending}
            aria-label="Increase quantity"
          >
            +
          </button>
        </div>
      </div>

      <div className={styles.right}>
        <span className="price-tag">{formatMoney(item.lineTotal, currency)}</span>
        <button type="button" className={styles.removeButton} onClick={() => removeItem(item.id)}>
          Remove
        </button>
      </div>
    </div>
  );
}
