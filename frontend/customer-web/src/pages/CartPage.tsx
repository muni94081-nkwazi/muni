import { useNavigate } from 'react-router-dom';
import { useCart } from '@/hooks/useCart';
import { CartList } from '@/components/cart/CartList';
import { CartSummary } from '@/components/cart/CartSummary';
import { Button } from '@/components/common/Button/Button';

export function CartPage() {
  const { cart, isLoading } = useCart();
  const navigate = useNavigate();

  return (
    <div className="container" style={{ paddingBlock: 'var(--space-6)' }}>
      <h1 style={{ fontSize: 'var(--text-2xl)', marginBottom: 'var(--space-5)' }}>Your cart</h1>

      {cart && cart.items.length > 0 ? (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: 'var(--space-6)' }}>
          <div>
            <CartList cart={cart} isLoading={isLoading} />
          </div>
          <div>
            <CartSummary cart={cart} onCheckout={() => navigate('/checkout')} />
          </div>
        </div>
      ) : (
        <div style={{ textAlign: 'center', padding: 'var(--space-10) 0' }}>
          <p style={{ color: 'var(--color-text-secondary)', marginBottom: 'var(--space-5)' }}>
            {isLoading ? 'Loading your cart...' : 'Your cart is empty.'}
          </p>
          {!isLoading && (
            <Button onClick={() => navigate('/products')}>Start shopping</Button>
          )}
        </div>
      )}
    </div>
  );
}
