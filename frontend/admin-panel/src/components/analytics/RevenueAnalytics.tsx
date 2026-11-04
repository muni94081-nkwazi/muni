import React from 'react';
import { StatCard } from '../common/StatCard';

export const RevenueAnalytics: React.FC = () => (
  <div style={{ marginBottom: 'var(--space-4)' }}>
    <h3 style={{ fontWeight: 700, marginBottom: 'var(--space-3)', fontSize: 'var(--text-lg)' }}>Revenue Overview</h3>
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 'var(--space-4)', marginBottom: 'var(--space-4)' }}>
      <StatCard label="Platform Commission Earned" value="UGX 28.4M" icon="💰" colorVariant="#00b894" />
      <StatCard label="Total Payouts to Sellers" value="UGX 255.6M" icon="💸" colorVariant="#e94560" />
      <StatCard label="Net Revenue" value="UGX 28.4M" icon="📊" colorVariant="#0984e3" />
    </div>
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 'var(--space-4)' }}>
      <div style={{ background: 'var(--color-surface)', borderRadius: 'var(--radius-md)', padding: 'var(--space-4)', border: '1px solid var(--color-border)' }}>
        <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-muted)', marginBottom: 4 }}>Revenue Growth (MoM)</p>
        <p style={{ fontSize: 24, fontWeight: 800, color: '#00b894' }}>+22.5%</p>
      </div>
      <div style={{ background: 'var(--color-surface)', borderRadius: 'var(--radius-md)', padding: 'var(--space-4)', border: '1px solid var(--color-border)' }}>
        <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-muted)', marginBottom: 4 }}>Avg Commission Rate</p>
        <p style={{ fontSize: 24, fontWeight: 800, color: '#0984e3' }}>10%</p>
      </div>
      <div style={{ background: 'var(--color-surface)', borderRadius: 'var(--radius-md)', padding: 'var(--space-4)', border: '1px solid var(--color-border)' }}>
        <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-muted)', marginBottom: 4 }}>GMV This Month</p>
        <p style={{ fontSize: 24, fontWeight: 800, color: '#6c5ce7' }}>UGX 284M</p>
      </div>
    </div>
  </div>
);
