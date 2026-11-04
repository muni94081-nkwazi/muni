import { useState } from 'react';

interface FraudCase {
  id: string;
  orderId: string;
  customerName: string;
  amountUGX: number;
  riskScore: number;
  decision: 'REVIEW' | 'ALLOW' | 'BLOCK';
  triggeredRules: string[];
  ipAddress: string;
  vpnDetected: boolean;
  createdAt: string;
}

export function AdminFraudModerationPage() {
  const [cases, setCases] = useState<FraudCase[]>([
    {
      id: 'fraud-101',
      orderId: 'MUNI-99882',
      customerName: 'Anonymous Buyer',
      amountUGX: 4200000,
      riskScore: 75,
      decision: 'REVIEW',
      triggeredRules: ['NEW_ACCOUNT', 'HIGH_VALUE_ORDER', 'VPN_PROXY', 'RAPID_ORDERS'],
      ipAddress: '197.239.12.88',
      vpnDetected: true,
      createdAt: '12 min ago',
    },
    {
      id: 'fraud-102',
      orderId: 'MUNI-99885',
      customerName: 'David O.',
      amountUGX: 280000,
      riskScore: 45,
      decision: 'REVIEW',
      triggeredRules: ['ADDRESS_MISMATCH', 'ROUND_AMOUNT'],
      ipAddress: '41.210.140.12',
      vpnDetected: false,
      createdAt: '35 min ago',
    },
  ]);

  const handleDecision = (id: string, decision: 'ALLOW' | 'BLOCK') => {
    setCases((prev) => prev.map((c) => (c.id === id ? { ...c, decision } : c)));
  };

  return (
    <div style={{ padding: 24, fontFamily: 'system-ui' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 24, color: '#0f172a' }}>🚨 Fraud & Risk Detection Moderation Queue</h1>
          <p style={{ margin: '4px 0 0 0', fontSize: 13, color: '#64748b' }}>Rule-based order risk scoring (0-100), high-value velocity checks, VPN flags, and manual case review.</p>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {cases.map((c) => (
          <div key={c.id} style={{ background: '#fff', border: '1px solid #cbd5e1', borderRadius: 8, padding: 18 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #e2e8f0', paddingBottom: 10 }}>
              <div>
                <span style={{ fontWeight: 700, fontSize: 16 }}>Order #{c.orderId}</span>
                <span style={{ fontSize: 13, color: '#64748b', marginLeft: 10 }}>Customer: {c.customerName}</span>
              </div>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                <span style={{
                  background: c.riskScore >= 60 ? '#fef2f2' : '#fffbeb',
                  color: c.riskScore >= 60 ? '#b91c1c' : '#b45309',
                  fontWeight: 800, padding: '4px 10px', borderRadius: 12, fontSize: 12,
                }}>
                  RISK SCORE: {c.riskScore} / 100
                </span>
                <span style={{ background: '#f0fdf4', color: '#15803d', fontWeight: 800, padding: '4px 10px', borderRadius: 12, fontSize: 12 }}>
                  {c.decision}
                </span>
              </div>
            </div>

            <div style={{ margin: '14px 0', display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, fontSize: 13, color: '#334155' }}>
              <div><strong>Order Amount:</strong> {c.amountUGX.toLocaleString()} UGX</div>
              <div><strong>IP Address:</strong> <code>{c.ipAddress}</code> {c.vpnDetected && <span style={{ color: '#b91c1c', fontWeight: 700 }}>(VPN Flagged)</span>}</div>
              <div><strong>Queued:</strong> {c.createdAt}</div>
            </div>

            {/* Triggered Rules */}
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#64748b', marginBottom: 4 }}>TRIGGERED FRAUD RULES:</div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {c.triggeredRules.map((rule, idx) => (
                  <span key={idx} style={{ background: '#fef2f2', color: '#991b1b', border: '1px solid #fca5a5', padding: '2px 8px', borderRadius: 6, fontSize: 11, fontWeight: 700 }}>
                    ⚠️ {rule}
                  </span>
                ))}
              </div>
            </div>

            {/* Action Buttons */}
            {c.decision === 'REVIEW' && (
              <div style={{ display: 'flex', gap: 10 }}>
                <button onClick={() => handleDecision(c.id, 'ALLOW')} style={{ backgroundColor: '#16a34a', color: '#fff', border: 'none', borderRadius: 6, padding: '8px 16px', fontWeight: 700, cursor: 'pointer' }}>
                  ✅ Clear & Approve Order
                </button>
                <button onClick={() => handleDecision(c.id, 'BLOCK')} style={{ backgroundColor: '#ef4444', color: '#fff', border: 'none', borderRadius: 6, padding: '8px 16px', fontWeight: 700, cursor: 'pointer' }}>
                  🚫 Block Transaction & Cancel Order
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
