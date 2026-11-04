import React, { useEffect } from 'react';
import { PlatformStats } from '../components/dashboard/PlatformStats';
import { GMVChart } from '../components/dashboard/GMVChart';
import { RecentActivity } from '../components/dashboard/RecentActivity';
import { QuickActions } from '../components/dashboard/QuickActions';
import { ServiceHealthTicker } from '../components/dashboard/ServiceHealthTicker';
import { useAppDispatch, useAppSelector } from '../store/hooks/useAppSelector';
import { fetchServiceHealthThunk } from '../store/slices/healthSlice';
import { useDashboard } from '../hooks/useDashboard';

const HEALTH_POLL_INTERVAL_MS = 15_000;

export const DashboardPage: React.FC = () => {
  const dispatch = useAppDispatch();
  const { services, loading } = useAppSelector((state) => state.health);
  const { stats, degradedServices, recentOrders, recentSellers, isLoading, feedsLoading, error, refresh } =
    useDashboard();

  useEffect(() => {
    dispatch(fetchServiceHealthThunk());
    const interval = setInterval(() => dispatch(fetchServiceHealthThunk()), HEALTH_POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [dispatch]);

  return (
    <div style={{ padding: 'var(--space-4)' }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 'var(--space-6)',
        }}
      >
        <h1 style={{ margin: 0 }}>Dashboard</h1>
        <button
          onClick={refresh}
          disabled={isLoading}
          style={{
            background: 'none',
            border: '1px solid var(--color-border)',
            borderRadius: 'var(--radius-md)',
            padding: '8px 16px',
            fontSize: 13,
            cursor: isLoading ? 'default' : 'pointer',
            color: 'var(--color-text-secondary)',
          }}
        >
          {isLoading ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>

      {/* A failed stats call is distinct from a degraded slice: this one means
          nothing loaded at all, so it gets a full-width error rather than the
          per-tile "unavailable" treatment inside PlatformStats. */}
      {error && (
        <div
          role="alert"
          style={{
            backgroundColor: 'var(--color-surface)',
            border: '1px solid var(--color-danger, #d63031)',
            borderRadius: 'var(--radius-md)',
            padding: 'var(--space-3)',
            marginBottom: 'var(--space-4)',
            fontSize: 13,
            color: 'var(--color-text-primary)',
          }}
        >
          {error}
        </div>
      )}

      <PlatformStats stats={stats} isLoading={isLoading} degradedServices={degradedServices} />

      <div style={{ marginBottom: 'var(--space-4)' }}>
        <ServiceHealthTicker services={services} isLoading={loading && services.length === 0} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 'var(--space-4)' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
          <GMVChart
            data={stats?.gmvByMonth ?? []}
            currency={stats?.currency ?? 'UGX'}
            isLoading={isLoading && !stats}
          />
          <RecentActivity orders={recentOrders} sellers={recentSellers} isLoading={feedsLoading} />
        </div>
        <div>
          <QuickActions stats={stats} />
        </div>
      </div>
    </div>
  );
};
