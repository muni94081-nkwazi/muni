import React from 'react';

export const PayoutSummary: React.FC = () => {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px', marginBottom: '24px' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px' }}>
        <div style={{ backgroundColor: '#e6f4ea', padding: '24px', borderRadius: '8px', border: '1px solid #ceead6' }}>
          <p style={{ margin: '0 0 8px 0', color: '#137333', fontSize: '0.875rem' }}>Available Balance</p>
          <h2 style={{ margin: 0, color: '#137333' }}>UGX 1,250,000</h2>
        </div>
        <div style={{ backgroundColor: '#fef7e0', padding: '24px', borderRadius: '8px', border: '1px solid #f2c94c' }}>
          <p style={{ margin: '0 0 8px 0', color: '#b06000', fontSize: '0.875rem' }}>Pending</p>
          <h2 style={{ margin: 0, color: '#b06000' }}>UGX 380,000</h2>
        </div>
        <div style={{ backgroundColor: '#e8f0fe', padding: '24px', borderRadius: '8px', border: '1px solid #d2e3fc' }}>
          <p style={{ margin: '0 0 8px 0', color: '#1967d2', fontSize: '0.875rem' }}>Total Earned</p>
          <h2 style={{ margin: 0, color: '#1967d2' }}>UGX 8,750,000</h2>
        </div>
      </div>
      <button style={{ alignSelf: 'flex-start', padding: '12px 24px', backgroundColor: '#0066cc', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}>
        Request Payout
      </button>
    </div>
  );
};
