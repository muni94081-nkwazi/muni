import React from 'react';
import type { Product } from '@/types/product.types';

interface ProductDetailsProps {
  product: Product;
}

export const ProductDetails: React.FC<ProductDetailsProps> = ({ product }) => {
  return (
    <div style={{ backgroundColor: 'var(--color-surface)', padding: 'var(--space-4)', borderRadius: 'var(--radius-md)' }}>
      <div style={{ display: 'flex', gap: 'var(--space-4)' }}>
        {product.imageUrls?.[0] ? (
          <img
            src={product.imageUrls[0]}
            alt={product.name}
            style={{ width: '200px', height: '200px', objectFit: 'cover', borderRadius: 'var(--radius-md)' }}
          />
        ) : (
          <div style={{ width: '200px', height: '200px', backgroundColor: '#e2e3e5', borderRadius: 'var(--radius-md)' }} />
        )}

        <div style={{ flex: 1 }}>
          <h2 style={{ margin: '0 0 var(--space-2) 0' }}>{product.name}</h2>
          <div style={{ color: 'var(--color-text-secondary)', marginBottom: 'var(--space-2)' }}>
            SKU: {product.sku} | Category: {product.category?.name ?? 'Uncategorised'}
          </div>
          <div style={{ fontSize: '24px', fontWeight: 'bold', color: 'var(--color-accent)', marginBottom: 'var(--space-4)' }}>
            {product.currency} {Number(product.price ?? 0).toLocaleString()}
          </div>
          <p>{product.description ?? 'No description provided.'}</p>

          {product.tags.length > 0 && (
            <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap', marginTop: 'var(--space-2)' }}>
              {product.tags.map((tag) => (
                <span key={tag} style={{ background: 'var(--color-bg)', padding: '2px 10px', borderRadius: 12, fontSize: 12 }}>
                  {tag}
                </span>
              ))}
            </div>
          )}

          <div style={{ marginTop: 'var(--space-4)', padding: 'var(--space-3)', backgroundColor: 'var(--color-bg)', borderRadius: 'var(--radius-sm)' }}>
            {/* sellerId rather than a seller name: product-service does not join
                against auth-service, so the name is not in this payload. */}
            <strong>Seller:</strong> {product.sellerId}
            <div style={{ fontSize: 13, color: 'var(--color-text-secondary)', marginTop: 4 }}>
              Listed {new Date(product.createdAt).toLocaleDateString()}
              {product.submittedAt && ` · submitted ${new Date(product.submittedAt).toLocaleString()}`}
            </div>
          </div>
        </div>
      </div>

      {/* Remaining images matter to a moderator — a policy violation is often in
          image 3, not the thumbnail. */}
      {product.imageUrls.length > 1 && (
        <div style={{ display: 'flex', gap: 'var(--space-2)', marginTop: 'var(--space-4)', flexWrap: 'wrap' }}>
          {product.imageUrls.slice(1).map((url) => (
            <img key={url} src={url} alt="" style={{ width: 80, height: 80, objectFit: 'cover', borderRadius: 'var(--radius-sm)' }} />
          ))}
        </div>
      )}
    </div>
  );
};
