import React, { ReactElement } from 'react';
import { ResponsiveContainer } from 'recharts';
import { Spinner } from '../Spinner/Spinner';
import { EmptyState } from '../EmptyState';

interface ChartCardProps {
  title: string;
  subtitle?: string;
  height?: number;
  isLoading?: boolean;
  isEmpty?: boolean;
  legend?: React.ReactNode;
  actions?: React.ReactNode;
  children: ReactElement;
}

export const ChartCard: React.FC<ChartCardProps> = ({ title, subtitle, height = 280, isLoading, isEmpty, legend, actions, children }) => {
  return (
    <div style={{ backgroundColor: '#fff', borderRadius: '8px', border: '1px solid #e0e0e0', padding: '20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
        <div>
          <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 600, color: 'var(--color-text-primary)' }}>{title}</h3>
          {subtitle && <p style={{ margin: '4px 0 0 0', fontSize: '12px', color: 'var(--color-text-secondary)' }}>{subtitle}</p>}
        </div>
        {actions}
      </div>
      {isLoading ? (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height }}>
          <Spinner />
        </div>
      ) : isEmpty ? (
        <EmptyState icon="📉" title="No data yet" description="Data will appear here once available." />
      ) : (
        <ResponsiveContainer width="100%" height={height}>
          {children}
        </ResponsiveContainer>
      )}
      {legend && <div style={{ marginTop: '12px' }}>{legend}</div>}
    </div>
  );
};
