import React, { useState } from 'react';

interface PriceAlertItem {
  id: string;
  productId: string;
  productName: string;
  targetPrice: number;
  currentPrice: number;
  currency: string;
  lastCheckedAt: string;
}

export const PriceAlertsPage: React.FC = () => {
  const [alerts, setAlerts] = useState<PriceAlertItem[]>([
    {
      id: 'pa-1',
      productId: 'phone-001',
      productName: 'Samsung Galaxy S24 Ultra',
      targetPrice: 3800000,
      currentPrice: 4200000,
      currency: 'UGX',
      lastCheckedAt: '10 min ago',
    },
    {
      id: 'pa-2',
      productId: 'tv-002',
      productName: 'LG 55" 4K Smart OLED TV',
      targetPrice: 2500000,
      currentPrice: 2800000,
      currency: 'UGX',
      lastCheckedAt: '1 hour ago',
    },
  ]);

  const handleDelete = (id: string) => {
    setAlerts((prev) => prev.filter((a) => a.id !== id));
  };

  return (
    <div style={{ maxWidth: 800, margin: '24px auto', padding: 20, fontFamily: 'system-ui' }}>
      <h2 style={{ fontSize: 22, margin: '0 0 16px 0', color: '#0f172a' }}>🔔 My Price Drop Alerts ({alerts.length})</h2>

      {alerts.length === 0 ? (
        <div style={{ padding: 32, textAlign: 'center', background: '#f8fafc', borderRadius: 8, border: '1px dashed #cbd5e1' }}>
          No active price alerts set. Browse products and click "Set Alert" to track price drops!
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {alerts.map((a) => (
            <div key={a.id} style={{ background: '#ffffff', border: '1px solid #cbd5e1', borderRadius: 8, padding: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: 15, color: '#0f172a' }}>{a.productName}</div>
                <div style={{ fontSize: 13, color: '#64748b', marginTop: 4 }}>
                  Current Price: <strong>{a.currentPrice.toLocaleString()} {a.currency}</strong> • Alert Target: <span style={{ color: '#16a34a', fontWeight: 700 }}>{a.targetPrice.toLocaleString()} {a.currency}</span>
                </div>
              </div>

              <button
                onClick={() => handleDelete(a.id)}
                style={{ backgroundColor: '#ef4444', color: '#fff', border: 'none', borderRadius: 6, padding: '8px 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
              >
                Delete Alert
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
