import React from 'react';
import { PieChart, Pie, Cell, Tooltip, Legend } from 'recharts';
import { ChartCard } from '../common/ChartCard/ChartCard';
import { CHART_COLORS } from '@/styles/chartColors';
import { formatCompactCurrency } from '@/utils/formatCurrency';
export interface RevenueBreakdownSlice {
  label: string;
  value: number;
}

interface RevenueBreakdownChartProps {
  data: RevenueBreakdownSlice[];
  currency: string;
  isLoading?: boolean;
}

export const RevenueBreakdownChart: React.FC<RevenueBreakdownChartProps> = ({ data, currency, isLoading }) => {
  const total = data.reduce((sum, d) => sum + d.value, 0);

  return (
    <ChartCard
      title="Revenue Breakdown"
      subtitle="By fulfillment channel"
      height={260}
      isLoading={isLoading}
      isEmpty={!isLoading && data.length === 0}
      legend={
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-3)' }}>
          {data.map((d, i) => (
            <div key={d.label} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--color-text-secondary)' }}>
              <span style={{ width: 10, height: 10, borderRadius: '50%', backgroundColor: CHART_COLORS.series[i % CHART_COLORS.series.length] }} />
              {d.label} · {total > 0 ? ((d.value / total) * 100).toFixed(1) : '0'}%
            </div>
          ))}
        </div>
      }
    >
      <PieChart>
        <Pie data={data} dataKey="value" nameKey="label" innerRadius={55} outerRadius={90} paddingAngle={2}>
          {data.map((d, i) => (
            <Cell key={d.label} fill={CHART_COLORS.series[i % CHART_COLORS.series.length]} />
          ))}
        </Pie>
        <Tooltip formatter={(value: number) => formatCompactCurrency(value, currency)} />
        <Legend wrapperStyle={{ display: 'none' }} />
      </PieChart>
    </ChartCard>
  );
};
