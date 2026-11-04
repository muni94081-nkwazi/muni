import React from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts';
import { ChartCard } from '../common/ChartCard/ChartCard';
import { CHART_COLORS } from '@/styles/chartColors';
export interface HourlyTransactionPoint {
  hour: string;
  transactions: number;
}

interface HourlyTransactionsChartProps {
  data: HourlyTransactionPoint[];
  isLoading?: boolean;
}

export const HourlyTransactionsChart: React.FC<HourlyTransactionsChartProps> = ({ data, isLoading }) => {
  return (
    <ChartCard
      title="Peak Hourly Transactions"
      subtitle="Order volume across a 24-hour window"
      height={280}
      isLoading={isLoading}
      isEmpty={!isLoading && data.length === 0}
    >
      <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="hourlyTxnGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={CHART_COLORS.accent} stopOpacity={0.35} />
            <stop offset="100%" stopColor={CHART_COLORS.accent} stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke={CHART_COLORS.border} vertical={false} />
        <XAxis dataKey="hour" tick={{ fontSize: 11, fill: CHART_COLORS.textSecondary }} interval={2} />
        <YAxis tick={{ fontSize: 11, fill: CHART_COLORS.textSecondary }} width={40} />
        <Tooltip formatter={(value: number) => [`${value.toLocaleString()} txns`, 'Transactions']} />
        <Area type="monotone" dataKey="transactions" stroke={CHART_COLORS.accent} strokeWidth={2} fill="url(#hourlyTxnGradient)" />
      </AreaChart>
    </ChartCard>
  );
};
