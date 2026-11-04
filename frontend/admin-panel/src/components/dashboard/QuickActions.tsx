import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '../common/Button/Button';
import { Badge } from '../common/Badge/Badge';
import { ROUTES } from '@/router/routes';
import type { DashboardStats } from '@/types/dashboard.types';

interface QuickActionsProps {
  stats: DashboardStats | null;
}

// Counts come from the dashboard stats fan-out rather than being hardcoded, so
// a badge showing 12 means twelve listings are genuinely waiting.
export const QuickActions: React.FC<QuickActionsProps> = ({ stats }) => {
  const navigate = useNavigate();

  const pendingProducts = stats?.pendingProductApprovals ?? 0;
  const pendingSellers = stats?.pendingSellerVerifications ?? 0;

  return (
    <div
      style={{
        backgroundColor: 'var(--color-surface)',
        padding: 'var(--space-4)',
        borderRadius: 'var(--radius-md)',
        boxShadow: 'var(--shadow-sm)',
      }}
    >
      <h3 style={{ margin: '0 0 var(--space-4) 0' }}>Quick Actions</h3>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <Button
          variant="outline"
          fullWidth
          style={{ justifyContent: 'space-between' }}
          onClick={() => navigate(ROUTES.PRODUCTS)}
        >
          Review Pending Products <Badge variant="pending">{pendingProducts}</Badge>
        </Button>
        <Button
          variant="outline"
          fullWidth
          style={{ justifyContent: 'space-between' }}
          onClick={() => navigate(ROUTES.SELLER_VERIFICATION)}
        >
          Pending Seller Verifications <Badge variant="info">{pendingSellers}</Badge>
        </Button>
        <Button
          variant="outline"
          fullWidth
          style={{ justifyContent: 'space-between' }}
          onClick={() => navigate(ROUTES.DISPUTES)}
        >
          Open Disputes
        </Button>
        <Button
          variant="outline"
          fullWidth
          style={{ justifyContent: 'space-between' }}
          onClick={() => navigate(ROUTES.FINANCIALS)}
        >
          Withdrawal Queue
        </Button>
      </div>
    </div>
  );
};
