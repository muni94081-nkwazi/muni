import React from 'react';
import type { HealthScorecard, ScorecardStatus } from '@/types/scorecard.types';
import { Badge } from '@/components/common/Badge/Badge';
import { LoadingState } from '@/components/common/LoadingState';
import { EmptyState } from '@/components/common/EmptyState';

interface HealthScorecardPanelProps {
  scorecard: HealthScorecard | null;
  isLoading?: boolean;
  /** Condensed inline summary (used for the Analytics page tie-in). */
  compact?: boolean;
}

const STATUS_LABEL: Record<ScorecardStatus, string> = {
  good: 'Good',
  at_risk: 'At Risk',
  critical: 'Critical',
};

const STATUS_BADGE_VARIANT: Record<ScorecardStatus, 'success' | 'warning' | 'danger'> = {
  good: 'success',
  at_risk: 'warning',
  critical: 'danger',
};

const STATUS_ACCENT: Record<ScorecardStatus, string> = {
  good: '#10b981',
  at_risk: '#f59e0b',
  critical: '#ef4444',
};

export const HealthScorecardPanel: React.FC<HealthScorecardPanelProps> = ({ scorecard, isLoading, compact }) => {
  if (isLoading) return <LoadingState message="Loading health scorecard..." />;

  if (!scorecard) {
    return (
      <EmptyState
        icon="🛡️"
        title="No scorecard data"
        description="Your performance metrics will appear here once available."
      />
    );
  }

  const hasWarning = scorecard.overallStatus !== 'good';

  if (compact) {
    return (
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--spacing-3)', alignItems: 'center' }}>
        {scorecard.metrics.map((m) => (
          <div
            key={m.key}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 'var(--spacing-2)',
              backgroundColor: 'var(--color-surface)',
              border: '1px solid var(--color-border)',
              borderRadius: 'var(--radius-md)',
              padding: '6px 12px',
            }}
          >
            <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-text-secondary)' }}>{m.label}</span>
            <span style={{ fontSize: '0.875rem', fontWeight: 700 }}>{m.valuePercent.toFixed(2)}%</span>
            <Badge variant={STATUS_BADGE_VARIANT[m.status]} label={STATUS_LABEL[m.status]} />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div>
      {hasWarning && (
        <div
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            gap: 'var(--spacing-3)',
            backgroundColor: scorecard.overallStatus === 'critical' ? '#fce8e6' : '#fef7e0',
            border: `1px solid ${scorecard.overallStatus === 'critical' ? '#f5c6c3' : '#fbe4a6'}`,
            borderRadius: 'var(--radius-md)',
            padding: 'var(--spacing-4)',
            marginBottom: 'var(--spacing-4)',
          }}
        >
          <span style={{ fontSize: '1.5rem', lineHeight: 1 }}>⚠️</span>
          <div>
            <p style={{ margin: 0, fontWeight: 700, color: scorecard.overallStatus === 'critical' ? '#c5221f' : '#b06000' }}>
              {scorecard.overallStatus === 'critical'
                ? 'Account health at risk — one or more metrics exceed policy thresholds'
                : 'Performance metrics need attention'}
            </p>
            <p style={{ margin: '4px 0 0 0', fontSize: '0.8125rem', color: 'var(--color-text-secondary)' }}>
              Review the flagged metric(s) below. If you believe a metric was flagged in error, submit a policy
              violation appeal with supporting context.
            </p>
          </div>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 'var(--spacing-4)' }}>
        {scorecard.metrics.map((m) => (
          <div
            key={m.key}
            style={{
              backgroundColor: 'var(--color-surface)',
              padding: 'var(--spacing-4)',
              borderRadius: 'var(--radius-lg)',
              boxShadow: 'var(--shadow-sm)',
              borderLeft: `4px solid ${STATUS_ACCENT[m.status]}`,
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 'var(--spacing-2)', gap: 'var(--spacing-2)' }}>
              <h4 style={{ margin: 0, fontSize: '0.8125rem', color: 'var(--color-text-secondary)', fontWeight: 600 }}>{m.label}</h4>
              <Badge variant={STATUS_BADGE_VARIANT[m.status]} label={STATUS_LABEL[m.status]} />
            </div>
            <div style={{ fontSize: '1.5rem', fontWeight: 800 }}>{m.valuePercent.toFixed(2)}%</div>
            <p style={{ margin: 'var(--spacing-2) 0 0 0', fontSize: '0.75rem', color: 'var(--color-text-secondary)' }}>
              Threshold: &lt; {m.thresholdPercent.toFixed(2)}%
            </p>
          </div>
        ))}
      </div>
    </div>
  );
};
