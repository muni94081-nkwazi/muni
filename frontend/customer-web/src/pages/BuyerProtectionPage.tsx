import { useState } from 'react';
import { formatMoney } from '@/utils/formatters';

interface ProtectionClaim {
  id: string;
  claimNumber: string;
  orderId: string;
  productName: string;
  reason: string;
  claimAmountUGX: number;
  status: 'FILED' | 'UNDER_REVIEW' | 'APPROVED' | 'REJECTED';
  createdAt: string;
}

export function BuyerProtectionPage() {
  const [activeTab, setActiveTab] = useState<'policy' | 'claims' | 'file'>('policy');
  
  // File Claim Form state
  const [orderId, setOrderId] = useState('');
  const [productName, setProductName] = useState('');
  const [reason, setReason] = useState('Item not received within guaranteed delivery window');
  const [claimAmount, setClaimAmount] = useState('');
  const [submitted, setSubmitted] = useState(false);

  const [userClaims, setUserClaims] = useState<ProtectionClaim[]>([
    {
      id: 'c-101',
      claimNumber: 'CLAIM-8492',
      orderId: 'ORD-99281',
      productName: 'Wireless Noise Cancelling Headphones',
      reason: 'Item arrived damaged or defective',
      claimAmountUGX: 450000,
      status: 'APPROVED',
      createdAt: '2026-08-02',
    },
    {
      id: 'c-102',
      claimNumber: 'CLAIM-9104',
      orderId: 'ORD-10492',
      productName: 'Mechanical Gaming Keyboard',
      reason: 'Item not received within guaranteed delivery window',
      claimAmountUGX: 280000,
      status: 'UNDER_REVIEW',
      createdAt: '2026-08-11',
    },
  ]);

  const handleSubmitClaim = (e: React.FormEvent) => {
    e.preventDefault();
    if (!orderId || !productName || !claimAmount) return;

    const newClaim: ProtectionClaim = {
      id: `c-${Date.now()}`,
      claimNumber: `CLAIM-${Math.floor(1000 + Math.random() * 9000)}`,
      orderId,
      productName,
      reason,
      claimAmountUGX: Number(claimAmount),
      status: 'FILED',
      createdAt: new Date().toISOString().split('T')[0],
    };

    setUserClaims([newClaim, ...userClaims]);
    setSubmitted(true);
    setTimeout(() => {
      setSubmitted(false);
      setActiveTab('claims');
      setOrderId('');
      setProductName('');
      setClaimAmount('');
    }, 2000);
  };

  return (
    <div style={{ paddingBottom: 'var(--space-8)' }}>
      {/* Header Banner */}
      <div
        style={{
          background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)',
          color: '#fff',
          padding: 'var(--space-8)',
          borderRadius: 'var(--radius-lg)',
          marginBottom: 'var(--space-6)',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        <div style={{ position: 'relative', zIndex: 2 }}>
          <div style={{ display: 'inline-block', background: '#38bdf8', color: '#0f172a', padding: '4px 12px', borderRadius: '12px', fontSize: 'var(--text-xs)', fontWeight: 800, textTransform: 'uppercase', marginBottom: 'var(--space-2)' }}>
            100% Guaranteed Protection
          </div>
          <h1 style={{ fontSize: 'var(--text-3xl)', fontWeight: 800, marginBottom: 'var(--space-2)' }}>MUNI Buyer Guarantee</h1>
          <p style={{ fontSize: 'var(--text-sm)', color: '#94a3b8', maxWidth: 650 }}>
            MUNI Buyer Protection covers your purchases with a full refund guarantee — against non-delivery, damaged items, and counterfeit goods.
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 'var(--space-3)', borderBottom: '1px solid var(--color-border)', marginBottom: 'var(--space-6)' }}>
        <button
          onClick={() => setActiveTab('policy')}
          style={{
            padding: '12px 20px',
            background: 'none',
            border: 'none',
            borderBottom: activeTab === 'policy' ? '3px solid var(--color-primary)' : '3px solid transparent',
            color: activeTab === 'policy' ? 'var(--color-primary)' : 'var(--color-text-secondary)',
            fontWeight: 700,
            fontSize: 'var(--text-sm)',
            cursor: 'pointer',
          }}
        >
          Protection Policy & Coverage
        </button>
        <button
          onClick={() => setActiveTab('claims')}
          style={{
            padding: '12px 20px',
            background: 'none',
            border: 'none',
            borderBottom: activeTab === 'claims' ? '3px solid var(--color-primary)' : '3px solid transparent',
            color: activeTab === 'claims' ? 'var(--color-primary)' : 'var(--color-text-secondary)',
            fontWeight: 700,
            fontSize: 'var(--text-sm)',
            cursor: 'pointer',
          }}
        >
          My Protection Claims ({userClaims.length})
        </button>
        <button
          onClick={() => setActiveTab('file')}
          style={{
            padding: '12px 20px',
            background: 'none',
            border: 'none',
            borderBottom: activeTab === 'file' ? '3px solid var(--color-primary)' : '3px solid transparent',
            color: activeTab === 'file' ? 'var(--color-primary)' : 'var(--color-text-secondary)',
            fontWeight: 700,
            fontSize: 'var(--text-sm)',
            cursor: 'pointer',
          }}
        >
          + File New Claim
        </button>
      </div>

      {/* Tab Content */}
      {activeTab === 'policy' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 'var(--space-4)' }}>
          <div style={{ background: 'var(--color-surface)', padding: 'var(--space-5)', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)' }}>
            <div style={{ fontSize: '2rem', marginBottom: 'var(--space-2)' }}>🚚</div>
            <h3 style={{ fontSize: 'var(--text-base)', fontWeight: 700, marginBottom: 'var(--space-2)' }}>Item Not Received</h3>
            <p style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)', lineHeight: 1.5 }}>
              If your order doesn't arrive within the guaranteed delivery estimate, MUNI will issue a 100% full refund from escrow.
            </p>
          </div>

          <div style={{ background: 'var(--color-surface)', padding: 'var(--space-5)', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)' }}>
            <div style={{ fontSize: '2rem', marginBottom: 'var(--space-2)' }}>📦</div>
            <h3 style={{ fontSize: 'var(--text-base)', fontWeight: 700, marginBottom: 'var(--space-2)' }}>Damaged or Defective</h3>
            <p style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)', lineHeight: 1.5 }}>
              If an item arrives damaged or broken, open a claim within 30 days of receipt to receive a free replacement or instant refund.
            </p>
          </div>

          <div style={{ background: 'var(--color-surface)', padding: 'var(--space-5)', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)' }}>
            <div style={{ fontSize: '2rem', marginBottom: 'var(--space-2)' }}>🛡️</div>
            <h3 style={{ fontSize: 'var(--text-base)', fontWeight: 700, marginBottom: 'var(--space-2)' }}>Escrow Payment Protection</h3>
            <p style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)', lineHeight: 1.5 }}>
              Your money is held safely in escrow until you confirm delivery and inspect the product. Sellers are paid only after buyer satisfaction.
            </p>
          </div>
        </div>
      )}

      {activeTab === 'claims' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
          {userClaims.map((claim) => (
            <div
              key={claim.id}
              style={{
                background: 'var(--color-surface)',
                padding: 'var(--space-4)',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--color-border)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', marginBottom: 'var(--space-1)' }}>
                  <span style={{ fontWeight: 800, fontSize: 'var(--text-sm)', color: 'var(--color-primary)' }}>{claim.claimNumber}</span>
                  <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)' }}>• Order #{claim.orderId}</span>
                </div>
                <h4 style={{ fontSize: 'var(--text-sm)', fontWeight: 700 }}>{claim.productName}</h4>
                <p style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)', marginTop: '4px' }}>
                  Reason: {claim.reason} • Filed on {claim.createdAt}
                </p>
              </div>

              <div style={{ textAlign: 'right' }}>
                <span
                  style={{
                    display: 'inline-block',
                    padding: '4px 12px',
                    borderRadius: '12px',
                    fontSize: 'var(--text-xs)',
                    fontWeight: 700,
                    marginBottom: 'var(--space-1)',
                    background: claim.status === 'APPROVED' ? '#dcfce7' : claim.status === 'UNDER_REVIEW' ? '#fef3c7' : '#f1f5f9',
                    color: claim.status === 'APPROVED' ? '#15803d' : claim.status === 'UNDER_REVIEW' ? '#b45309' : '#475569',
                  }}
                >
                  {claim.status.replace('_', ' ')}
                </span>
                <p style={{ fontSize: 'var(--text-sm)', fontWeight: 800 }}>{formatMoney(claim.claimAmountUGX, 'UGX')}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {activeTab === 'file' && (
        <div style={{ maxWidth: 600, background: 'var(--color-surface)', padding: 'var(--space-6)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--color-border)' }}>
          <h3 style={{ fontSize: 'var(--text-lg)', fontWeight: 800, marginBottom: 'var(--space-4)' }}>File a Buyer Protection Claim</h3>

          {submitted ? (
            <div style={{ background: '#dcfce7', border: '1px solid #86efac', color: '#166534', padding: '16px', borderRadius: 'var(--radius-md)', textAlign: 'center' }}>
              ✓ Claim submitted successfully! MUNI Protection team will evaluate your claim within 24 hours.
            </div>
          ) : (
            <form onSubmit={handleSubmitClaim} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
              <div>
                <label style={{ display: 'block', fontSize: 'var(--text-xs)', fontWeight: 700, marginBottom: '6px' }}>Order ID</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. ORD-99281"
                  value={orderId}
                  onChange={(e) => setOrderId(e.target.value)}
                  style={{ width: '100%', padding: '10px', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 'var(--text-xs)', fontWeight: 700, marginBottom: '6px' }}>Product Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Wireless Headphones"
                  value={productName}
                  onChange={(e) => setProductName(e.target.value)}
                  style={{ width: '100%', padding: '10px', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 'var(--text-xs)', fontWeight: 700, marginBottom: '6px' }}>Reason for Claim</label>
                <select
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  style={{ width: '100%', padding: '10px', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)' }}
                >
                  <option>Item not received within guaranteed delivery window</option>
                  <option>Item significantly not as described or counterfeit</option>
                  <option>Item arrived damaged or defective</option>
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 'var(--text-xs)', fontWeight: 700, marginBottom: '6px' }}>Claim Amount (UGX)</label>
                <input
                  type="number"
                  required
                  placeholder="e.g. 450000"
                  value={claimAmount}
                  onChange={(e) => setClaimAmount(e.target.value)}
                  style={{ width: '100%', padding: '10px', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)' }}
                />
              </div>

              <button
                type="submit"
                style={{
                  padding: '12px',
                  background: 'var(--color-primary)',
                  color: '#fff',
                  border: 'none',
                  borderRadius: 'var(--radius-md)',
                  fontWeight: 700,
                  fontSize: 'var(--text-sm)',
                  cursor: 'pointer',
                  marginTop: 'var(--space-2)',
                }}
              >
                Submit Protection Claim
              </button>
            </form>
          )}
        </div>
      )}
    </div>
  );
}
