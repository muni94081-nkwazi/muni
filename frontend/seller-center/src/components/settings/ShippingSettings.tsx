import React, { useState } from 'react';
import { Table } from '../common/Table/Table';

export const ShippingSettings: React.FC = () => {
  const [zones, setZones] = useState([
    { id: 1, district: 'Kampala', standard: 3000, express: 6000, active: true },
    { id: 2, district: 'Wakiso', standard: 5000, express: 10000, active: true },
    { id: 3, district: 'Mukono', standard: 8000, express: 15000, active: true },
    { id: 4, district: 'Entebbe', standard: 7000, express: 14000, active: true },
    { id: 5, district: 'Jinja', standard: 12000, express: 22000, active: false },
    { id: 6, district: 'Gulu', standard: 18000, express: 30000, active: false },
  ]);

  const toggleZone = (id: number) => {
    setZones(zones.map(z => z.id === id ? { ...z, active: !z.active } : z));
  };

  const columns = [
    { key: 'district', label: 'District' },
    { key: 'standard', label: 'Standard Fee (UGX)', render: (item: any) => item.standard.toLocaleString() },
    { key: 'express', label: 'Express Fee (UGX)', render: (item: any) => item.express.toLocaleString() },
    { 
      key: 'active', 
      label: 'Active', 
      render: (item: any) => (
        <input type="checkbox" checked={item.active} onChange={() => toggleZone(item.id)} />
      )
    }
  ];

  return (
    <div style={{ backgroundColor: '#fff', padding: '24px', borderRadius: '8px', border: '1px solid #e0e0e0', marginTop: '24px' }}>
      <h3 style={{ marginTop: 0 }}>Delivery Zones & Rates</h3>
      <Table columns={columns} data={zones} />
    </div>
  );
};
