import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { analyticsApi, type AnalyticsOverview, type DailySalesData, type TopProduct } from '@/api/analytics.api';
import { scorecardApi } from '@/api/scorecard.api';
import { useAuth } from '@/hooks/useAuth';
import type { HealthScorecard } from '@/types/scorecard.types';
import { HealthScorecardPanel } from '@/components/scorecard/HealthScorecardPanel';
import { logger } from '@/utils/logger';

export function AnalyticsPage() {
  const [overview, setOverview] = useState<AnalyticsOverview | null>(null);
  const [sales, setSales] = useState<DailySalesData[]>([]);
  const [salesPending, setSalesPending] = useState(false);
  const [topProducts, setTopProducts] = useState<TopProduct[]>([]);
  const [topProductsPending, setTopProductsPending] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [period, setPeriod] = useState<7 | 14 | 30>(30);
  const [scorecard, setScorecard] = useState<HealthScorecard | null>(null);
  const { user } = useAuth();
  const sellerId = user?.id;

  // The API layer no longer swallows failures into mock data, so this has to
  // handle them. Without the catch/finally a rejection would leave isLoading
  // true forever and the page stuck on "Loading analytics..." — a silent hang
  // in place of the old silent fiction.
  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [o, s, tp] = await Promise.all([
        analyticsApi.getOverview(),
        analyticsApi.getSalesData(period),
        analyticsApi.getTopProducts(5),
      ]);
      setOverview(o);
      setSales(s.items);
      setSalesPending(s.pending);
      setTopProducts(tp.items);
      setTopProductsPending(tp.pending);
    } catch (err) {
      logger.error('[AnalyticsPage] Failed to load analytics:', err);
      setError(
        err instanceof Error ? err.message : 'Could not load analytics. Please try again.',
      );
    } finally {
      setIsLoading(false);
    }
  }, [period]);

  useEffect(() => {
    void load();
  }, [load]);

  // Lightweight tie-in to the Health Scorecard (built in the Dashboard) — fetched independently
  // of the main analytics loading state so it doesn't block or duplicate the full scorecard UI.
  useEffect(() => {
    if (!sellerId) return;
    scorecardApi.getHealthScorecard(sellerId)
      .then(setScorecard)
      .catch((err) => logger.error('[AnalyticsPage] Failed to load scorecard:', err));
  }, [sellerId]);

  const maxRevenue = Math.max(...sales.map((d) => d.revenue), 1);

  if (isLoading) return <div style={{ padding: 40, textAlign: 'center', color: '#64748b' }}>Loading analytics...</div>;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <h1 style={{ fontSize: 24, fontWeight: 700 }}>Analytics</h1>
        <div style={{ display: 'flex', gap: 8 }}>
          {([7, 14, 30] as const).map((p) => (
            <button key={p} onClick={() => setPeriod(p)} style={{ padding: '6px 14px', borderRadius: 6, border: '1px solid', borderColor: period === p ? '#3b82f6' : '#e2e8f0', background: period === p ? '#3b82f6' : '#fff', color: period === p ? '#fff' : '#0f172a', fontWeight: 600, cursor: 'pointer', fontSize: 13 }}>{p}d</button>
          ))}
        </div>
      </div>

      {error && (
        <div
          role="alert"
          style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#991b1b', borderRadius: 8, padding: 16, marginBottom: 24, fontSize: 14 }}
        >
          <strong>Analytics unavailable.</strong> {error}{' '}
          <button
            onClick={() => void load()}
            style={{ marginLeft: 8, background: 'none', border: 'none', color: 'inherit', textDecoration: 'underline', cursor: 'pointer', font: 'inherit' }}
          >
            Retry
          </button>
        </div>
      )}

      {/* Seller Health Scorecard tie-in */}
      {scorecard && (
        <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, padding: 16, marginBottom: 24 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <h3 style={{ fontWeight: 700, fontSize: 14, margin: 0 }}>Seller Health Scorecard</h3>
            <Link to="/" style={{ fontSize: 12, color: '#3b82f6', fontWeight: 600, textDecoration: 'none' }}>
              View full scorecard →
            </Link>
          </div>
          <HealthScorecardPanel scorecard={scorecard} compact />
        </div>
      )}

      {/* Overview Cards */}
      {overview && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 28 }}>
          {[
            { label: 'Total Revenue', value: `UGX ${(overview.totalRevenue / 1000000).toFixed(2)}M`, trend: overview.revenueGrowth, icon: '💰' },
            { label: 'Total Orders', value: overview.totalOrders.toLocaleString(), trend: overview.ordersGrowth, icon: '📦' },
            { label: 'Avg Order Value', value: `UGX ${overview.avgOrderValue.toLocaleString()}`, trend: 0, icon: '🧾' },
            { label: 'Conversion Rate', value: `${overview.conversionRate}%`, trend: 0, icon: '📈' },
          ].map((c) => (
            <div key={c.label} style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, padding: '16px 20px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                <p style={{ fontSize: 12, color: '#64748b', textTransform: 'uppercase', fontWeight: 700 }}>{c.label}</p>
                <span style={{ fontSize: 20 }}>{c.icon}</span>
              </div>
              <p style={{ fontSize: 22, fontWeight: 800, color: '#0f172a', marginBottom: 4 }}>{c.value}</p>
              {c.trend !== 0 && <p style={{ fontSize: 12, color: c.trend > 0 ? '#10b981' : '#ef4444' }}>{c.trend > 0 ? '▲' : '▼'} {Math.abs(c.trend)}% vs last period</p>}
            </div>
          ))}
        </div>
      )}

      {/* Revenue Chart */}
      <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, padding: 24, marginBottom: 24 }}>
        <h3 style={{ fontWeight: 700, marginBottom: 16 }}>Daily Revenue (Last {period} days)</h3>

        {/* Three distinct empty states. "Not built yet" and "you had no sales"
            look identical on a chart, so they are said in words instead. */}
        {sales.length === 0 && (
          <p style={{ color: '#64748b', fontSize: 13, padding: '24px 0' }}>
            {salesPending
              ? 'Daily revenue is not available yet — per-seller sales aggregation is still being built.'
              : error
                ? 'No data could be loaded.'
                : 'No sales recorded in this period.'}
          </p>
        )}

        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4, height: sales.length === 0 ? 0 : 160 }}>
          {sales.slice(-period).map((d, i) => (
            <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
              <div
                title={`${d.date}: UGX ${d.revenue.toLocaleString()}`}
                style={{ width: '100%', background: '#3b82f6', borderRadius: '3px 3px 0 0', height: Math.max(4, (d.revenue / maxRevenue) * 140), transition: 'height 0.3s' }}
              />
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4, fontSize: 11, color: '#94a3b8' }}>
          <span>{sales[0]?.date}</span>
          <span>{sales[sales.length - 1]?.date}</span>
        </div>
      </div>

      {/* Top Products */}
      <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, overflow: 'hidden' }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid #e2e8f0', fontWeight: 700 }}>Top Products by Revenue</div>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead style={{ background: '#f8fafc' }}>
            <tr>{['Product', 'Revenue (UGX)', 'Units Sold', 'Views'].map((h) => <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontSize: 12, fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>{h}</th>)}</tr>
          </thead>
          <tbody>
            {topProducts.length === 0 && (
              <tr>
                <td colSpan={4} style={{ padding: '24px 16px', color: '#64748b', fontSize: 13 }}>
                  {topProductsPending
                    ? 'Top products are not available yet — per-seller product aggregation is still being built.'
                    : error
                      ? 'No data could be loaded.'
                      : 'No product sales recorded in this period.'}
                </td>
              </tr>
            )}
            {topProducts.map((p, i) => (
              <tr key={p.productId} style={{ borderTop: i > 0 ? '1px solid #e2e8f0' : 'none' }}>
                <td style={{ padding: '12px 16px', fontWeight: 600, fontSize: 14 }}>{p.name}</td>
                <td style={{ padding: '12px 16px', fontWeight: 700, color: '#10b981' }}>{p.revenue.toLocaleString()}</td>
                <td style={{ padding: '12px 16px' }}>{p.unitsSold}</td>
                <td style={{ padding: '12px 16px' }}>{p.views.toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
