import React, { useState } from 'react';

interface PricingRuleItem {
  id: string;
  productId: string;
  productName: string;
  ruleType: 'MATCH' | 'BEAT_BY' | 'PERCENTAGE';
  minPriceFloor: number;
  currentPrice: number;
  lowestCompetitorPrice: number;
  status: string;
}

export const PriceTrackingDashboardPage: React.FC = () => {
  const [rules, setRules] = useState<PricingRuleItem[]>([
    {
      id: 'pr-1',
      productId: 'phone-001',
      productName: 'Samsung Galaxy S24 Ultra',
      ruleType: 'BEAT_BY',
      minPriceFloor: 3900000,
      currentPrice: 4090000,
      lowestCompetitorPrice: 4100000,
      status: 'ACTIVE',
    },
  ]);

  const [showCreate, setShowCreate] = useState(false);
  const [newRule, setNewRule] = useState({
    productName: '',
    ruleType: 'BEAT_BY' as const,
    minPriceFloor: 3800000,
    currentPrice: 4200000,
  });

  const handleCreateRule = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newRule.productName) return;

    const created: PricingRuleItem = {
      id: `pr-${Date.now()}`,
      productId: `prod-${Date.now()}`,
      productName: newRule.productName,
      ruleType: newRule.ruleType,
      minPriceFloor: newRule.minPriceFloor,
      currentPrice: newRule.currentPrice,
      lowestCompetitorPrice: newRule.currentPrice - 20000,
      status: 'ACTIVE',
    };

    setRules((prev) => [...prev, created]);
    setShowCreate(false);
  };

  return (
    <div style={{ maxWidth: 1000, margin: '24px auto', padding: 20, fontFamily: 'system-ui' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 22, color: '#0f172a' }}>🤖 Dynamic Pricing & Competitor Tracking Engine</h2>
          <p style={{ margin: '4px 0 0 0', fontSize: 13, color: '#64748b' }}>Automate catalog pricing using real-time competitor price scrapers & price floor guards.</p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          style={{ backgroundColor: '#0284c7', color: '#fff', border: 'none', borderRadius: 6, padding: '10px 18px', fontWeight: 700, cursor: 'pointer' }}
        >
          + Create Re-Pricing Rule
        </button>
      </div>

      {/* Rules Table */}
      <table style={{ width: '100%', borderCollapse: 'collapse', background: '#fff', border: '1px solid #cbd5e1', borderRadius: 8, overflow: 'hidden' }}>
        <thead>
          <tr style={{ background: '#f8fafc', borderBottom: '1px solid #cbd5e1', textAlign: 'left', fontSize: 13 }}>
            <th style={{ padding: 12 }}>Product Name</th>
            <th style={{ padding: 12 }}>Strategy Rule</th>
            <th style={{ padding: 12 }}>Min Price Floor</th>
            <th style={{ padding: 12 }}>Lowest Competitor</th>
            <th style={{ padding: 12 }}>Current Auto-Price</th>
            <th style={{ padding: 12 }}>Status</th>
          </tr>
        </thead>
        <tbody>
          {rules.map((r) => (
            <tr key={r.id} style={{ borderBottom: '1px solid #f1f5f9', fontSize: 13 }}>
              <td style={{ padding: 12, fontWeight: 700 }}>{r.productName}</td>
              <td style={{ padding: 12, fontWeight: 600, color: '#0284c7' }}>{r.ruleType} (10,000 UGX Cheaper)</td>
              <td style={{ padding: 12 }}>{r.minPriceFloor.toLocaleString()} UGX</td>
              <td style={{ padding: 12, color: '#b45309' }}>{r.lowestCompetitorPrice.toLocaleString()} UGX (Kikuubo Online)</td>
              <td style={{ padding: 12, fontWeight: 800, color: '#16a34a' }}>{r.currentPrice.toLocaleString()} UGX</td>
              <td style={{ padding: 12 }}>
                <span style={{ background: '#f0fdf4', color: '#15803d', fontWeight: 800, padding: '2px 8px', borderRadius: 10, fontSize: 11 }}>{r.status}</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Create Modal */}
      {showCreate && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <form onSubmit={handleCreateRule} style={{ background: '#fff', borderRadius: 12, width: 440, padding: 24, boxShadow: '0 12px 32px rgba(0,0,0,0.2)', display: 'flex', flexDirection: 'column', gap: 12 }}>
            <h3 style={{ margin: 0, fontSize: 18 }}>🤖 Create Auto Re-Pricing Rule</h3>
            <input placeholder="Product Name" required value={newRule.productName} onChange={(e) => setNewRule({ ...newRule, productName: e.target.value })} style={{ padding: 8, borderRadius: 6, border: '1px solid #cbd5e1' }} />
            <select value={newRule.ruleType} onChange={(e) => setNewRule({ ...newRule, ruleType: e.target.value as any })} style={{ padding: 8, borderRadius: 6, border: '1px solid #cbd5e1' }}>
              <option value="BEAT_BY">Beat Lowest Competitor by 10,000 UGX</option>
              <option value="MATCH">Match Lowest Competitor Price</option>
              <option value="PERCENTAGE">2% Cheaper Than Competitors</option>
            </select>
            <input type="number" placeholder="Min Price Floor Guard (UGX)" required value={newRule.minPriceFloor} onChange={(e) => setNewRule({ ...newRule, minPriceFloor: Number(e.target.value) })} style={{ padding: 8, borderRadius: 6, border: '1px solid #cbd5e1' }} />
            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
              <button type="submit" style={{ flex: 1, backgroundColor: '#0284c7', color: '#fff', border: 'none', borderRadius: 6, padding: 10, fontWeight: 700, cursor: 'pointer' }}>
                Activate Auto-Pricing Rule
              </button>
              <button type="button" onClick={() => setShowCreate(false)} style={{ background: '#f1f5f9', border: 'none', borderRadius: 6, padding: 10, cursor: 'pointer' }}>
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
