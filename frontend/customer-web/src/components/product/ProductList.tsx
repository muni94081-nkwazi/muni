import type { Product } from '@/types/product.types';
import { ProductCard } from './ProductCard';
import { LoadingState } from '@/components/common/LoadingState';
import styles from './ProductList.module.css';

export interface ProductListProps {
  products: Product[];
  isLoading?: boolean;
  emptyMessage?: string;
}

export function ProductList({ products, isLoading, emptyMessage = 'No products found.' }: ProductListProps) {
  if (isLoading) {
    return <LoadingState label="Loading products" />;
  }

  if (products.length === 0) {
    return (
      <p style={{ textAlign: 'center', padding: 'var(--space-10)', color: 'var(--color-text-secondary)' }}>
        {emptyMessage}
      </p>
    );
  }

  return (
    <div className={styles.grid}>
      {products.map((product, index) => (
        // The first tile is the LCP candidate on a product-led page, so its
        // image loads eagerly; the rest stay lazy.
        <ProductCard key={product.id} product={product} priority={index === 0} />
      ))}
    </div>
  );
}
