import React from 'react';
import { PlatformAnalytics } from '../components/analytics/PlatformAnalytics';
import { RevenueAnalytics } from '../components/analytics/RevenueAnalytics';
import { SellerAnalytics } from '../components/analytics/SellerAnalytics';
import { ReportsExport } from '../components/analytics/ReportsExport';

export const AnalyticsPage: React.FC = () => (
  <div style={{ padding: 'var(--space-4)' }}>
    <h1>Analytics</h1>
    <PlatformAnalytics />
    <RevenueAnalytics />
    <SellerAnalytics />
    <div style={{ marginTop: 'var(--space-4)' }}>
      <ReportsExport />
    </div>
  </div>
);
