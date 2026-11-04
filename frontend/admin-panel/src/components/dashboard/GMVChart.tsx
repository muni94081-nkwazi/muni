import React from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts';
import { ChartCard } from '../common/ChartCard/ChartCard';
import { CHART_COLORS } from '@/styles/chartColors';
import { formatCompactCurrency, formatCompactNumber } from '@/utils/formatCurrency';
import type { MonthlyGmv } from '@/types/dashboard.types';

interface GMVChartProps {
  data: MonthlyGmv[];
  currency: string;
  isLoading?: boolean;
}

/** 'YYYY-MM' → 'Jul 25', which is what fits on a monthly axis tick. */
function monthLabel(month: string): string {
  const [year, m] = month.split('-');
  const date = new Date(Number(year), Number(m) - 1, 1);
  return `${date.toLocaleString(undefined, { month: 'short' })} ${year.slice(2)}`;
}

export const GMVChart: React.FC<GMVChartProps> = ({ data, currency, isLoading }) => {
  const points = data.map((point) => ({ ...point, label: monthLabel(point.month) }));

  // A run of zero-GMV months is a real answer (no completed orders yet), but
  // plotting a flat line at zero as though it were a trend is not. The card's
  // own empty state says so instead.
  const hasSales = points.some((point) => point.gmv > 0);

  return (
    <ChartCard
      title="Monthly GMV"
      subtitle="Completed orders over the last 12 months"
      height={280}
      isLoading={isLoading}
      isEmpty={!isLoading && !hasSales}
    >
      <AreaChart data={points} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="gmvGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={CHART_COLORS.accent} stopOpacity={0.35} />
            <stop offset="100%" stopColor={CHART_COLORS.accent} stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke={CHART_COLORS.border} vertical={false} />
        <XAxis dataKey="label" tick={{ fontSize: 11, fill: CHART_COLORS.textSecondary }} />
        <YAxis
          tick={{ fontSize: 11, fill: CHART_COLORS.textSecondary }}
          tickFormatter={(v: number) => formatCompactNumber(v)}
          width={56}
        />
        <Tooltip
          formatter={(value: number, name: string) =>
            name === 'gmv'
              ? [formatCompactCurrency(value, currency), 'GMV']
              : [`${value.toLocaleString()}`, 'Orders']
          }
        />
        <Area
          type="monotone"
          dataKey="gmv"
          stroke={CHART_COLORS.accent}
          strokeWidth={2}
          fill="url(#gmvGradient)"
        />
      </AreaChart>
    </ChartCard>
  );
};
