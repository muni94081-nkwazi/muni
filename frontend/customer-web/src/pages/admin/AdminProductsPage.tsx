import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { productsApi } from '@/api/products.api';
import type { Product } from '@/types/product.types';
import { formatMoney, formatDate } from '@/utils/formatters';
import { LoadingState } from '@/components/common/LoadingState';
import { getLocalProductImages, getFallbackProductSvg } from '@/utils/localImageStorage';
import { logger } from '@/utils/logger';
import { OptimizedImage } from '@/components/common/OptimizedImage/OptimizedImage';

// Product has no stored `lowStock` flag — it's derived from stock vs. threshold.
function isLowStock(p: Product): boolean {
  return p.stockQuantity !== undefined && p.stockQuantity > 0 && p.stockQuantity <= (p.lowStockThreshold ?? 0);
}

const STATUS_COLOR: Record<string, { bg: string; text: string }> = {
  ACTIVE:        { bg: '#e8f5e9', text: '#2e7d32' },
  DRAFT:         { bg: '#fff8e1', text: '#f57f17' },
  OUT_OF_STOCK:  { bg: '#ffebee', text: '#b71c1c' },
  DISCONTINUED:  { bg: '#f3e5f5', text: '#4a148c' },
  ARCHIVED:      { bg: '#f5f5f5', text: '#616161' },
};

