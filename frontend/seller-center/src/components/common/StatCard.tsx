import React from 'react';

interface CardProps {
  label: string;
  value: string | number;
  trend?: { direction: 'up' | 'down'; value: string };
  icon: string;
}

export const StatCard: React.FC<CardProps> = ({ label, value, trend, icon }) => {
  return (
    <div style={{ backgroundColor: 'var(--color-surface)', padding: 'var(--spacing-4)', borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-sm)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--spacing-2)' }}>
        <h3 style={{ fontSize: '0.875rem', color: 'var(--color-text-secondary)', margin: 0 }}>{label}</h3>
        <span style={{ fontSize: '1.25rem' }}>{icon}</span>
      </div>
      <div style={{ fontSize: '1.5rem', fontWeight: 'bold' }}>{value}</div>
      {trend && (
        <div style={{ marginTop: 'var(--spacing-2)', fontSize: '0.75rem', color: trend.direction === 'up' ? 'var(--color-success)' : 'var(--color-danger)' }}>
          {trend.direction === 'up' ? '↑' : '↓'} {trend.value}
        </div>
      )}
    </div>
  );
};
