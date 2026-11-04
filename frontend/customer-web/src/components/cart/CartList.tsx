import type { Cart } from '@/types/cart.types';
import { CartItem } from './CartItem';
import { LoadingState } from '@/components/common/LoadingState';

export interface CartListProps {
  cart: Cart | null;
  isLoading: boolean;
}

export function CartList({ cart, isLoading }: CartListProps) {
  if (isLoading && !cart) {
    return <LoadingState label="Loading your cart" />;
  }

  if (!cart || cart.items.length === 0) {
    return (
      <p style={{ color: 'var(--color-text-secondary)', padding: 'var(--space-8) 0', textAlign: 'center' }}>
        Your cart is empty.
      </p>
    );
  }

  return (
    <div>
      {cart.items.map((item) => (
        <CartItem key={item.id} item={item} currency={cart.currency} />
      ))}
    </div>
  );
}
