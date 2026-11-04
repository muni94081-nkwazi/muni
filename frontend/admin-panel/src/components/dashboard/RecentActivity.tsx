import React from 'react';
import { Link } from 'react-router-dom';
import { Spinner } from '../common/Spinner/Spinner';
import { EmptyState } from '../common/EmptyState';
import { formatCompactCurrency } from '@/utils/formatCurrency';
import type { RecentOrder, RecentSeller } from '@/types/dashboard.types';

interface RecentActivityProps {
  orders: RecentOrder[];
  sellers: RecentSeller[];
  isLoading?: boolean;
}

type Entry = {
  key: string;
  icon: string;
  text: React.ReactNode;
  at: string;
};

/** "2 min ago" / "3 hr ago" / a date once it stops being recent. */
function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';

  const minutes = Math.round((Date.now() - then) / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;

  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hr ago`;

  const days = Math.round(hours / 24);
  if (days < 7) return `${days} d ago`;
  return new Date(iso).toLocaleDateString();
}

const ORDER_ICON: Record<string, string> = {
  completed: '✅',
  cancelled: '❌',
  refunded: '↩️',
  payment_failed: '⚠️',
};

/**
 * The platform's real activity feed: the newest orders and seller applications,
 * interleaved by time. This replaced a hardcoded list of eight invented events.
 */
export const RecentActivity: React.FC<RecentActivityProps> = ({ orders, sellers, isLoading }) => {
  const entries: Entry[] = [
    ...orders.map((order) => ({
      key: `order-${order.id}`,
      icon: ORDER_ICON[order.status] ?? '📦',
      at: order.createdAt,
      text: (
        <>
          Order <Link to={`/orders/${order.id}`} style={{ color: 'var(--color-accent)' }}>{order.orderNumber}</Link>
          {' — '}
          {formatCompactCurrency(order.totalAmount, order.currency)} · {order.statusLabel}
          {order.subOrders.length > 1 && ` · ${order.subOrders.length} sellers`}
        </>
      ),
    })),
    ...sellers.map((seller) => ({
      key: `seller-${seller.id}`,
      icon: seller.verificationStatus === 'pending' ? '🆕' : '🏪',
      at: seller.createdAt,
      text: (
        <>
          Seller application: <strong>{seller.businessName}</strong> · {seller.verificationStatus}
        </>
      ),
    })),
  ].sort((a, b) => b.at.localeCompare(a.at));

  return (
    <div
      style={{
        backgroundColor: 'var(--color-surface)',
        padding: 'var(--space-4)',
        borderRadius: 'var(--radius-md)',
        boxShadow: 'var(--shadow-sm)',
      }}
    >
      <h3 style={{ margin: '0 0 var(--space-4) 0' }}>Recent Activity</h3>

      {isLoading && entries.length === 0 ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 'var(--space-6)' }}>
          <Spinner />
        </div>
      ) : entries.length === 0 ? (
        <EmptyState
          icon="🕓"
          title="Nothing yet"
          description="Orders and seller applications will appear here as they come in."
        />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {entries.map((entry) => (
            <div key={entry.key} style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
              <span style={{ fontSize: '20px' }}>{entry.icon}</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: '14px', color: 'var(--color-text-primary)' }}>{entry.text}</div>
                <div style={{ fontSize: '12px', color: 'var(--color-text-secondary)' }}>{relativeTime(entry.at)}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
