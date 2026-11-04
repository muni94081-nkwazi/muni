import React from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell } from 'recharts';
import { ChartCard } from '../common/ChartCard/ChartCard';
import { CHART_COLORS } from '@/styles/chartColors';
import { formatCompactCurrency, formatCompactNumber } from '@/utils/formatCurrency';
// Presentational only — the caller supplies the series. It used to be typed
// against DashboardMetrics, which existed solely to describe the mock payload.
export interface CategoryRevenuePoint {
  category: string;
  revenue: number;
}

interface CategoryPerformanceChartProps {
  data: CategoryRevenuePoint[];
  currency: string;
  isLoading?: boolean;
}

export const CategoryPerformanceChart: React.FC<CategoryPerformanceChartProps> = ({ data, currency, isLoading }) => {
  return (
    <ChartCard
      title="Category Performance"
      subtitle="Revenue by product category"
      height={300}
      isLoading={isLoading}
      isEmpty={!isLoading && data.length === 0}
    >
      <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 32 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={CHART_COLORS.border} vertical={false} />
        <XAxis
          dataKey="category"
          tick={{ fontSize: 11, fill: CHART_COLORS.textSecondary }}
          angle={-30}
          textAnchor="end"
          interval={0}
          height={60}
        />
        <YAxis tick={{ fontSize: 11, fill: CHART_COLORS.textSecondary }} tickFormatter={(v) => formatCompactNumber(v)} width={56} />
        <Tooltip formatter={(value: number) => formatCompactCurrency(value, currency)} />
        <Bar dataKey="revenue" radius={[4, 4, 0, 0]}>
          {data.map((d, i) => (
            <Cell key={d.category} fill={CHART_COLORS.series[i % CHART_COLORS.series.length]} />
          ))}
        </Bar>
      </BarChart>
    </ChartCard>
  );
};
