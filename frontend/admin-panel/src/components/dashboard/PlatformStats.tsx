import React from 'react';
import { StatCard } from '../common/StatCard';
import { formatCompactCurrency, formatCompactNumber } from '@/utils/formatCurrency';
import type { DashboardStats } from '@/types/dashboard.types';

interface PlatformStatsProps {
  stats: DashboardStats | null;
  isLoading?: boolean;
  /** Services whose slice of the stats could not be fetched. */
  degradedServices?: string[];
}

// Which backing service each tile's number comes from. When that service is in
// the degraded list its figure is a zero the gateway substituted, not a real
// count — so the tile says so rather than reporting a confident nothing.
const TILE_SOURCE = {
  order:   'order-service',
  auth:    'auth-service',
  product: 'product-service',
} as const;

const UNAVAILABLE = '—';

export const PlatformStats: React.FC<PlatformStatsProps> = ({ stats, isLoading, degradedServices = [] }) => {
  const down = (service: string) => degradedServices.includes(service);

  const show = (service: string, value: number, format: (n: number) => string): string => {
    if (isLoading && !stats) return '…';
    if (down(service)) return UNAVAILABLE;
    return format(value);
  };

  const currency = stats?.currency ?? 'UGX';
  const money = (value: number) => formatCompactCurrency(value, currency);
  const count = (value: number) => formatCompactNumber(value);

  return (
    <div>
      {degradedServices.length > 0 && (
        <div
          role="status"
          style={{
            backgroundColor: 'var(--color-surface)',
            border: '1px solid var(--color-warning, #f59e0b)',
            borderRadius: 'var(--radius-md)',
            padding: 'var(--space-3)',
            marginBottom: 'var(--space-4)',
            fontSize: 13,
            color: 'var(--color-text-secondary)',
          }}
        >
          Some figures are unavailable — no response from {degradedServices.join(', ')}.
        </div>
      )}

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
          gap: 'var(--space-4)',
          marginBottom: 'var(--space-6)',
        }}
      >
        <StatCard
          label="Total GMV"
          value={show(TILE_SOURCE.order, stats?.gmv ?? 0, money)}
          icon="💰"
          colorVariant="#e94560"
        />
        <StatCard
          label="Platform Commission"
          value={show(TILE_SOURCE.order, stats?.platformCommission ?? 0, money)}
          icon="📈"
          colorVariant="#6c5ce7"
        />
        <StatCard
          label="Total Orders"
          value={show(TILE_SOURCE.order, stats?.totalOrders ?? 0, count)}
          icon="📦"
          colorVariant="#fdcb6e"
        />
        <StatCard
          label="Customers"
          value={show(TILE_SOURCE.auth, stats?.totalCustomers ?? 0, count)}
          icon="👥"
          colorVariant="#0984e3"
        />
        <StatCard
          label="Approved Sellers"
          value={show(TILE_SOURCE.auth, stats?.totalSellers ?? 0, count)}
          icon="🏪"
          colorVariant="#00b894"
        />
        <StatCard
          label="Pending Verifications"
          value={show(TILE_SOURCE.auth, stats?.pendingSellerVerifications ?? 0, count)}
          icon="🪪"
          colorVariant="#d63031"
        />
        <StatCard
          label="Pending Product Approvals"
          value={show(TILE_SOURCE.product, stats?.pendingProductApprovals ?? 0, count)}
          icon="🕵️"
          colorVariant="#e17055"
        />
      </div>
    </div>
  );
};
