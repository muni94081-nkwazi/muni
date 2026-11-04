import React from 'react';

export const CustomerAnalytics: React.FC = () => {
  return (
    <div style={{ backgroundColor: '#fff', padding: '24px', borderRadius: '8px', border: '1px solid #e0e0e0' }}>
      <h3 style={{ margin: '0 0 16px 0', fontSize: '1.1rem' }}>Customer Insights</h3>
      <div style={{ display: 'flex', gap: '24px', marginBottom: '24px' }}>
        <div style={{ flex: 1, backgroundColor: '#f8f9fa', padding: '16px', borderRadius: '8px' }}>
          <p style={{ margin: '0 0 8px 0', color: '#5f6368', fontSize: '0.875rem' }}>New Customers</p>
          <h3 style={{ margin: 0, fontSize: '1.5rem', color: '#202124' }}>42</h3>
        </div>
        <div style={{ flex: 1, backgroundColor: '#f8f9fa', padding: '16px', borderRadius: '8px' }}>
          <p style={{ margin: '0 0 8px 0', color: '#5f6368', fontSize: '0.875rem' }}>Returning Customers</p>
          <h3 style={{ margin: 0, fontSize: '1.5rem', color: '#202124' }}>68%</h3>
        </div>
        <div style={{ flex: 1, backgroundColor: '#f8f9fa', padding: '16px', borderRadius: '8px' }}>
          <p style={{ margin: '0 0 8px 0', color: '#5f6368', fontSize: '0.875rem' }}>Top District</p>
          <h3 style={{ margin: 0, fontSize: '1.5rem', color: '#202124' }}>Kampala</h3>
        </div>
      </div>

      <h4 style={{ margin: '0 0 12px 0' }}>Orders by District</h4>
      <ul style={{ listStyleType: 'none', padding: 0 }}>
        <li style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #f1f3f4' }}><span>Kampala</span><span>54%</span></li>
        <li style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #f1f3f4' }}><span>Wakiso</span><span>22%</span></li>
        <li style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #f1f3f4' }}><span>Mukono</span><span>11%</span></li>
        <li style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #f1f3f4' }}><span>Entebbe</span><span>8%</span></li>
        <li style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #f1f3f4' }}><span>Other</span><span>5%</span></li>
      </ul>
    </div>
  );
};
