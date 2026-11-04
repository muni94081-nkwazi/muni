import { useState } from 'react';

export function AdminExecutiveDashboard() {
  const [stats] = useState({
    gmvDailyUGX: 45000000,
    gmvMonthlyUGX: 1350000000,
    platformCommissionRevenueUGX: 135000000,
    totalActiveSellers: 142,
    newSellersThisWeek: 18,
    activeBuyersCount: 12450,
    escrowLedgerHoldUGX: 185000000,
    disputeEscalationRate: 1.2, // %
    averageOrderValueUGX: 280000,
  });

  return (
    <div style={{ padding: 24, fontFamily: 'system-ui' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 24, color: '#0f172a' }}>👑 MUNI Executive Admin Dashboard</h1>
          <p style={{ margin: '4px 0 0 0', fontSize: 13, color: '#64748b' }}>Platform-wide operational analytics, financial metrics, and escrow health across all 28 microservices.</p>
        </div>
        <button style={{ backgroundColor: '#0284c7', color: '#fff', border: 'none', borderRadius: 6, padding: '10px 18px', fontWeight: 700, cursor: 'pointer' }}>
          📊 Generate Monthly Financial Audit PDF
        </button>
      </div>

      {/* Primary KPI Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 24 }}>
        <div style={{ background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: 10, padding: 16 }}>
          <div style={{ fontSize: 12, color: '#0369a1', fontWeight: 700 }}>GROSS MERCHANDISE VOLUME (GMV)</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: '#0284c7', marginTop: 4 }}>{(stats.gmvMonthlyUGX / 1000000).toFixed(1)}M UGX</div>
          <div style={{ fontSize: 11, color: '#16a34a', marginTop: 4 }}>▲ 14.8% vs last month</div>
        </div>

        <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 10, padding: 16 }}>
          <div style={{ fontSize: 12, color: '#15803d', fontWeight: 700 }}>PLATFORM COMMISSION REVENUE</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: '#16a34a', marginTop: 4 }}>{(stats.platformCommissionRevenueUGX / 1000000).toFixed(1)}M UGX</div>
          <div style={{ fontSize: 11, color: '#15803d', marginTop: 4 }}>Collected from 10% average fee</div>
        </div>

        <div style={{ background: '#fffbeb', border: '1px solid #fef3c7', borderRadius: 10, padding: 16 }}>
          <div style={{ fontSize: 12, color: '#b45309', fontWeight: 700 }}>ACTIVE ESCROW HOLDS</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: '#b45309', marginTop: 4 }}>{(stats.escrowLedgerHoldUGX / 1000000).toFixed(1)}M UGX</div>
          <div style={{ fontSize: 11, color: '#92400e', marginTop: 4 }}>Held until 7-day buyer delivery confirmation</div>
        </div>

        <div style={{ background: '#faf5ff', border: '1px solid #e9d5ff', borderRadius: 10, padding: 16 }}>
          <div style={{ fontSize: 12, color: '#6b21a8', fontWeight: 700 }}>ACTIVE SELLERS & BUYERS</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: '#7e22ce', marginTop: 4 }}>{stats.totalActiveSellers} Vendors</div>
          <div style={{ fontSize: 11, color: '#6b21a8', marginTop: 4 }}>{stats.activeBuyersCount.toLocaleString()} Active Buyers</div>
        </div>
      </div>

      {/* Secondary Operational Metrics */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16 }}>
        <div style={{ background: '#fff', border: '1px solid #cbd5e1', borderRadius: 10, padding: 18 }}>
          <h3 style={{ margin: '0 0 12px 0', fontSize: 16, color: '#0f172a' }}>⚖️ Dispute & Claim Rate</h3>
          <div style={{ fontSize: 28, fontWeight: 800, color: '#16a34a' }}>{stats.disputeEscalationRate}%</div>
          <p style={{ fontSize: 12, color: '#64748b', margin: '4px 0 0 0' }}>Dispute escalation rate remains within target &lt; 2.0% SLA threshold.</p>
        </div>

        <div style={{ background: '#fff', border: '1px solid #cbd5e1', borderRadius: 10, padding: 18 }}>
          <h3 style={{ margin: '0 0 12px 0', fontSize: 16, color: '#0f172a' }}>🛍️ Average Order Value (AOV)</h3>
          <div style={{ fontSize: 28, fontWeight: 800, color: '#0284c7' }}>{stats.averageOrderValueUGX.toLocaleString()} UGX</div>
          <p style={{ fontSize: 12, color: '#64748b', margin: '4px 0 0 0' }}>Average cart spend across consumer & wholesale checkouts.</p>
        </div>

        <div style={{ background: '#fff', border: '1px solid #cbd5e1', borderRadius: 10, padding: 18 }}>
          <h3 style={{ margin: '0 0 12px 0', fontSize: 16, color: '#0f172a' }}>🏪 New Seller Onboarding</h3>
          <div style={{ fontSize: 28, fontWeight: 800, color: '#16a34a' }}>+{stats.newSellersThisWeek} Vendors</div>
          <p style={{ fontSize: 12, color: '#64748b', margin: '4px 0 0 0' }}>18 new seller KYC applications pending verification review.</p>
        </div>
      </div>
    </div>
  );
}
