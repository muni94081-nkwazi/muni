import React from 'react';

interface StatCardProps {
  label: string;
  value: string | number;
  icon: string;
  trend?: string;
  colorVariant?: string;
}

export const StatCard: React.FC<StatCardProps> = ({ label, value, icon, trend, colorVariant = 'var(--color-accent)' }) => {
  return (
    <div style={{
      backgroundColor: 'var(--color-surface)', padding: 'var(--space-4)', borderRadius: 'var(--radius-md)',
      boxShadow: 'var(--shadow-sm)', display: 'flex', alignItems: 'center', gap: '16px'
    }}>
      <div style={{
        width: '48px', height: '48px', borderRadius: '50%', backgroundColor: `${colorVariant}20`,
        display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '24px', color: colorVariant
      }}>
        {icon}
      </div>
      <div>
        <div style={{ color: 'var(--color-text-secondary)', fontSize: '14px', marginBottom: '4px' }}>{label}</div>
        <div style={{ color: 'var(--color-text-primary)', fontSize: '24px', fontWeight: 700 }}>
          {value}
          {trend && <span style={{ fontSize: '12px', marginLeft: '8px', color: trend.startsWith('+') ? 'var(--color-success)' : 'var(--color-danger)' }}>{trend}</span>}
        </div>
      </div>
    </div>
  );
};
