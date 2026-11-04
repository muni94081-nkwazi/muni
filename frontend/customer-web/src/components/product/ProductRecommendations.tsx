import { useEffect, useState } from 'react';
import { useAppSelector } from '@/store/hooks/useAppSelector';
import { recommendationsApi } from '@/api/recommendations.api';
import type { Product } from '@/types/product.types';
import { productsApi } from '@/api/products.api';
import { ProductCard } from './ProductCard';

interface Props {
  context?: 'home' | 'pdp' | 'cart';
  productId?: string;
  title?: string;
}

export function ProductRecommendations({ context = 'home', productId, title = 'You may also like' }: Props) {
  const user = useAppSelector((state) => state.auth.user);
  const [products, setProducts] = useState<Product[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setIsLoading(true);
      try {
        const recs = productId
          ? await recommendationsApi.getSimilar(productId)
          : await recommendationsApi.getForUser(user?.id, 8, context);

        if (recs.length === 0 || cancelled) return;

        // Fetch product details for each recommended productId
        const details = await Promise.allSettled(
          recs.slice(0, 6).map((r) => productsApi.getById(r.productId))
        );
        const resolved = details
          .filter((r): r is PromiseFulfilledResult<Product> => r.status === 'fulfilled')
          .map((r) => r.value);
        if (!cancelled) setProducts(resolved);
      } catch {
        // non-critical — silently fail
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }
    void load();
    return () => { cancelled = true; };
  }, [context, productId, user?.id]);

  if (!isLoading && products.length === 0) return null;

  return (
    <section style={{ marginTop: 'var(--space-8)' }}>
      <h2 style={{ fontSize: 'var(--text-xl)', fontWeight: 700, marginBottom: 'var(--space-5)' }}>{title}</h2>
      {isLoading ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 'var(--space-4)' }}>
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} style={{ height: 280, background: 'var(--color-surface-alt)', borderRadius: 'var(--radius-md)', animation: 'pulse 1.5s ease-in-out infinite' }} />
          ))}
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 'var(--space-4)' }}>
          {products.map((product) => (
            <ProductCard key={product.id} product={product} />
          ))}
        </div>
      )}
    </section>
  );
}
