import React from 'react';
import { useNavigate } from 'react-router-dom';
import { DashboardStats } from '../components/dashboard/DashboardStats';
import { SalesChart } from '../components/dashboard/SalesChart';
import { RecentOrders } from '../components/dashboard/RecentOrders';
import { QuickActions } from '../components/dashboard/QuickActions';
import { PerformanceMetrics } from '../components/dashboard/PerformanceMetrics';
import { ScorecardSection } from '../components/scorecard/ScorecardSection';

export const DashboardPage: React.FC = () => {
  const navigate = useNavigate();

  return (
    <div style={{ paddingBottom: '32px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '1.75rem', fontWeight: 800 }}>Seller Operations Dashboard</h1>
          <p style={{ margin: '4px 0 0 0', fontSize: '0.875rem', color: '#64748b' }}>
            Kampala Tech Official Store • Overview of sales, active deals, buyer inquiries & orders
          </p>
        </div>

        <button
          onClick={() => navigate('/container-submissions')}
          style={{
            padding: '10px 18px',
            background: '#2563eb',
            color: '#ffffff',
            border: 'none',
            borderRadius: '20px',
            fontWeight: 800,
            fontSize: '13px',
            cursor: 'pointer',
          }}
        >
          🌟 Nominate Product for Homepage Deals
        </button>
      </div>

      {/* Trust & Verification Operational Banner */}
      <div
        style={{
          background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)',
          color: '#ffffff',
          padding: '20px 24px',
          borderRadius: '12px',
          marginBottom: '24px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <div>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', background: '#f59e0b', color: '#000000', padding: '2px 10px', borderRadius: '10px', fontSize: '11px', fontWeight: 800, textTransform: 'uppercase', marginBottom: '6px' }}>
            🏆 Gold Supplier Tier 1 Verified
          </div>
          <h3 style={{ fontSize: '16px', fontWeight: 800, margin: 0 }}>MUNI Seller Trust Score: 98.4 / 100</h3>
          <p style={{ fontSize: '12px', color: '#94a3b8', margin: '4px 0 0 0' }}>
            0 Unresolved Disputes • 99.4% On-Time Dispatch • Eligible for 100% Escrow Fast Payouts
          </p>
        </div>

        <div style={{ display: 'flex', gap: '12px' }}>
          <button
            onClick={() => navigate('/disputes-returns')}
            style={{ padding: '8px 14px', background: '#334155', color: '#fff', border: '1px solid #475569', borderRadius: '6px', fontSize: '12px', fontWeight: 700, cursor: 'pointer' }}
          >
            ⚖️ 1 Active Return Claim
          </button>
          <button
            onClick={() => navigate('/messages')}
            style={{ padding: '8px 14px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: '6px', fontSize: '12px', fontWeight: 700, cursor: 'pointer' }}
          >
            💬 2 New Messages
          </button>
        </div>
      </div>

      <QuickActions />

      <DashboardStats />

      <div style={{ display: 'flex', gap: '24px', marginTop: '24px' }}>
        <div style={{ flex: 2 }}>
          <SalesChart />
        </div>
        <div style={{ flex: 1 }}>
          <PerformanceMetrics />
        </div>
      </div>

      <div style={{ marginTop: '24px' }}>
        <RecentOrders />
      </div>

      <ScorecardSection />
    </div>
  );
};
