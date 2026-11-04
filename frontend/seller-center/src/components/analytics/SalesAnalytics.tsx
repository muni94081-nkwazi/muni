import React from 'react';

export const SalesAnalytics: React.FC = () => {
  const data = [
    { day: 'Mon', value: 450000, height: '45%' },
    { day: 'Tue', value: 380000, height: '38%' },
    { day: 'Wed', value: 620000, height: '62%' },
    { day: 'Thu', value: 290000, height: '29%' },
    { day: 'Fri', value: 710000, height: '71%' },
    { day: 'Sat', value: 890000, height: '89%' },
    { day: 'Sun', value: 540000, height: '54%' },
  ];

  return (
    <div style={{ backgroundColor: '#fff', padding: '24px', borderRadius: '8px', boxShadow: '0 2px 4px rgba(0,0,0,0.05)', marginBottom: '24px' }}>
      <h3 style={{ margin: '0 0 16px 0', fontSize: '1.25rem' }}>Sales (Last 30 Days)</h3>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px', marginBottom: '24px' }}>
        <div style={{ backgroundColor: '#f1f3f4', padding: '16px', borderRadius: '8px' }}>
          <p style={{ margin: '0 0 8px 0', color: '#5f6368', fontSize: '0.875rem' }}>Total Revenue</p>
          <h3 style={{ margin: 0, fontSize: '1.5rem', color: '#202124' }}>UGX 12.4M</h3>
        </div>
        <div style={{ backgroundColor: '#e6f4ea', padding: '16px', borderRadius: '8px' }}>
          <p style={{ margin: '0 0 8px 0', color: '#137333', fontSize: '0.875rem' }}>Growth</p>
          <h3 style={{ margin: 0, fontSize: '1.5rem', color: '#137333' }}>+18%</h3>
        </div>
        <div style={{ backgroundColor: '#f8f9fa', padding: '16px', borderRadius: '8px' }}>
          <p style={{ margin: '0 0 8px 0', color: '#5f6368', fontSize: '0.875rem' }}>Avg Daily</p>
          <h3 style={{ margin: 0, fontSize: '1.5rem', color: '#202124' }}>UGX 413,000</h3>
        </div>
      </div>
      
      <div style={{ height: '250px', display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', paddingBottom: '24px', borderBottom: '1px solid #e0e0e0', marginTop: '24px' }}>
        {data.map((d, i) => (
          <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '10%' }}>
            <div style={{ height: '200px', display: 'flex', alignItems: 'flex-end', width: '100%', marginBottom: '8px' }}>
              <div style={{ backgroundColor: '#0066cc', width: '100%', height: d.height, borderRadius: '4px 4px 0 0', transition: 'height 0.3s ease' }}></div>
            </div>
            <span style={{ fontSize: '0.75rem', color: '#5f6368' }}>{d.day}</span>
          </div>
        ))}
      </div>
    </div>
  );
};
