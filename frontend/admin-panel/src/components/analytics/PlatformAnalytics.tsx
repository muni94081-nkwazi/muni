import React from 'react';

const STATS = [
  { label: 'Total GMV', value: 'UGX 284M', growth: '+22.5%', color: '#3b82f6' },
  { label: 'Total Orders', value: '14,230', growth: '+15.2%', color: '#10b981' },
  { label: 'Active Users', value: '38,470', growth: '+31.1%', color: '#8b5cf6' },
  { label: 'Active Sellers', value: '1,560', growth: '+12.0%', color: '#f59e0b' },
];

export const PlatformAnalytics: React.FC = () => (
  <div style={{ marginBottom: 'var(--space-4)' }}>
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 'var(--space-4)', marginBottom: 'var(--space-4)' }}>
      {STATS.map((s) => (
        <div key={s.label} style={{ background: 'var(--color-surface)', borderRadius: 'var(--radius-md)', padding: 'var(--space-4)', border: '1px solid var(--color-border)' }}>
          <p style={{ fontSize: 11, color: '#64748b', textTransform: 'uppercase', fontWeight: 700, marginBottom: 8 }}>{s.label}</p>
          <p style={{ fontSize: 22, fontWeight: 800, color: s.color, marginBottom: 4 }}>{s.value}</p>
          <p style={{ fontSize: 12, color: '#10b981' }}>↑ {s.growth} vs last month</p>
        </div>
      ))}
    </div>
  </div>
);
