import React, { useState } from 'react';
import { Button } from '../common/Button/Button';
import { Badge } from '../common/Badge/Badge';
import type { Product, ProductStatus } from '@/types/product.types';

interface ProductModerationProps {
  product: Product;
  busy: boolean;
  onApprove: () => void;
  onReject: (reason: string) => void;
}

const STATUS_LABEL: Record<ProductStatus, string> = {
  PENDING_APPROVAL: 'Pending Review',
  ACTIVE:           'Live',
  REJECTED:         'Rejected',
  DRAFT:            'Draft',
  ARCHIVED:         'Archived',
  OUT_OF_STOCK:     'Out of Stock',
};

export const ProductModeration: React.FC<ProductModerationProps> = ({
  product, busy, onApprove, onReject,
}) => {
  const [reason, setReason] = useState('');

  // product-service requires a reason on reject, so the button stays disabled
  // until one is written rather than firing a request that 422s.
  const canReject = reason.trim().length >= 3 && product.status !== 'REJECTED';
  const canApprove = product.status !== 'ACTIVE' && product.status !== 'ARCHIVED';

  return (
    <div style={{ backgroundColor: 'var(--color-surface)', padding: 'var(--space-4)', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)' }}>
      <h3 style={{ margin: '0 0 var(--space-4) 0' }}>Moderation Panel</h3>

      <div style={{ marginBottom: 'var(--space-4)' }}>
        Current Status: <Badge variant={product.status.toLowerCase()}>{STATUS_LABEL[product.status]}</Badge>
      </div>

      {product.status === 'REJECTED' && product.rejectionReason && (
        <div style={{ background: '#fef2f2', color: '#991b1b', padding: 'var(--space-3)', borderRadius: 'var(--radius-sm)', marginBottom: 'var(--space-4)', fontSize: 14 }}>
          <strong>Reason given:</strong>
          <div style={{ marginTop: 4 }}>{product.rejectionReason}</div>
        </div>
      )}

      {product.moderatedAt && (
        <div style={{ fontSize: 13, color: 'var(--color-text-secondary)', marginBottom: 'var(--space-4)' }}>
          Last moderated {new Date(product.moderatedAt).toLocaleString()}
        </div>
      )}

      <textarea
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="Reason for rejection — the seller sees this."
        style={{ width: '100%', height: '100px', padding: '8px', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)', marginBottom: 'var(--space-4)', boxSizing: 'border-box' }}
      />

      <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
        <Button variant="primary" disabled={busy || !canApprove} onClick={onApprove}>
          {busy ? 'Working…' : 'Approve Product'}
        </Button>
        <Button variant="danger" disabled={busy || !canReject} onClick={() => onReject(reason.trim())}>
          Reject
        </Button>
      </div>

      {!canApprove && product.status === 'ACTIVE' && (
        <div style={{ fontSize: 13, color: 'var(--color-text-secondary)', marginTop: 'var(--space-3)' }}>
          Already live. Rejecting it removes it from the storefront.
        </div>
      )}
    </div>
  );
};
