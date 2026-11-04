import React, { useState } from 'react';

interface SellerTierWidgetProps {
  /**
   * Required on purpose. This defaulted to the literal 'seller-001', so a
   * caller that forgot to pass an id would silently render another account's
   * identifier — and marketplace-service does serve tier data by seller id.
   * The component is not mounted by any route yet; whoever wires it up must
   * supply the authenticated seller's id rather than inherit a placeholder.
   */
  sellerId: string;
}

// `sellerId` is intentionally not destructured: the body still renders static
// tier figures, so consuming it here would only look like it fetched something.
// It stays on the props type so that wiring this to marketplace-service means
// passing the authenticated seller's id, not inventing one.
export const SellerTierWidget: React.FC<SellerTierWidgetProps> = () => {
  const [tierData] = useState({
    currentTier: 'GOLD',
    progressPercent: 78,
    commissionFeeReductionPercent: 2.5,
    searchBoostMultiplier: 1.25,
    nextTier: 'PLATINUM',
    ordersNeeded: 380,
    activeBenefits: [
      '2.5% Commission Fee Reduction',
      '1.25x Search Boost',
      'Gold Seller Badge',
      'Priority Customer Support',
    ],
  });

  const tierColors: Record<string, { bg: string; border: string; text: string }> = {
    BRONZE: { bg: '#fef3c7', border: '#f59e0b', text: '#92400e' },
    SILVER: { bg: '#f1f5f9', border: '#94a3b8', text: '#334155' },
    GOLD: { bg: '#fffbeb', border: '#f59e0b', text: '#b45309' },
    PLATINUM: { bg: '#f0f9ff', border: '#0284c7', text: '#0369a1' },
  };

  const colors = tierColors[tierData.currentTier] || tierColors.GOLD;

  return (
    <div style={{ background: colors.bg, border: `2px solid ${colors.border}`, borderRadius: 12, padding: 20, margin: '16px 0', fontFamily: 'system-ui' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <span style={{ fontSize: 11, fontWeight: 800, color: colors.text, textTransform: 'uppercase', letterSpacing: 1 }}>Seller Performance Level</span>
          <h2 style={{ margin: '4px 0 0 0', fontSize: 24, color: colors.text }}>⭐ {tierData.currentTier} SELLER</h2>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 18, fontWeight: 800, color: colors.text }}>-{tierData.commissionFeeReductionPercent}% Fee Discount</div>
          <div style={{ fontSize: 12, color: colors.text }}>{tierData.searchBoostMultiplier}x Search Ranking Boost</div>
        </div>
      </div>

      {/* Progress Bar */}
      <div style={{ marginTop: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, fontWeight: 600, color: colors.text, marginBottom: 4 }}>
          <span>Progress to {tierData.nextTier} Level</span>
          <span>{tierData.progressPercent}%</span>
        </div>
        <div style={{ height: 10, background: '#ffffff', borderRadius: 5, overflow: 'hidden', border: '1px solid rgba(0,0,0,0.1)' }}>
          <div style={{ width: `${tierData.progressPercent}%`, height: '100%', backgroundColor: colors.border, transition: 'width 0.5s ease' }} />
        </div>
        <div style={{ fontSize: 11, color: colors.text, marginTop: 4 }}>
          Need {tierData.ordersNeeded} more orders to unlock 4.0% commission fee reduction & Platinum badge.
        </div>
      </div>

      {/* Benefits */}
      <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px solid rgba(0,0,0,0.1)', display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        {tierData.activeBenefits.map((benefit, idx) => (
          <span key={idx} style={{ background: '#ffffff', padding: '4px 10px', borderRadius: 12, fontSize: 11, fontWeight: 700, color: colors.text }}>
            ✓ {benefit}
          </span>
        ))}
      </div>
    </div>
  );
};
