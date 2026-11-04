import React, { useEffect, useState } from 'react';
import { scorecardApi } from '@/api/scorecard.api';
import { useAuth } from '@/hooks/useAuth';
import type { HealthScorecard } from '@/types/scorecard.types';
import { HealthScorecardPanel } from './HealthScorecardPanel';
import { ScorecardTrendChart } from './ScorecardTrendChart';
import { PolicyAppealBox } from './PolicyAppealBox';
import { logger } from '@/utils/logger';

// Composes the Health Scorecard summary, trend chart and policy appeal box into a single
// section, owning its own data fetch so it can be dropped into DashboardPage with one line.
export const ScorecardSection: React.FC = () => {
  const { user } = useAuth();
  const sellerId = user?.id;
  const [scorecard, setScorecard] = useState<HealthScorecard | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // The scorecard is fetched by seller id, so there is nothing to ask for
    // until the session has resolved one.
    if (!sellerId) return;

    let active = true;
    setIsLoading(true);
    scorecardApi.getHealthScorecard(sellerId)
      .then((data) => {
        if (active) {
          setScorecard(data);
          setIsLoading(false);
        }
      })
      .catch((err) => {
        if (active) {
          logger.error('[ScorecardSection] Failed to load scorecard:', err);
          setIsLoading(false);
        }
      });
    return () => {
      active = false;
    };
  }, [sellerId]);

  return (
    <div style={{ marginTop: '24px' }}>
      <h2 style={{ fontSize: '1.125rem', fontWeight: 800, margin: '0 0 12px 0', color: 'var(--color-text-primary)' }}>
        Seller Performance &amp; Health Scorecard
      </h2>

      <HealthScorecardPanel scorecard={scorecard} isLoading={isLoading} />

      <div style={{ marginTop: 'var(--spacing-4)' }}>
        <ScorecardTrendChart history={scorecard?.history ?? []} metrics={scorecard?.metrics ?? []} isLoading={isLoading} />
      </div>

      <div style={{ marginTop: 'var(--spacing-4)' }}>
        <PolicyAppealBox />
      </div>
    </div>
  );
};
