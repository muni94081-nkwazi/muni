import { Link } from 'react-router-dom';
import type { Seller } from '@/types/product.types';

export interface SellerBadgeProps {
  seller: Seller;
}

export function SellerBadge({ seller }: SellerBadgeProps) {
  return (
    <Link
      to={`/store/${seller.id}`}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 'var(--space-2)',
        padding: 'var(--space-2) var(--space-3)',
        borderRadius: 'var(--radius-md)',
        border: '1px solid var(--color-border)',
        marginBottom: 'var(--space-4)',
        textDecoration: 'none',
        color: 'inherit',
      }}
    >
      <span style={{ fontSize: 'var(--text-sm)', fontWeight: 600 }}>{seller.name}</span>
      {(seller.isOfficial || seller.isVerified) && (
        <span
          title={seller.isOfficial ? 'Official store' : 'Verified seller'}
          style={{
            fontSize: 'var(--text-xs)',
            fontWeight: 700,
            color: '#fff',
            background: seller.isOfficial ? 'var(--color-market-green, #0a8f5b)' : 'var(--color-interactive)',
            borderRadius: 'var(--radius-sm)',
            padding: '1px 6px',
          }}
        >
          {seller.isOfficial ? 'Official' : 'Verified'}
        </span>
      )}
      <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)' }}>
        <span style={{ color: 'var(--color-marigold-dark)' }}>★</span> {seller.rating.toFixed(1)}
        {seller.totalSales > 0 && ` · ${seller.totalSales.toLocaleString()} sold`}
      </span>
    </Link>
  );
}
