import React from 'react';

export const PerformanceMetrics: React.FC = () => {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px', marginTop: '24px' }}>
      <div style={{ backgroundColor: '#fff', padding: '20px', borderRadius: '8px', borderLeft: '4px solid #137333' }}>
        <p style={{ margin: 0, color: '#5f6368', fontSize: '0.875rem' }}>Fulfillment Rate</p>
        <h3 style={{ margin: '8px 0 0', fontSize: '1.5rem' }}>94%</h3>
      </div>
      <div style={{ backgroundColor: '#fff', padding: '20px', borderRadius: '8px', borderLeft: '4px solid #0066cc' }}>
        <p style={{ margin: 0, color: '#5f6368', fontSize: '0.875rem' }}>Avg Order Value</p>
        <h3 style={{ margin: '8px 0 0', fontSize: '1.5rem' }}>UGX 185,000</h3>
      </div>
      <div style={{ backgroundColor: '#fff', padding: '20px', borderRadius: '8px', borderLeft: '4px solid #c5221f' }}>
        <p style={{ margin: 0, color: '#5f6368', fontSize: '0.875rem' }}>Return Rate</p>
        <h3 style={{ margin: '8px 0 0', fontSize: '1.5rem' }}>2.1%</h3>
      </div>
    </div>
  );
};