export function AdminProductsPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [filtered, setFiltered] = useState<Product[]>([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [lastPage, setLastPage] = useState(1);

  useEffect(() => {
    setIsLoading(true);
    productsApi.list({ page, limit: 20 })
      .then((res) => {
        setProducts(res.data);
        setFiltered(res.data);
        setLastPage(res.meta?.last_page ?? 1);
      })
      .catch((err) => logger.error('[AdminProductsPage] Failed to load products:', err))
      .finally(() => setIsLoading(false));
  }, [page]);

  useEffect(() => {
    let result = products;
    if (statusFilter) result = result.filter((p) => p.status === statusFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(
        (p) => p.name.toLowerCase().includes(q) || p.sku?.toLowerCase().includes(q),
      );
    }
    setFiltered(result);
  }, [products, search, statusFilter]);

  if (isLoading) return <LoadingState label="Loading products..." />;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-5)' }}>
        <div>
          <h1 style={{ fontSize: 'var(--text-2xl)', fontWeight: 700 }}>Product Management</h1>
          <p style={{ color: '#666', fontSize: 'var(--text-sm)' }}>{filtered.length} products shown</p>
        </div>
        <Link
          to="/products"
          style={{
            background: 'linear-gradient(to bottom, #f7dfa5, #f0c14b)',
            border: '1px solid #a88734',
            color: '#111',
            fontWeight: 700,
            padding: 'var(--space-2) var(--space-4)',
            borderRadius: 'var(--radius-sm)',
            fontSize: 'var(--text-sm)',
            textDecoration: 'none',
          }}
        >
          + Add New Product
        </Link>
      </div>

      {/* Summary cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 'var(--space-3)', marginBottom: 'var(--space-5)' }}>
        {[
          { label: 'Total Listed', value: products.length, color: '#131921' },
          { label: 'In Stock', value: products.filter((p) => p.inStock).length, color: '#2e7d32' },
          { label: 'Out of Stock', value: products.filter((p) => !p.inStock).length, color: '#b71c1c' },
          { label: 'Low Stock', value: products.filter(isLowStock).length, color: '#e65100' },
        ].map((s) => (
          <div key={s.label} style={{ background: '#fff', border: '1px solid #e0e0e0', borderRadius: 'var(--radius-md)', padding: 'var(--space-4)', textAlign: 'center' }}>
            <div style={{ fontSize: 'var(--text-2xl)', fontWeight: 700, color: s.color }}>{s.value}</div>
            <div style={{ fontSize: 'var(--text-xs)', color: '#888', marginTop: 4 }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div style={{ background: '#fff', border: '1px solid #e0e0e0', borderRadius: 'var(--radius-md)', padding: 'var(--space-4)', marginBottom: 'var(--space-4)', display: 'flex', gap: 'var(--space-3)', flexWrap: 'wrap', alignItems: 'center' }}>
        <input
          type="search"
          placeholder="Search name or SKU..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ padding: 'var(--space-2) var(--space-3)', border: '1px solid #ccc', borderRadius: 'var(--radius-sm)', fontSize: 'var(--text-sm)', minWidth: 220 }}
        />
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          style={{ padding: 'var(--space-2) var(--space-3)', border: '1px solid #ccc', borderRadius: 'var(--radius-sm)', fontSize: 'var(--text-sm)' }}
        >
          <option value="">All statuses</option>
          {Object.keys(STATUS_COLOR).map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <button onClick={() => { setSearch(''); setStatusFilter(''); }} style={{ padding: 'var(--space-2) var(--space-3)', background: '#f0f0f0', border: '1px solid #ccc', borderRadius: 'var(--radius-sm)', cursor: 'pointer', fontSize: 'var(--text-sm)' }}>
          Clear
        </button>
      </div>

      {/* Products table */}
      <div style={{ background: '#fff', border: '1px solid #e0e0e0', borderRadius: 'var(--radius-md)', overflowX: 'auto', boxShadow: '0 1px 3px rgba(0,0,0,0.05)', marginBottom: 'var(--space-4)' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--text-sm)' }}>
          <thead>
            <tr style={{ background: '#f8f9fa', borderBottom: '2px solid #e0e0e0' }}>
              {['Image', 'Name', 'SKU', 'Category', 'Price', 'Stock', 'Rating', 'Status', 'Added', 'Actions'].map((h) => (
                <th key={h} style={{ padding: 'var(--space-3) var(--space-4)', textAlign: 'left', fontWeight: 700, fontSize: 'var(--text-xs)', color: '#555', whiteSpace: 'nowrap' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr><td colSpan={10} style={{ padding: 'var(--space-8)', textAlign: 'center', color: '#999' }}>No products found</td></tr>
            ) : filtered.map((product, i) => {
              const sc = STATUS_COLOR[product.status] ?? { bg: '#f0f0f0', text: '#333' };
              const localImgs = getLocalProductImages(product.id);
              const displayImg = localImgs[0] || product.imageUrls[0] || getFallbackProductSvg(product.name, product.category?.name);

              return (
                <tr key={product.id} style={{ background: i % 2 === 0 ? '#fff' : '#fafafa', borderBottom: '1px solid #f0f0f0' }}>
                  <td style={{ padding: 'var(--space-2) var(--space-4)' }}>
                    <OptimizedImage
                      src={displayImg}
                      alt={product.name}
                      width={44}
                      height={44}
                      sizes="44px"
                      onError={(e) => {
                        (e.target as HTMLImageElement).src = getFallbackProductSvg(product.name);
                      }}
                      style={{ width: 44, height: 44, objectFit: 'cover', borderRadius: 'var(--radius-sm)', border: '1px solid #eee' }}
                    />
                  </td>
                  <td style={{ padding: 'var(--space-2) var(--space-4)', maxWidth: 200 }}>
                    <Link to={`/products/${product.slug}`} style={{ color: '#007185', textDecoration: 'none', fontWeight: 600, fontSize: 'var(--text-sm)' }}>
                      {product.name.length > 45 ? product.name.slice(0, 45) + '…' : product.name}
                    </Link>
                    {product.brand && <div style={{ fontSize: 'var(--text-xs)', color: '#888' }}>{product.brand}</div>}
                    {localImgs.length > 0 && (
                      <span style={{ fontSize: 10, background: '#f0f9ff', color: '#0284c7', padding: '1px 6px', borderRadius: 4, fontWeight: 700 }}>
                        💾 {localImgs.length} Local Img
                      </span>
                    )}
                  </td>
                  <td style={{ padding: 'var(--space-2) var(--space-4)', fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)', color: '#555' }}>{product.sku}</td>
                  <td style={{ padding: 'var(--space-2) var(--space-4)', fontSize: 'var(--text-xs)', color: '#555' }}>{product.category?.name ?? '—'}</td>
                  <td style={{ padding: 'var(--space-2) var(--space-4)', color: '#b12704', fontWeight: 700, whiteSpace: 'nowrap' }}>{formatMoney(product.price, product.currency)}</td>
                  <td style={{ padding: 'var(--space-2) var(--space-4)' }}>
                    <span style={{ color: product.stockQuantity === 0 ? '#b71c1c' : isLowStock(product) ? '#e65100' : '#2e7d32', fontWeight: 700 }}>
                      {product.stockQuantity}
                    </span>
                    {isLowStock(product) && (
                      <span style={{ fontSize: 'var(--text-xs)', color: '#e65100', display: 'block' }}>Low</span>
                    )}
                  </td>
                  <td style={{ padding: 'var(--space-2) var(--space-4)', whiteSpace: 'nowrap' }}>
                    {product.reviewCount > 0 ? (
                      <>
                        <span style={{ color: '#c45500' }}>★</span>
                        <span style={{ fontSize: 'var(--text-xs)', marginLeft: 2 }}>{product.averageRating.toFixed(1)} ({product.reviewCount})</span>
                      </>
                    ) : '—'}
                  </td>
                  <td style={{ padding: 'var(--space-2) var(--space-4)' }}>
                    <span style={{ background: sc.bg, color: sc.text, fontSize: 'var(--text-xs)', fontWeight: 700, padding: '2px 8px', borderRadius: 999 }}>
                      {product.status}
                    </span>
                  </td>
                  <td style={{ padding: 'var(--space-2) var(--space-4)', fontSize: 'var(--text-xs)', color: '#888', whiteSpace: 'nowrap' }}>{formatDate(product.createdAt)}</td>
                  <td style={{ padding: 'var(--space-2) var(--space-4)', whiteSpace: 'nowrap' }}>
                    <Link to={`/products/${product.slug}`} style={{ color: '#007185', fontSize: 'var(--text-xs)', fontWeight: 600, marginRight: 8 }}>View</Link>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div style={{ display: 'flex', justifyContent: 'center', gap: 'var(--space-2)' }}>
        <button disabled={page === 0} onClick={() => setPage((p) => p - 1)} style={{ padding: 'var(--space-2) var(--space-4)', border: '1px solid #ccc', borderRadius: 'var(--radius-sm)', cursor: page === 0 ? 'not-allowed' : 'pointer', opacity: page === 0 ? 0.5 : 1, background: '#fff' }}>
          ← Prev
        </button>
        <span style={{ padding: 'var(--space-2) var(--space-3)', fontSize: 'var(--text-sm)', color: '#555' }}>
          Page {page + 1} of {lastPage}
        </span>
        <button disabled={page + 1 >= lastPage} onClick={() => setPage((p) => p + 1)} style={{ padding: 'var(--space-2) var(--space-4)', border: '1px solid #ccc', borderRadius: 'var(--radius-sm)', cursor: page + 1 >= lastPage ? 'not-allowed' : 'pointer', opacity: page + 1 >= lastPage ? 0.5 : 1, background: '#fff' }}>
          Next →
        </button>
      </div>
    </div>
  );
}
