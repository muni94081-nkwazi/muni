import React from 'react';
import { CartesianGrid, Legend, Line, LineChart, Tooltip, XAxis, YAxis } from 'recharts';
import { ChartCard } from '@/components/common/ChartCard/ChartCard';
import { StatCard } from '@/components/common/StatCard';
import { CHART_COLORS } from '@/styles/chartColors';
import type { Campaign } from '@/types/advertising.types';

interface AcosRoasChartProps {
  campaign: Campaign;
}

export const AcosRoasChart: React.FC<AcosRoasChartProps> = ({ campaign }) => {
  const { metrics, history } = campaign;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-4)' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 'var(--spacing-4)' }}>
        <StatCard icon="👁" label="Impressions" value={metrics.impressions.toLocaleString()} />
        <StatCard icon="🖱" label="Clicks" value={metrics.clicks.toLocaleString()} />
        <StatCard icon="🎯" label="CTR" value={`${metrics.ctr.toFixed(2)}%`} />
        <StatCard icon="💰" label="Spend" value={`$${metrics.spend.toFixed(2)}`} />
        <StatCard icon="🛒" label="Sales" value={`$${metrics.sales.toFixed(2)}`} />
        <StatCard icon="📉" label="ACoS" value={`${metrics.acos.toFixed(1)}%`} />
        <StatCard icon="📈" label="ROAS" value={`${metrics.roas.toFixed(2)}x`} />
      </div>

      <ChartCard
        title="Spend, Sales & ACoS Trend"
        subtitle={`${campaign.name} · last ${history.length} days`}
        height={300}
        isEmpty={history.length === 0}
      >
        <LineChart data={history}>
          <CartesianGrid strokeDasharray="3 3" stroke={CHART_COLORS.border} />
          <XAxis dataKey="date" tick={{ fontSize: 11 }} />
          <YAxis yAxisId="left" tick={{ fontSize: 11 }} />
          <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11 }} unit="%" />
          <Tooltip />
          <Legend />
          <Line yAxisId="left" type="monotone" dataKey="spend" name="Spend" stroke={CHART_COLORS.danger} dot={false} strokeWidth={2} />
          <Line yAxisId="left" type="monotone" dataKey="sales" name="Sales" stroke={CHART_COLORS.success} dot={false} strokeWidth={2} />
          <Line yAxisId="right" type="monotone" dataKey="acos" name="ACoS %" stroke={CHART_COLORS.accent} dot={false} strokeWidth={2} />
        </LineChart>
      </ChartCard>
    </div>
  );
};
