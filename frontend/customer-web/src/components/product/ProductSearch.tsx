import { useEffect, useState, type FormEvent } from 'react';
import { useDebounce } from '@/hooks/useDebounce';
import { Input } from '@/components/common/Input/Input';

export interface ProductSearchProps {
  initialQuery?: string;
  onSearch: (query: string) => void;
}

/** Standalone search box (distinct from Navbar's, which navigates to
 * /products?query=...) — used inline on the product listing page so
 * search-as-you-type can update results without a full navigation. */
export function ProductSearch({ initialQuery = '', onSearch }: ProductSearchProps) {
  const [query, setQuery] = useState(initialQuery);
  const debouncedQuery = useDebounce(query, 400);

  useEffect(() => {
    onSearch(debouncedQuery);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedQuery]);

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    onSearch(query);
  }

  return (
    <form onSubmit={handleSubmit} role="search">
      <Input
        type="search"
        placeholder="Search products..."
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        aria-label="Search products"
      />
    </form>
  );
}
