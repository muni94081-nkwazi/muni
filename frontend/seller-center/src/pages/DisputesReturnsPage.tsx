import { useState } from 'react';

interface DisputeItem {
  id: string;
  disputeNumber: string;
  orderId: string;
  buyerName: string;
  productName: string;
  reason: string;
  amountUGX: number;
  status: 'PENDING_SELLER_ACTION' | 'UNDER_ARBITRATION' | 'RESOLVED_REFUNDED' | 'REJECTED';
  createdAt: string;
}

export function DisputesReturnsPage() {
  const [disputes, setDisputes] = useState<DisputeItem[]>([
    {
      id: 'disp-1',
      disputeNumber: 'DISP-8921',
      orderId: 'ORD-90214',
      buyerName: 'David O.',
      productName: '55" Smart TV',
      reason: 'Item arrived damaged or broken screen during transit',
      amountUGX: 2450000,
      status: 'PENDING_SELLER_ACTION',
      createdAt: '2026-08-10',
    },
    {
      id: 'disp-2',
      disputeNumber: 'DISP-9102',
      orderId: 'ORD-88120',
      buyerName: 'Grace M.',
      productName: 'Smart Fitness Watch Series 5',
      reason: 'Wrong size / color delivered',
      amountUGX: 180000,
      status: 'RESOLVED_REFUNDED',
      createdAt: '2026-08-04',
    },
  ]);

  const [notification, setNotification] = useState('');

  const handleAction = (id: string, action: 'ACCEPT' | 'REJECT' | 'PARTIAL') => {
    setDisputes(
      disputes.map((d) => {
        if (d.id === id) {
          return {
            ...d,
            status: action === 'ACCEPT' ? 'RESOLVED_REFUNDED' : 'UNDER_ARBITRATION',
          };
        }
        return d;
      })
    );
    setNotification(`Dispute ${id} updated: ${action === 'ACCEPT' ? 'Refund Authorized' : 'Escalated to MUNI Admin Arbitration'}`);
    setTimeout(() => setNotification(''), 3000);
  };

  return (
    <div style={{ padding: 'var(--space-6)' }}>
      <div style={{ marginBottom: 'var(--space-6)' }}>
        <h1 style={{ fontSize: '1.75rem', fontWeight: 800 }}>Resolution Hub — Disputes & Returns</h1>
        <p style={{ fontSize: '0.875rem', color: '#64748b', marginTop: '4px' }}>
          Manage buyer return requests, claims, and escrow release disputes
        </p>
      </div>

      {notification && (
        <div style={{ background: '#dcfce7', border: '1px solid #86efac', color: '#166534', padding: '12px 16px', borderRadius: '8px', marginBottom: '16px', fontSize: '14px', fontWeight: 600 }}>
          ✓ {notification}
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        {disputes.map((d) => (
          <div
            key={d.id}
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
                <span style={{ fontWeight: 800, color: '#2563eb', fontSize: '14px' }}>{d.disputeNumber}</span>
                <span style={{ fontSize: '12px', color: '#64748b', marginLeft: '8px' }}>Order #{d.orderId} • Buyer: {d.buyerName}</span>
              </div>
              <span
                style={{
                  background: d.status === 'PENDING_SELLER_ACTION' ? '#fef3c7' : d.status === 'RESOLVED_REFUNDED' ? '#dcfce7' : '#e0f2fe',
                  color: d.status === 'PENDING_SELLER_ACTION' ? '#b45309' : d.status === 'RESOLVED_REFUNDED' ? '#15803d' : '#0369a1',
                  padding: '4px 12px',
                  borderRadius: '12px',
                  fontSize: '12px',
                  fontWeight: 700,
                }}
              >
                {d.status.replace(/_/g, ' ')}
              </span>
            </div>

            <h3 style={{ fontSize: '16px', fontWeight: 700, marginBottom: '4px' }}>{d.productName}</h3>
            <p style={{ fontSize: '13px', color: '#475569', marginBottom: '16px' }}>
              Claim Reason: <strong>{d.reason}</strong> • Disputed Amount: <strong>UGX {d.amountUGX.toLocaleString()}</strong>
            </p>

            {d.status === 'PENDING_SELLER_ACTION' && (
              <div style={{ display: 'flex', gap: '12px' }}>
                <button
                  onClick={() => handleAction(d.id, 'ACCEPT')}
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
                  ✓ Accept Return & Issue Full Refund
                </button>
                <button
                  onClick={() => handleAction(d.id, 'REJECT')}
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
                  ✕ Contest Claim (Escalate to Admin)
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
export default DisputesReturnsPage;
