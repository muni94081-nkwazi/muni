import { useState } from 'react';

interface ContainerOption {
  id: string;
  name: string;
  type: string;
  description: string;
}

interface SellerSubmission {
  id: string;
  containerName: string;
  productId: string;
  productName: string;
  pitch: string;
  proposedPrice?: number;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  createdAt: string;
}

export function ContainerSubmissionsPage() {
  const [containers] = useState<ContainerOption[]>([
    { id: 'c-deals', name: '⚡ Limited Time Deals', type: 'DEALS', description: 'Featured in homepage daily deals carousel' },
    { id: 'c-trending', name: '🔥 Trending Products', type: 'TRENDING', description: 'Top section on buyer homepage' },
    { id: 'c-electronics', name: '💻 Electronics & Tech Spotlight', type: 'CATEGORY', description: 'Category spotlight banner section' },
  ]);

  const [submissions, setSubmissions] = useState<SellerSubmission[]>([]);

  const [selectedContainerId, setSelectedContainerId] = useState('c-deals');
  const [productId, setProductId] = useState('');
  const [productName, setProductName] = useState('');
  const [pitch, setPitch] = useState('');
  const [proposedPrice, setProposedPrice] = useState('');

  const [notification, setNotification] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!productId || !pitch) return;

    const targetContainer = containers.find((c) => c.id === selectedContainerId);

    const newSub: SellerSubmission = {
      id: `sub-${Date.now()}`,
      containerName: targetContainer ? targetContainer.name : 'Homepage Section',
      productId,
      productName: productName || `Product ${productId}`,
      pitch,
      proposedPrice: proposedPrice ? Number(proposedPrice) : undefined,
      status: 'PENDING',
      createdAt: new Date().toISOString().split('T')[0],
    };

    setSubmissions([newSub, ...submissions]);
    setNotification('Product nominated for homepage placement! MUNI Admin will evaluate your deal pitch.');
    setProductId('');
    setProductName('');
    setPitch('');
    setProposedPrice('');
    setTimeout(() => setNotification(''), 3500);
  };

  return (
    <div style={{ padding: 'var(--space-6)', maxWidth: 850 }}>
      <div style={{ marginBottom: 'var(--space-6)' }}>
        <h1 style={{ fontSize: '1.75rem', fontWeight: 800 }}>Homepage Deals & Section Placement</h1>
        <p style={{ fontSize: '0.875rem', color: '#64748b', marginTop: '4px' }}>
          Nominate your products to be featured in prime homepage containers (Flash Sales, Limited Deals, Trending)
        </p>
      </div>

      {notification && (
        <div style={{ background: '#dcfce7', border: '1px solid #86efac', color: '#166534', padding: '12px 16px', borderRadius: '8px', marginBottom: '20px', fontSize: '14px', fontWeight: 600 }}>
          ✓ {notification}
        </div>
      )}

      {/* Nomination Form */}
      <div style={{ background: '#ffffff', padding: '24px', borderRadius: '12px', border: '1px solid #e2e8f0', marginBottom: '32px' }}>
        <h3 style={{ fontSize: '16px', fontWeight: 800, marginBottom: '16px' }}>🌟 Nominate a Product for Homepage Section</h3>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: 700, marginBottom: '6px' }}>Select Target Homepage Container</label>
            <select
              value={selectedContainerId}
              onChange={(e) => setSelectedContainerId(e.target.value)}
              style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #cbd5e1' }}
            >
              {containers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} — ({c.description})
                </option>
              ))}
            </select>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 700, marginBottom: '6px' }}>Product ID</label>
              <input
                type="text"
                required
                placeholder="e.g. p-104"
                value={productId}
                onChange={(e) => setProductId(e.target.value)}
                style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #cbd5e1' }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 700, marginBottom: '6px' }}>Product Name</label>
              <input
                type="text"
                required
                placeholder="e.g. Men Running Shoes"
                value={productName}
                onChange={(e) => setProductName(e.target.value)}
                style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #cbd5e1' }}
              />
            </div>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: 700, marginBottom: '6px' }}>Proposed Promotional Discount Price (UGX)</label>
            <input
              type="number"
              placeholder="e.g. 170000"
              value={proposedPrice}
              onChange={(e) => setProposedPrice(e.target.value)}
              style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #cbd5e1' }}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: 700, marginBottom: '6px' }}>Pitch & Reason for Homepage Placement</label>
            <textarea
              rows={3}
              required
              placeholder="Describe why this product will convert well (e.g. High stock level, 15% discount for 48h, top rating)..."
              value={pitch}
              onChange={(e) => setPitch(e.target.value)}
              style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #cbd5e1' }}
            />
          </div>

          <button
            type="submit"
            style={{
              padding: '12px',
              background: '#2563eb',
              color: '#ffffff',
              border: 'none',
              borderRadius: '6px',
              fontWeight: 700,
              fontSize: '14px',
              cursor: 'pointer',
            }}
          >
            Submit Nomination for Admin Approval
          </button>
        </form>
      </div>

      {/* Nomination History */}
      <h3 style={{ fontSize: '16px', fontWeight: 800, marginBottom: '16px' }}>My Product Placement Requests ({submissions.length})</h3>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {submissions.map((s) => (
          <div key={s.id} style={{ background: '#ffffff', padding: '16px 20px', borderRadius: '10px', border: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span style={{ fontWeight: 800, fontSize: '14px' }}>{s.productName}</span>
                <span style={{ fontSize: '12px', color: '#64748b' }}>Target: {s.containerName}</span>
              </div>
              <p style={{ fontSize: '12px', color: '#475569', marginTop: '4px' }}>
                Pitch: <em>"{s.pitch}"</em> • Date: {s.createdAt}
              </p>
            </div>

            <span
              style={{
                background: s.status === 'APPROVED' ? '#dcfce7' : s.status === 'PENDING' ? '#fef3c7' : '#fee2e2',
                color: s.status === 'APPROVED' ? '#15803d' : s.status === 'PENDING' ? '#b45309' : '#991b1b',
                padding: '4px 12px',
                borderRadius: '12px',
                fontSize: '12px',
                fontWeight: 700,
              }}
            >
              {s.status}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
export default ContainerSubmissionsPage;
