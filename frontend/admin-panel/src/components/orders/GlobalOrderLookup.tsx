import React, { useState } from 'react';
import { SearchBar } from '../common/SearchBar';

interface GlobalOrderLookupProps {
  /** Fires with the trimmed term; the page passes it to the API as `q`. */
  onSearch: (term: string) => void;
  resultCount?: number;
  isLoading?: boolean;
}

/**
 * Cross-cutting order lookup.
 *
 * This now queries the server rather than filtering an array in memory. The old
 * version called itself "global" while only ever filtering the orders already
 * loaded on screen — with real pagination that searches one page of twenty, so
 * any order outside the current page was unfindable.
 *
 * order-service matches `q` exactly against orderNumber or the buyer's userId
 * (see AdminOrderFilters) — an unanchored regex over an unindexed Mongo field
 * would be a collection scan on every keystroke.
 */
export const GlobalOrderLookup: React.FC<GlobalOrderLookupProps> = ({ onSearch, resultCount, isLoading }) => {
  const [term, setTerm] = useState('');

  const handleSearch = (value: string) => {
    setTerm(value);
    onSearch(value.trim());
  };

  return (
    <div style={{
      backgroundColor: 'var(--color-surface)', padding: 'var(--space-4)', borderRadius: 'var(--radius-md)',
      boxShadow: 'var(--shadow-sm)', marginBottom: 'var(--space-4)',
    }}>
      <div style={{ fontSize: '13px', fontWeight: 600, marginBottom: 'var(--space-2)', color: 'var(--color-text-secondary)' }}>
        Global Order Lookup
      </div>
      <SearchBar placeholder="Exact order number or buyer id…" onSearch={handleSearch} />
      {term.trim() && !isLoading && (
        <div style={{ fontSize: '12px', color: 'var(--color-text-secondary)', marginTop: 'var(--space-2)' }}>
          {resultCount ?? 0} order{resultCount === 1 ? '' : 's'} matched "{term.trim()}"
        </div>
      )}
    </div>
  );
};
