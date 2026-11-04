import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useProducts } from '../hooks/useProducts';
import { ProductList } from '../components/products/ProductList';
import { BulkUpload } from '../components/products/BulkUpload';
import { Pagination } from '../components/common/Pagination';

const STATUS_TABS = [
  { value: '',                 label: 'All' },
  { value: 'PENDING_APPROVAL', label: 'Pending review' },
  { value: 'ACTIVE',           label: 'Live' },
  { value: 'REJECTED',         label: 'Rejected' },
  { value: 'DRAFT',            label: 'Drafts' },
];

export const ProductsPage: React.FC = () => {
  const navigate = useNavigate();
  const { products, isLoading, error, lastPage, fetchProducts, deleteProduct } = useProducts();
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState('');
  const [showBulk, setShowBulk] = useState(false);

  // No vendor id: product-service scopes the response to the JWT's subject.
  useEffect(() => {
    fetchProducts({ page, status: status || undefined });
  }, [fetchProducts, page, status]);

  const pendingCount = products.filter((p) => p.status === 'PENDING_APPROVAL').length;
  const rejectedCount = products.filter((p) => p.status === 'REJECTED').length;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <h1 style={{ margin: 0, fontSize: '1.5rem' }}>My Products</h1>
        <div style={{ display: 'flex', gap: '12px' }}>
          <button onClick={() => setShowBulk(!showBulk)} style={{ padding: '10px 16px', background: '#f1f3f4', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>
            Bulk Upload
          </button>
          <button onClick={() => navigate('/products/new')} style={{ padding: '10px 16px', background: '#0066cc', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>
            ➕ Add Product
          </button>
        </div>
      </div>

      {error && (
        <div style={{ background: '#fce8e6', color: '#c5221f', padding: '12px 16px', borderRadius: '4px', marginBottom: '16px' }}>
          {error}
        </div>
      )}

      {rejectedCount > 0 && (
        <div style={{ background: '#fce8e6', color: '#c5221f', padding: '12px 16px', borderRadius: '4px', marginBottom: '16px', fontSize: '14px' }}>
          {rejectedCount} listing{rejectedCount > 1 ? 's were' : ' was'} rejected. Open each one to see why and resubmit.
        </div>
      )}

      {pendingCount > 0 && (
        <div style={{ background: '#fef7e0', color: '#b06000', padding: '12px 16px', borderRadius: '4px', marginBottom: '16px', fontSize: '14px' }}>
          {pendingCount} listing{pendingCount > 1 ? 's are' : ' is'} awaiting admin review and not yet visible to customers.
        </div>
      )}

      <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', flexWrap: 'wrap' }}>
        {STATUS_TABS.map((tab) => (
          <button
            key={tab.value}
            onClick={() => { setStatus(tab.value); setPage(1); }}
            style={{
              padding: '6px 14px',
              borderRadius: '16px',
              border: '1px solid ' + (status === tab.value ? '#0066cc' : '#dadce0'),
              background: status === tab.value ? '#e8f0fe' : '#fff',
              color: status === tab.value ? '#1967d2' : '#3c4043',
              cursor: 'pointer',
              fontSize: '14px',
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {showBulk && <BulkUpload />}

      <div style={{ marginTop: '24px' }}>
        <ProductList products={products} isLoading={isLoading} onDelete={deleteProduct} />
        {/* lastPage comes from the API rather than a hardcoded 5. */}
        <Pagination currentPage={page} lastPage={lastPage + 1} onPageChange={setPage} />
      </div>
    </div>
  );
};
