export type ScorecardStatus = 'good' | 'at_risk' | 'critical';

export interface ScorecardMetric {
  key: 'odr' | 'lsr' | 'cancellationRate';
  label: string;
  valuePercent: number;
  thresholdPercent: number;
  status: ScorecardStatus;
}

export interface HealthScorecard {
  overallStatus: ScorecardStatus;
  metrics: ScorecardMetric[];
  history: { date: string; odr: number; lsr: number; cancellationRate: number }[];
}

export type AppealStatus = 'submitted' | 'under_review' | 'approved' | 'denied';

export interface PolicyViolationAppeal {
  id: string;
  violationDescription: string;
  submittedAt: string;
  status: AppealStatus;
  sellerStatement: string;
}
