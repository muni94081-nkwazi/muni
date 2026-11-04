import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Table } from '../common/Table/Table';
import { Badge } from '../common/Badge/Badge';
import type { Product, ProductStatus } from '../../types/product.types';

interface ProductListProps {
  products: Product[];
  isLoading: boolean;
  onDelete: (id: string) => void;
}

// Badge resolves colour from the label keyword (see Badge.tsx's KEYWORD_RULES),
// so these strings drive both the wording and the colour.
const STATUS_LABEL: Record<ProductStatus, string> = {
  PENDING_APPROVAL: 'Pending review',
  ACTIVE:           'Live',
  REJECTED:         'Rejected',
  DRAFT:            'Draft',
  ARCHIVED:         'Archived',
  OUT_OF_STOCK:     'Out of stock',
};

const STATUS_VARIANT: Record<ProductStatus, string> = {
  PENDING_APPROVAL: 'pending',
  ACTIVE:           'active',
  REJECTED:         'rejected',
  DRAFT:            'draft',
  ARCHIVED:         'archived',
  OUT_OF_STOCK:     'neutral',
};

export const ProductList: React.FC<ProductListProps> = ({ products, isLoading, onDelete }) => {
  const navigate = useNavigate();

  const columns = [
    {
      key: 'image',
      label: 'Image',
      render: (item: Product) =>
        item.imageUrls?.[0] ? (
          <img
            src={item.imageUrls[0]}
            alt=""
            style={{ width: '40px', height: '40px', objectFit: 'cover', borderRadius: '4px' }}
          />
        ) : (
          <div style={{ width: '40px', height: '40px', backgroundColor: '#e0e0e0', borderRadius: '4px' }} />
        ),
    },
    {
      key: 'name',
      label: 'Name',
      // The rejection reason belongs next to the product it blocks — a seller
      // seeing only a red "Rejected" badge has no idea what to change.
      render: (item: Product) => (
        <div>
          <div>{item.name}</div>
          {item.status === 'REJECTED' && item.rejectionReason && (
            <div style={{ fontSize: '12px', color: '#c5221f', marginTop: '2px' }}>
              {item.rejectionReason}
            </div>
          )}
        </div>
      ),
    },
    { key: 'sku', label: 'SKU' },
    {
      key: 'price',
      label: 'Price',
      render: (item: Product) => `UGX ${Number(item.price ?? 0).toLocaleString()}`,
    },
    {
      key: 'stockQuantity',
      label: 'Stock',
      render: (item: Product) => item.stockQuantity ?? 0,
    },
    {
      key: 'status',
      label: 'Approval',
      render: (item: Product) => (
        <Badge
          variant={STATUS_VARIANT[item.status] ?? 'neutral'}
          label={STATUS_LABEL[item.status] ?? item.status}
        />
      ),
    },
    {
      key: 'stock',
      label: 'Stock status',
      render: (item: Product) => {
        const stock = item.stockQuantity ?? 0;
        const variant = stock > 10 ? 'success' : stock > 0 ? 'warning' : 'danger';
        const label = stock > 10 ? 'In Stock' : stock > 0 ? 'Low Stock' : 'Out of Stock';
        return <Badge variant={variant} label={label} />;
      },
    },
    {
      key: 'actions',
      label: 'Actions',
      render: (item: Product) => (
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            onClick={() => navigate(`/products/${item.id}/edit`)}
            style={{ cursor: 'pointer', background: 'none', border: 'none', color: '#0066cc' }}
          >
            Edit
          </button>
          <button
            onClick={() => {
              if (window.confirm('Archive this product? It will be removed from the storefront.')) {
                onDelete(item.id);
              }
            }}
            style={{ cursor: 'pointer', background: 'none', border: 'none', color: '#c5221f' }}
          >
            Archive
          </button>
        </div>
      ),
    },
  ];

  return <Table columns={columns} data={products} isLoading={isLoading} />;
};
