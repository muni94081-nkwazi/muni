import React, { useState } from 'react';

interface BuyerProtectionBadgeProps {
  coverageLimitUGX?: number;
  windowDays?: number;
}

export const BuyerProtectionBadge: React.FC<BuyerProtectionBadgeProps> = ({
  coverageLimitUGX = 10000000,
  windowDays = 30,
}) => {
  const [showModal, setShowModal] = useState(false);

  return (
    <div style={{ margin: '12px 0' }}>
      <div
        onClick={() => setShowModal(true)}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 8,
          background: '#f0fdf4',
          border: '1px solid #bbf7d0',
          padding: '8px 14px',
          borderRadius: 8,
          cursor: 'pointer',
        }}
      >
        <span style={{ fontSize: 18 }}>🛡️</span>
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#166534' }}>
            100% MUNI Buyer Protection
          </div>
          <div style={{ fontSize: 11, color: '#15803d' }}>
            {windowDays}-Day Money Back • Covered up to {coverageLimitUGX.toLocaleString()} UGX &rarr;
          </div>
        </div>
      </div>

      {/* Modal Dialog */}
      {showModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: '#fff', borderRadius: 12, width: 480, padding: 24, boxShadow: '0 12px 32px rgba(0,0,0,0.2)', fontFamily: 'system-ui' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #e2e8f0', paddingBottom: 12 }}>
              <div style={{ fontWeight: 800, fontSize: 18, color: '#166534' }}>🛡️ MUNI Buyer Protection Policy</div>
              <button onClick={() => setShowModal(false)} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer' }}>✕</button>
            </div>

            <div style={{ margin: '16px 0', fontSize: 13, color: '#334155', display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div><strong>✅ Item Not Received:</strong> Full refund if order does not arrive within guaranteed delivery date.</div>
              <div><strong>✅ Damaged or Defective:</strong> Automatic return approval & refund for items damaged in shipping.</div>
              <div><strong>✅ Not as Described:</strong> 100% money back if product differs significantly from listing photos.</div>
              <div><strong>🔒 Escrow Fund Protection:</strong> Vendor receives payout only AFTER buyer confirms delivery.</div>
            </div>

            <button
              onClick={() => setShowModal(false)}
              style={{ width: '100%', backgroundColor: '#16a34a', color: '#fff', border: 'none', borderRadius: 6, padding: 12, fontWeight: 700, cursor: 'pointer', marginTop: 12 }}
            >
              Got It! Close Policy
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
