import { useSearchParams } from 'react-router-dom';
import { useProducts } from '@/hooks/useProducts';
import { ProductList } from '@/components/product/ProductList';
import { ProductFilter } from '@/components/product/ProductFilter';
import type { ProductFilters } from '@/types/product.types';

export function ProductListPage() {
  const [searchParams, setSearchParams] = useSearchParams();

  const initialFilters: ProductFilters = {
    query: searchParams.get('query') ?? undefined,
    categoryId: searchParams.get('categoryId') ?? undefined,
    minPrice: searchParams.get('minPrice') ? Number(searchParams.get('minPrice')) : undefined,
    maxPrice: searchParams.get('maxPrice') ? Number(searchParams.get('maxPrice')) : undefined,
    sortBy: (searchParams.get('sortBy') as ProductFilters['sortBy']) ?? undefined,
  };

  const { products, isLoading, filters, updateFilters } = useProducts(initialFilters);

  function handleFilterChange(next: Partial<ProductFilters>) {
    updateFilters(next);
    const params = new URLSearchParams(searchParams);
    Object.entries(next).forEach(([key, value]) => {
      if (value === undefined || value === '') {
        params.delete(key);
      } else {
        params.set(key, String(value));
      }
    });
    setSearchParams(params);
  }

  return (
    <div className="container" style={{ paddingBlock: 'var(--space-6)' }}>
      <h1 style={{ fontSize: 'var(--text-2xl)', marginBottom: 'var(--space-5)' }}>
        {filters.query ? `Results for "${filters.query}"` : 'All products'}
      </h1>

      <div style={{ display: 'grid', gridTemplateColumns: '220px 1fr', gap: 'var(--space-6)' }}>
        <aside>
          <ProductFilter filters={filters} onChange={handleFilterChange} />
        </aside>
        <div>
          <ProductList products={products} isLoading={isLoading} />
        </div>
      </div>
    </div>
  );
}
