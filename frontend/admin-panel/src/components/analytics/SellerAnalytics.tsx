import React from 'react';

const TOP_SELLERS = [
  { name: 'Kamya Store', revenue: 8500000, orders: 230, rating: 4.8 },
  { name: 'Nakato Fashions', revenue: 6200000, orders: 185, rating: 4.6 },
  { name: 'Kiggundu Foods', revenue: 5800000, orders: 420, rating: 4.9 },
  { name: 'Ssebunya Electronics', revenue: 4900000, orders: 98, rating: 4.3 },
  { name: 'Atim Beauty', revenue: 3600000, orders: 310, rating: 4.7 },
];

export const SellerAnalytics: React.FC = () => (
  <div style={{ background: 'var(--color-surface)', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)', overflow: 'hidden', marginBottom: 'var(--space-4)' }}>
    <div style={{ padding: 'var(--space-4)', borderBottom: '1px solid var(--color-border)', fontWeight: 700, fontSize: 'var(--text-base)' }}>Top Sellers by Revenue</div>
    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
      <thead style={{ background: '#f8fafc' }}>
        <tr>
          {['#', 'Seller', 'Revenue (UGX)', 'Orders', 'Rating'].map((h) => (
            <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>{h}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {TOP_SELLERS.map((s, i) => (
          <tr key={s.name} style={{ borderTop: '1px solid #f1f5f9' }}>
            <td style={{ padding: '12px 16px', fontSize: 13, color: '#94a3b8', fontWeight: 600 }}>{i + 1}</td>
            <td style={{ padding: '12px 16px', fontWeight: 600, fontSize: 14 }}>{s.name}</td>
            <td style={{ padding: '12px 16px', fontSize: 13, fontWeight: 700, color: '#10b981' }}>{s.revenue.toLocaleString()}</td>
            <td style={{ padding: '12px 16px', fontSize: 13 }}>{s.orders}</td>
            <td style={{ padding: '12px 16px', fontSize: 13 }}>
              <span style={{ color: '#f59e0b', fontWeight: 700 }}>★ {s.rating}</span>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);
