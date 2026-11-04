import { useCategories } from '@/hooks/useProducts';
import type { ProductFilters } from '@/types/product.types';

export interface ProductFilterProps {
  filters: ProductFilters;
  onChange: (next: Partial<ProductFilters>) => void;
}

const sortOptions: Array<{ value: ProductFilters['sortBy']; label: string }> = [
  { value: 'relevance', label: 'Relevance' },
  { value: 'newest', label: 'Newest' },
  { value: 'price_asc', label: 'Price: low to high' },
  { value: 'price_desc', label: 'Price: high to low' },
  { value: 'rating', label: 'Top rated' },
];

export function ProductFilter({ filters, onChange }: ProductFilterProps) {
  const { categories } = useCategories();

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' }}>
      <div>
        <h3 style={{ fontSize: 'var(--text-sm)', fontWeight: 700, marginBottom: 'var(--space-2)' }}>Category</h3>
        <ul style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)' }}>
          <li>
            <button
              onClick={() => onChange({ categoryId: undefined })}
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                padding: 'var(--space-1) 0',
                fontWeight: !filters.categoryId ? 700 : 400,
                color: !filters.categoryId ? 'var(--color-market-green)' : 'var(--color-text-primary)',
              }}
            >
              All categories
            </button>
          </li>
          {categories.map((category) => (
            <li key={category.id}>
              <button
                onClick={() => onChange({ categoryId: category.id })}
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  padding: 'var(--space-1) 0',
                  fontWeight: filters.categoryId === category.id ? 700 : 400,
                  color: filters.categoryId === category.id ? 'var(--color-market-green)' : 'var(--color-text-primary)',
                }}
              >
                {category.name}
              </button>
            </li>
          ))}
        </ul>
      </div>

      <div>
        <h3 style={{ fontSize: 'var(--text-sm)', fontWeight: 700, marginBottom: 'var(--space-2)' }}>Price range</h3>
        <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
          <input
            type="number"
            placeholder="Min"
            value={filters.minPrice ?? ''}
            onChange={(event) => onChange({ minPrice: event.target.value ? Number(event.target.value) : undefined })}
            style={{ width: '50%', padding: 'var(--space-2)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)' }}
          />
          <input
            type="number"
            placeholder="Max"
            value={filters.maxPrice ?? ''}
            onChange={(event) => onChange({ maxPrice: event.target.value ? Number(event.target.value) : undefined })}
            style={{ width: '50%', padding: 'var(--space-2)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)' }}
          />
        </div>
      </div>

      <div>
        <h3 style={{ fontSize: 'var(--text-sm)', fontWeight: 700, marginBottom: 'var(--space-2)' }}>Sort by</h3>
        <select
          value={filters.sortBy ?? 'relevance'}
          onChange={(event) => onChange({ sortBy: event.target.value as ProductFilters['sortBy'] })}
          style={{ width: '100%', padding: 'var(--space-2)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)' }}
        >
          {sortOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
