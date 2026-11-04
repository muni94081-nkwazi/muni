import React, { useState } from 'react';

export const ArbitrationConsole: React.FC = () => {
  const [resolutionStatus, setResolutionStatus] = useState<string | null>(null);

  const handleResolve = (favor: 'buyer' | 'seller') => {
    setResolutionStatus(favor === 'buyer' ? 'RESOLVED_BUYER_FAVOR (Escrow Refunded to Buyer)' : 'RESOLVED_SELLER_FAVOR (Escrow Released to Vendor)');
  };

  return (
    <div style={{ maxWidth: 1050, margin: '20px auto', padding: 20, fontFamily: 'system-ui', background: '#fff', border: '1px solid #cbd5e1', borderRadius: 12 }}>
      <h2 style={{ fontSize: 20, margin: '0 0 16px 0', color: '#0f172a' }}>⚖️ Admin Binding Arbitration Console — Dispute #DISP-2001</h2>

      {/* 3-Panel Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16 }}>
        {/* Panel 1: Buyer Case */}
        <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: 14 }}>
          <h4 style={{ margin: '0 0 8px 0', color: '#0284c7' }}>👤 Buyer Claim & Evidence</h4>
          <div style={{ fontSize: 13, color: '#334155', display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div><strong>Buyer:</strong> MUNI Customer (user-123)</div>
            <div><strong>Issue:</strong> ITEM_NOT_RECEIVED</div>
            <div><strong>Claim:</strong> Package delivered status shows delivered, but item was not received at address.</div>
            <a href="https://muni.ug/evidence/proof1.jpg" target="_blank" rel="noreferrer" style={{ color: '#0284c7', fontSize: 12 }}>📷 View Buyer Proof Photo</a>
          </div>
        </div>

        {/* Panel 2: Seller Defense */}
        <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: 14 }}>
          <h4 style={{ margin: '0 0 8px 0', color: '#16a34a' }}>🏪 Seller Defense & SLA</h4>
          <div style={{ fontSize: 13, color: '#334155', display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div><strong>Seller:</strong> Kampala Electronics Hub</div>
            <div><strong>48h SLA Status:</strong> ✅ MET</div>
            <div><strong>Carrier Tracking:</strong> DHL Express #UG-998822</div>
            <div><strong>Seller Note:</strong> Dispatched item on Aug 10, signed by recipient gate guard.</div>
          </div>
        </div>

        {/* Panel 3: Arbitration Decision */}
        <div style={{ background: '#fffbeb', border: '1px solid #fef3c7', borderRadius: 8, padding: 14 }}>
          <h4 style={{ margin: '0 0 8px 0', color: '#b45309' }}>⚡ Admin Ruling Controls</h4>
          <div style={{ fontSize: 12, color: '#92400e', marginBottom: 12 }}>
            Your ruling is binding. Escrow funds will automatically release to winning party.
          </div>

          {!resolutionStatus ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <button
                onClick={() => handleResolve('buyer')}
                style={{ backgroundColor: '#ef4444', color: '#fff', border: 'none', borderRadius: 6, padding: 10, fontWeight: 700, cursor: 'pointer' }}
              >
                Rule in Buyer's Favor (Full Refund)
              </button>
              <button
                onClick={() => handleResolve('seller')}
                style={{ backgroundColor: '#16a34a', color: '#fff', border: 'none', borderRadius: 6, padding: 10, fontWeight: 700, cursor: 'pointer' }}
              >
                Rule in Seller's Favor (Release Funds)
              </button>
            </div>
          ) : (
            <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', padding: 10, borderRadius: 6, fontSize: 12, color: '#15803d', fontWeight: 700 }}>
              ✅ Ruling Executed: {resolutionStatus}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
