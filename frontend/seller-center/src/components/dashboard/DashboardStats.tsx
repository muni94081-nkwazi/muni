import React from 'react';

export const DashboardStats: React.FC = () => {
  const stats = [
    { label: 'Total Revenue', value: 'UGX 4,250,000', trend: '+12%', icon: '💰' },
    { label: 'Orders Today', value: '8', trend: 'Stable', icon: '🛒' },
    { label: 'Products Listed', value: '24', trend: '+2', icon: '📦' },
    { label: 'Low Stock Alerts', value: '3', trend: 'Needs attention', icon: '⚠️' },
  ];

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', marginBottom: '24px' }}>
      {stats.map((stat, idx) => (
        <div key={idx} style={{ backgroundColor: '#fff', padding: '20px', borderRadius: '8px', boxShadow: '0 2px 4px rgba(0,0,0,0.05)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <p style={{ margin: '0 0 8px 0', color: '#5f6368', fontSize: '0.875rem' }}>{stat.label}</p>
              <h3 style={{ margin: 0, fontSize: '1.5rem', color: '#202124' }}>{stat.value}</h3>
            </div>
            <div style={{ fontSize: '1.5rem' }}>{stat.icon}</div>
          </div>
          <div style={{ marginTop: '12px', fontSize: '0.75rem', color: stat.trend.startsWith('+') ? '#137333' : '#b06000' }}>
            {stat.trend}
          </div>
        </div>
      ))}
    </div>
  );
};
