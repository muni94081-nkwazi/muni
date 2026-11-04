import { useState } from 'react';
import { Tabs } from '../components/common/Tabs/Tabs';
import { ClaimsDesk } from '../components/buyerProtection/ClaimsDesk';

interface AdminClaim {
  id: string;
  claimNumber: string;
  orderId: string;
  buyerId: string;
  sellerId: string;
  productName: string;
  reason: string;
  claimAmountUGX: number;
  escrowStatus: 'HELD_IN_ESCROW' | 'REFUNDED_TO_BUYER' | 'RELEASED_TO_SELLER';
  status: 'FILED' | 'UNDER_REVIEW' | 'APPROVED' | 'REJECTED';
  createdAt: string;
}

export function BuyerProtectionAdminPage() {
  const [claims, setClaims] = useState<AdminClaim[]>([
    {
      id: 'c-101',
      claimNumber: 'CLAIM-8492',
      orderId: 'ORD-99281',
      buyerId: 'usr-441',
      sellerId: 'sel-901',
      productName: 'Wireless Noise Cancelling Headphones',
      reason: 'Item arrived damaged or defective',
      claimAmountUGX: 450000,
      escrowStatus: 'REFUNDED_TO_BUYER',
      status: 'APPROVED',
      createdAt: '2026-08-02',
    },
    {
      id: 'c-102',
      claimNumber: 'CLAIM-9104',
      orderId: 'ORD-10492',
      buyerId: 'usr-582',
      sellerId: 'sel-902',
      productName: 'Mechanical Gaming Keyboard',
      reason: 'Item not received within guaranteed delivery window',
      claimAmountUGX: 280000,
      escrowStatus: 'HELD_IN_ESCROW',
      status: 'UNDER_REVIEW',
      createdAt: '2026-08-11',
    },
  ]);

  const [notification, setNotification] = useState('');
  const [activeTab, setActiveTab] = useState<'claims-desk' | 'escrow-arbitration'>('claims-desk');

  const handleArbitrate = (id: string, decision: 'APPROVED' | 'REJECTED') => {
    setClaims(
      claims.map((c) => {
        if (c.id === id) {
          return {
            ...c,
            status: decision,
            escrowStatus: decision === 'APPROVED' ? 'REFUNDED_TO_BUYER' : 'RELEASED_TO_SELLER',
          };
        }
        return c;
      })
    );

    setNotification(`Claim ${id} arbitrated: ${decision === 'APPROVED' ? 'Escrow refunded to Buyer' : 'Escrow released to Seller'}`);
    setTimeout(() => setNotification(''), 3500);
  };

  return (
    <div style={{ padding: 'var(--space-6)' }}>
      <div style={{ marginBottom: 'var(--space-6)' }}>
        <h1 style={{ fontSize: '1.75rem', fontWeight: 800 }}>Buyer Protection Tribunal</h1>
        <p style={{ fontSize: '0.875rem', color: '#64748b', marginTop: '4px' }}>
          Evaluate buyer claims, review evidence, and issue refund / chargeback decisions
        </p>
      </div>

      <div style={{ marginBottom: 'var(--space-4)' }}>
        <Tabs
          tabs={[
            { key: 'claims-desk', label: '🛡️ Claims Desk' },
            { key: 'escrow-arbitration', label: '🔒 Legacy Escrow Arbitration' },
          ]}
          activeKey={activeTab}
          onChange={(key) => setActiveTab(key as 'claims-desk' | 'escrow-arbitration')}
        />
      </div>

      {activeTab === 'claims-desk' && <ClaimsDesk />}

      {activeTab === 'escrow-arbitration' && (
        <>
          {notification && (
            <div style={{ background: '#dcfce7', border: '1px solid #86efac', color: '#166534', padding: '12px 16px', borderRadius: '8px', marginBottom: '20px', fontSize: '14px', fontWeight: 600 }}>
              ✓ {notification}
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {claims.map((c) => (
          <div
            key={c.id}
            style={{
              background: '#ffffff',
              padding: '20px',
              borderRadius: '12px',
              border: '1px solid #e2e8f0',
              boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
              <div>
                <span style={{ fontWeight: 800, color: '#2563eb', fontSize: '14px' }}>{c.claimNumber}</span>
                <span style={{ fontSize: '12px', color: '#64748b', marginLeft: '10px' }}>
                  Order #{c.orderId} • Buyer: {c.buyerId} • Seller: {c.sellerId}
                </span>
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <span style={{ background: '#e0f2fe', color: '#0369a1', padding: '4px 10px', borderRadius: '12px', fontSize: '11px', fontWeight: 700 }}>
                  🔒 {c.escrowStatus.replace(/_/g, ' ')}
                </span>
                <span style={{ background: c.status === 'APPROVED' ? '#dcfce7' : '#fef3c7', color: c.status === 'APPROVED' ? '#15803d' : '#b45309', padding: '4px 10px', borderRadius: '12px', fontSize: '11px', fontWeight: 700 }}>
                  {c.status}
                </span>
              </div>
            </div>

            <h3 style={{ fontSize: '15px', fontWeight: 700, marginBottom: '4px' }}>{c.productName}</h3>
            <p style={{ fontSize: '13px', color: '#475569', marginBottom: '16px' }}>
              Claim Reason: <strong>{c.reason}</strong> • Claim Amount: <strong>UGX {c.claimAmountUGX.toLocaleString()}</strong>
            </p>

            {c.status === 'UNDER_REVIEW' && (
              <div style={{ display: 'flex', gap: '12px' }}>
                <button
                  onClick={() => handleArbitrate(c.id, 'APPROVED')}
                  style={{
                    padding: '8px 16px',
                    background: '#16a34a',
                    color: '#fff',
                    border: 'none',
                    borderRadius: '6px',
                    fontSize: '12px',
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  ✓ Approve Claim & Refund Escrow to Buyer
                </button>
                <button
                  onClick={() => handleArbitrate(c.id, 'REJECTED')}
                  style={{
                    padding: '8px 16px',
                    background: '#ef4444',
                    color: '#fff',
                    border: 'none',
                    borderRadius: '6px',
                    fontSize: '12px',
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  ✕ Reject Claim & Release Funds to Seller
                </button>
              </div>
            )}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
export default BuyerProtectionAdminPage;
