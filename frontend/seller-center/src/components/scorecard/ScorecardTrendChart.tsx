import React from 'react';
import { LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, ReferenceLine } from 'recharts';
import { ChartCard } from '@/components/common/ChartCard/ChartCard';
import { CHART_COLORS } from '@/styles/chartColors';
import type { HealthScorecard, ScorecardMetric } from '@/types/scorecard.types';

interface ScorecardTrendChartProps {
  history: HealthScorecard['history'];
  metrics: ScorecardMetric[];
  isLoading?: boolean;
}

const METRIC_COLORS: Record<ScorecardMetric['key'], string> = {
  odr: CHART_COLORS.series[0],
  lsr: CHART_COLORS.series[1],
  cancellationRate: CHART_COLORS.series[2],
};

export const ScorecardTrendChart: React.FC<ScorecardTrendChartProps> = ({ history, metrics, isLoading }) => {
  return (
    <ChartCard
      title="Performance Trend (Last 30 Days)"
      subtitle="ODR, LSR & Pre-fulfillment Cancellation Rate vs. policy thresholds"
      height={300}
      isLoading={isLoading}
      isEmpty={!isLoading && history.length === 0}
      legend={
        <div style={{ display: 'flex', gap: 'var(--spacing-4)', flexWrap: 'wrap', fontSize: '0.75rem', color: 'var(--color-text-secondary)' }}>
          {metrics.map((m) => (
            <span key={m.key} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
              <span
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: '50%',
                  backgroundColor: METRIC_COLORS[m.key],
                  display: 'inline-block',
                }}
              />
              {m.label} (threshold {m.thresholdPercent.toFixed(2)}%)
            </span>
          ))}
        </div>
      }
    >
      <LineChart data={history} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={CHART_COLORS.border} />
        <XAxis dataKey="date" tick={{ fontSize: 11, fill: CHART_COLORS.textSecondary }} tickFormatter={(d: string) => d.slice(5)} />
        <YAxis tick={{ fontSize: 11, fill: CHART_COLORS.textSecondary }} unit="%" width={44} />
        <Tooltip formatter={(value: number) => `${value.toFixed(2)}%`} />
        {metrics.map((m) => (
          <ReferenceLine
            key={`ref-${m.key}`}
            y={m.thresholdPercent}
            stroke={METRIC_COLORS[m.key]}
            strokeDasharray="4 4"
            ifOverflow="extendDomain"
          />
        ))}
        <Line type="monotone" dataKey="odr" name="ODR" stroke={METRIC_COLORS.odr} strokeWidth={2} dot={false} />
        <Line type="monotone" dataKey="lsr" name="LSR" stroke={METRIC_COLORS.lsr} strokeWidth={2} dot={false} />
        <Line
          type="monotone"
          dataKey="cancellationRate"
          name="Cancellation Rate"
          stroke={METRIC_COLORS.cancellationRate}
          strokeWidth={2}
          dot={false}
        />
      </LineChart>
    </ChartCard>
  );
};
