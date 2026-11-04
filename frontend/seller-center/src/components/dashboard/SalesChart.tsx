import React from 'react';

export const SalesChart: React.FC = () => {
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
    <div style={{ backgroundColor: '#fff', padding: '24px', borderRadius: '8px', boxShadow: '0 2px 4px rgba(0,0,0,0.05)', height: '300px', display: 'flex', flexDirection: 'column' }}>
      <h3 style={{ margin: '0 0 24px 0', fontSize: '1.1rem' }}>Sales (Last 7 Days)</h3>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', flex: 1, paddingBottom: '24px', borderBottom: '1px solid #e0e0e0' }}>
        {data.map((d, i) => (
          <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '10%' }}>
            <div style={{ height: '200px', display: 'flex', alignItems: 'flex-end', width: '100%', marginBottom: '8px' }} title={`UGX ${d.value.toLocaleString()}`}>
              <div style={{ backgroundColor: '#0066cc', width: '100%', height: d.height, borderRadius: '4px 4px 0 0', transition: 'height 0.3s ease' }}></div>
            </div>
            <span style={{ fontSize: '0.75rem', color: '#5f6368' }}>{d.day}</span>
          </div>
        ))}
      </div>
    </div>
  );
};
