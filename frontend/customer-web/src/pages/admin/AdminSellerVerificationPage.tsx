import { useState } from 'react';

interface SellerKYCItem {
  id: string;
  storeName: string;
  ownerName: string;
  email: string;
  phone: string;
  taxRegistrationNumber: string;
  status: 'PENDING' | 'VERIFIED' | 'REJECTED' | 'SUSPENDED';
  tier: 'BRONZE' | 'SILVER' | 'GOLD' | 'PLATINUM';
  trustScore: number;
}

export function AdminSellerVerificationPage() {
  const [sellers, setSellers] = useState<SellerKYCItem[]>([
    {
      id: 'sel-101',
      storeName: 'Kampala Electronics Hub',
      ownerName: 'Robert Mukasa',
      email: 'robert@electronics.ug',
      phone: '+256 772 112233',
      taxRegistrationNumber: 'URA-TAX-998811',
      status: 'VERIFIED',
      tier: 'GOLD',
      trustScore: 94,
    },
    {
      id: 'sel-102',
      storeName: 'Nateete Wholesale Traders',
      ownerName: 'Grace Atuhaire',
      email: 'grace@nateetetrader.com',
      phone: '+256 701 445566',
      taxRegistrationNumber: 'URA-TAX-334455',
      status: 'PENDING',
      tier: 'BRONZE',
      trustScore: 68,
    },
  ]);

  const handleUpdateStatus = (id: string, status: 'VERIFIED' | 'REJECTED' | 'SUSPENDED') => {
    setSellers((prev) => prev.map((s) => (s.id === id ? { ...s, status } : s)));
  };

  const handleUpdateTier = (id: string, tier: 'BRONZE' | 'SILVER' | 'GOLD' | 'PLATINUM') => {
    setSellers((prev) => prev.map((s) => (s.id === id ? { ...s, tier } : s)));
  };

  return (
    <div style={{ padding: 24, fontFamily: 'system-ui' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 24, color: '#0f172a' }}>🛡️ Seller Verification & KYC Moderation Console</h1>
          <p style={{ margin: '4px 0 0 0', fontSize: 13, color: '#64748b' }}>Inspect business registration certificates, verify seller KYC, manage trust badges, and override seller levels.</p>
        </div>
      </div>

      <table style={{ width: '100%', borderCollapse: 'collapse', background: '#fff', border: '1px solid #cbd5e1', borderRadius: 8, overflow: 'hidden' }}>
        <thead>
          <tr style={{ background: '#f8fafc', borderBottom: '1px solid #cbd5e1', textAlign: 'left', fontSize: 13 }}>
            <th style={{ padding: 12 }}>Store & Owner</th>
            <th style={{ padding: 12 }}>Contact</th>
            <th style={{ padding: 12 }}>URA Tax Reg No</th>
            <th style={{ padding: 12 }}>KYC Status</th>
            <th style={{ padding: 12 }}>Trust Score</th>
            <th style={{ padding: 12 }}>Seller Tier</th>
            <th style={{ padding: 12 }}>Actions</th>
          </tr>
        </thead>
        <tbody>
          {sellers.map((s) => (
            <tr key={s.id} style={{ borderBottom: '1px solid #f1f5f9', fontSize: 13 }}>
              <td style={{ padding: 12 }}>
                <div style={{ fontWeight: 700 }}>{s.storeName}</div>
                <div style={{ fontSize: 12, color: '#64748b' }}>Owner: {s.ownerName}</div>
              </td>
              <td style={{ padding: 12 }}>
                <div>{s.email}</div>
                <div style={{ fontSize: 12, color: '#64748b' }}>{s.phone}</div>
              </td>
              <td style={{ padding: 12 }}><code>{s.taxRegistrationNumber}</code></td>
              <td style={{ padding: 12 }}>
                <span style={{
                  background: s.status === 'VERIFIED' ? '#f0fdf4' : s.status === 'PENDING' ? '#fffbeb' : '#fef2f2',
                  color: s.status === 'VERIFIED' ? '#15803d' : s.status === 'PENDING' ? '#b45309' : '#b91c1c',
                  fontWeight: 800, padding: '2px 8px', borderRadius: 10, fontSize: 11,
                }}>
                  {s.status}
                </span>
              </td>
              <td style={{ padding: 12, fontWeight: 700, color: s.trustScore >= 80 ? '#16a34a' : '#b45309' }}>
                ⭐ {s.trustScore} / 100
              </td>
              <td style={{ padding: 12 }}>
                <select
                  value={s.tier}
                  onChange={(e) => handleUpdateTier(s.id, e.target.value as SellerKYCItem['tier'])}
                  style={{ padding: 4, borderRadius: 4, border: '1px solid #cbd5e1', fontSize: 12, fontWeight: 700 }}
                >
                  <option value="BRONZE">BRONZE (0% Fee Discount)</option>
                  <option value="SILVER">SILVER (1.0% Fee Discount)</option>
                  <option value="GOLD">GOLD (2.5% Fee Discount)</option>
                  <option value="PLATINUM">PLATINUM (4.0% Fee Discount)</option>
                </select>
              </td>
              <td style={{ padding: 12 }}>
                {s.status === 'PENDING' ? (
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button onClick={() => handleUpdateStatus(s.id, 'VERIFIED')} style={{ backgroundColor: '#16a34a', color: '#fff', border: 'none', borderRadius: 4, padding: '6px 10px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                      Approve KYC
                    </button>
                    <button onClick={() => handleUpdateStatus(s.id, 'REJECTED')} style={{ backgroundColor: '#ef4444', color: '#fff', border: 'none', borderRadius: 4, padding: '6px 10px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                      Reject
                    </button>
                  </div>
                ) : (
                  <button onClick={() => handleUpdateStatus(s.id, s.status === 'SUSPENDED' ? 'VERIFIED' : 'SUSPENDED')} style={{ backgroundColor: s.status === 'SUSPENDED' ? '#16a34a' : '#ef4444', color: '#fff', border: 'none', borderRadius: 4, padding: '6px 10px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                    {s.status === 'SUSPENDED' ? 'Unsuspend' : 'Suspend Vendor'}
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
