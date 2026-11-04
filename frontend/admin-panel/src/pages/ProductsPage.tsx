import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ROUTES } from '@/router/routes';
import { useProducts } from '@/hooks/useProducts';
import type { Product, ProductStatus } from '@/types/product.types';

const TABS: { value: ProductStatus; label: string }[] = [
  { value: 'PENDING_APPROVAL', label: 'Pending review' },
  { value: 'ACTIVE',           label: 'Live' },
  { value: 'REJECTED',         label: 'Rejected' },
  { value: 'DRAFT',            label: 'Drafts' },
  { value: 'ARCHIVED',         label: 'Archived' },
];

const STATUS_COLOR: Record<ProductStatus, string> = {
  PENDING_APPROVAL: '#f59e0b',
  ACTIVE:           '#10b981',
  REJECTED:         '#ef4444',
  DRAFT:            '#94a3b8',
  ARCHIVED:         '#64748b',
  OUT_OF_STOCK:     '#94a3b8',
};

const PAGE_SIZE = 20;

function waitingFor(submittedAt: string | null): string {
  if (!submittedAt) return '—';
  const hours = Math.floor((Date.now() - new Date(submittedAt).getTime()) / 3_600_000);
  if (hours < 1)  return 'just now';
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

export function ProductsPage() {
  const {
    products, counts, total, isLoading, error, moderatingId,
    fetchProducts, fetchCounts, approve, reject, clearError,
  } = useProducts();

  const [status, setStatus] = useState<ProductStatus>('PENDING_APPROVAL');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);

  useEffect(() => {
    const timer = setTimeout(
      () => fetchProducts({ page, status, q: search || undefined }),
      300,
    );
    return () => clearTimeout(timer);
  }, [fetchProducts, page, status, search]);

  useEffect(() => { fetchCounts(); }, [fetchCounts]);

  async function handleApprove(product: Product) {
    await approve(product.id).catch(() => undefined);
    fetchCounts();
  }

  async function handleReject(product: Product) {
        const reason = window.prompt(
      `Why is "${product.name}" being rejected?\n\nThe seller sees this message.`,
    );
    if (!reason || !reason.trim()) return;
    await reject(product.id, reason.trim()).catch(() => undefined);
    fetchCounts();
  }

  const pending = counts.PENDING_APPROVAL ?? 0;

  return (
    <div>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 20,
        }}
      >
        <h1 style={{ fontSize: 24, fontWeight: 700 }}>Product Moderation</h1>
        <Link
          to={ROUTES.PRODUCT_CREATE}
          style={{
            padding: '9px 18px',
            borderRadius: 8,
            background: '#0f172a',
            color: '#fff',
            fontWeight: 600,
            fontSize: 14,
            textDecoration: 'none',
          }}
        >
          Add Product
        </Link>
      </div>

      {pending > 0 && status !== 'PENDING_APPROVAL' && (
        <div style={{ background: '#fef7e0', border: '1px solid #fcd34d', borderRadius: 8, padding: '12px 16px', marginBottom: 16, color: '#b06000', fontSize: 14, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8 }}>
          <span>{pending} product{pending > 1 ? 's' : ''} awaiting review</span>
          <button
            onClick={() => { setStatus('PENDING_APPROVAL'); setPage(1); }}
            style={{ marginLeft: 8, background: 'none', border: '1px solid #b06000', borderRadius: 4, padding: '2px 10px', fontSize: 12, cursor: 'pointer', color: '#b06000' }}
          >
            Open queue
          </button>
        </div>
      )}

      {error && (
        <div style={{ background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: 8, padding: '12px 16px', marginBottom: 16, color: '#991b1b', fontSize: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>{error}</span>
          <button onClick={clearError} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#991b1b', fontSize: 18 }}>
            &times;
          </button>
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        {TABS.map((tab) => (
          <button
            key={tab.value}
            onClick={() => { setStatus(tab.value); setPage(1); }}
            style={{
              padding: '6px 14px', borderRadius: 16, fontSize: 14, cursor: 'pointer',
              border: '1px solid ' + (status === tab.value ? '#3b82f6' : '#e2e8f0'),
              background: status === tab.value ? '#eff6ff' : '#fff',
              color: status === tab.value ? '#1d4ed8' : '#475569',
            }}
          >
            {tab.label}
            {counts[tab.value] !== undefined && (
              <span style={{ marginLeft: 6, opacity: 0.7 }}>({counts[tab.value]})</span>
            )}
          </button>
        ))}
      </div>

      <input
        value={search}
        onChange={(e) => { setSearch(e.target.value); setPage(1); }}
        placeholder="Search products..."
        style={{ padding: '8px 14px', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: 14, width: '100%', maxWidth: 360, marginBottom: 16, boxSizing: 'border-box' }}
      />

      <div style={{ background: '#fff', borderRadius: 8, border: '1px solid #e2e8f0', overflow: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: '#f8fafc', textAlign: 'left' }}>
              {['Product', 'Seller', 'Category', 'Price', 'Waiting', 'Status', 'Actions'].map((header) => (
                <th key={header} style={{ padding: '10px 14px', fontSize: 12, fontWeight: 600, color: '#475569', borderBottom: '1px solid #e2e8f0' }}>
                  {header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr>
                <td colSpan={7} style={{ padding: 24, textAlign: 'center', color: '#64748b' }}>Loading...</td>
              </tr>
            )}

            {!isLoading && products.length === 0 && (
              <tr>
                <td colSpan={7} style={{ padding: 24, textAlign: 'center', color: '#64748b' }}>
                  {status === 'PENDING_APPROVAL'
                    ? 'Nothing waiting for review.'
                    : 'No products with this status.'}
                </td>
              </tr>
            )}

            {!isLoading && products.map((product) => (
              <tr key={product.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                <td style={{ padding: '10px 14px', fontSize: 14 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    {product.imageUrls?.[0] ? (
                      <img src={product.imageUrls[0]} alt="" style={{ width: 40, height: 40, objectFit: 'cover', borderRadius: 4 }} />
                    ) : (
                      <div style={{ width: 40, height: 40, background: '#e2e8f0', borderRadius: 4 }} />
                    )}
                    <div>
                      <div style={{ fontWeight: 500 }}>{product.name}</div>
                      {product.status === 'REJECTED' && product.rejectionReason && (
                        <div style={{ fontSize: 12, color: '#ef4444' }}>{product.rejectionReason}</div>
                      )}
                    </div>
                  </div>
                </td>
                <td style={{ padding: '10px 14px', fontSize: 13, color: '#475569' }}>{product.sellerId}</td>
                <td style={{ padding: '10px 14px', fontSize: 13, color: '#475569' }}>{product.category?.name ?? '—'}</td>
                <td style={{ padding: '10px 14px', fontSize: 13 }}>
                  {product.currency} {Number(product.price ?? 0).toLocaleString()}
                </td>
                <td style={{ padding: '10px 14px', fontSize: 13, color: '#475569' }}>{waitingFor(product.submittedAt)}</td>
                <td style={{ padding: '10px 14px' }}>
                  <span style={{ background: STATUS_COLOR[product.status] + '22', color: STATUS_COLOR[product.status], padding: '2px 10px', borderRadius: 12, fontSize: 12, fontWeight: 600 }}>
                    {product.status.replace('_', ' ').toLowerCase()}
                  </span>
                </td>
                <td style={{ padding: '10px 14px' }}>
                  <div style={{ display: 'flex', gap: 8 }}>
                    {/* Approving an already-live product is a no-op, and a
                        rejected one cannot be rejected again — so each control
                        appears only where the decision is still open. */}
                    {product.status !== 'ACTIVE' && product.status !== 'ARCHIVED' && (
                      <button
                        onClick={() => handleApprove(product)}
                        disabled={moderatingId === product.id}
                        style={{ background: '#10b981', color: '#fff', border: 'none', borderRadius: 4, padding: '4px 12px', fontSize: 12, cursor: moderatingId === product.id ? 'wait' : 'pointer', opacity: moderatingId === product.id ? 0.6 : 1 }}
                      >
                        Approve
                      </button>
                    )}
                    {product.status !== 'REJECTED' && product.status !== 'ARCHIVED' && (
                      <button
                        onClick={() => handleReject(product)}
                        disabled={moderatingId === product.id}
                        style={{ background: 'none', color: '#ef4444', border: '1px solid #ef4444', borderRadius: 4, padding: '4px 12px', fontSize: 12, cursor: moderatingId === product.id ? 'wait' : 'pointer', opacity: moderatingId === product.id ? 0.6 : 1 }}
                      >
                        Reject
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 12, fontSize: 13, color: '#64748b' }}>
        <span>{total} product{total === 1 ? '' : 's'}</span>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
            style={{ padding: '4px 12px', border: '1px solid #e2e8f0', borderRadius: 4, background: '#fff', cursor: page <= 1 ? 'not-allowed' : 'pointer' }}
          >
            Previous
          </button>
          <span style={{ padding: '4px 8px' }}>Page {page}</span>
          <button
            disabled={products.length < PAGE_SIZE}
            onClick={() => setPage((p) => p + 1)}
            style={{ padding: '4px 12px', border: '1px solid #e2e8f0', borderRadius: 4, background: '#fff', cursor: products.length < PAGE_SIZE ? 'not-allowed' : 'pointer' }}
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
}
