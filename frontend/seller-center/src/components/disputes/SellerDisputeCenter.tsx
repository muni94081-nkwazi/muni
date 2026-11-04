import React, { useState } from 'react';

interface DisputeItem {
  id: string;
  disputeNumber: string;
  orderId: string;
  type: string;
  description: string;
  status: string;
  sellerResponseDeadline: string;
  slaStatus: string;
}

export const SellerDisputeCenter: React.FC = () => {
  const [disputes, setDisputes] = useState<DisputeItem[]>([
    {
      id: 'disp-seed-1',
      disputeNumber: 'DISP-2001',
      orderId: 'MUNI-1001',
      type: 'ITEM_NOT_RECEIVED',
      description: 'Package was marked delivered but customer claims non-delivery.',
      status: 'OPENED',
      sellerResponseDeadline: '42 Hours Remaining',
      slaStatus: 'PENDING',
    },
  ]);

  const [replyText, setReplyText] = useState('');
  const [activeDisputeId, setActiveDisputeId] = useState<string | null>(null);

  const handleSendResponse = (id: string) => {
    if (!replyText.trim()) return;
    setDisputes((prev) =>
      prev.map((d) => (d.id === id ? { ...d, status: 'SELLER_RESPONDED', slaStatus: 'MET' } : d))
    );
    setActiveDisputeId(null);
    setReplyText('');
  };

  return (
    <div style={{ maxWidth: 900, margin: '20px auto', padding: 20, fontFamily: 'system-ui' }}>
      <h2 style={{ fontSize: 20, margin: '0 0 16px 0', color: '#0f172a' }}>⚖️ Dispute Mediation Center (48-Hour SLA)</h2>

      {disputes.map((d) => (
        <div key={d.id} style={{ background: '#fff', border: '1px solid #cbd5e1', borderRadius: 8, padding: 16, marginBottom: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #e2e8f0', paddingBottom: 10 }}>
            <div>
              <span style={{ fontWeight: 700, fontSize: 15 }}>{d.disputeNumber}</span>
              <span style={{ fontSize: 12, color: '#64748b', marginLeft: 10 }}>Order #{d.orderId}</span>
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <span style={{ background: '#fffbeb', color: '#b45309', fontSize: 11, fontWeight: 700, padding: '4px 10px', borderRadius: 12 }}>
                ⏱️ SLA: {d.sellerResponseDeadline}
              </span>
              <span style={{ background: '#f0fdf4', color: '#15803d', fontSize: 11, fontWeight: 700, padding: '4px 10px', borderRadius: 12 }}>
                {d.status}
              </span>
            </div>
          </div>

          <div style={{ margin: '12px 0', fontSize: 13, color: '#334155' }}>
            <strong>Issue:</strong> {d.type} — {d.description}
          </div>

          {d.status === 'OPENED' && (
            <div>
              {activeDisputeId === d.id ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 10 }}>
                  <textarea
                    rows={3}
                    placeholder="Provide tracking link, dispatch proof, or explanation for buyer..."
                    value={replyText}
                    onChange={(e) => setReplyText(e.target.value)}
                    style={{ width: '100%', padding: 8, borderRadius: 6, border: '1px solid #cbd5e1', fontSize: 13 }}
                  />
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button onClick={() => handleSendResponse(d.id)} style={{ backgroundColor: '#16a34a', color: '#fff', border: 'none', borderRadius: 4, padding: '8px 14px', fontWeight: 700, cursor: 'pointer' }}>
                      Submit Official Response (Satisfies 48h SLA)
                    </button>
                    <button onClick={() => setActiveDisputeId(null)} style={{ background: '#f1f5f9', border: 'none', borderRadius: 4, padding: '8px 14px', cursor: 'pointer' }}>
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <button onClick={() => setActiveDisputeId(d.id)} style={{ backgroundColor: '#0284c7', color: '#fff', border: 'none', borderRadius: 4, padding: '8px 14px', fontWeight: 700, cursor: 'pointer' }}>
                  Respond to Buyer Inquiry
                </button>
              )}
            </div>
          )}

          {d.status === 'SELLER_RESPONDED' && (
            <div style={{ color: '#16a34a', fontSize: 12, fontWeight: 700, marginTop: 8 }}>
              ✅ Response submitted to buyer & admin. 48-hour SLA met!
            </div>
          )}
        </div>
      ))}
    </div>
  );
};
