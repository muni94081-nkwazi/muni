import React, { useState } from 'react';

export const TrackingMapPage: React.FC = () => {
  const [trackingData] = useState({
    orderId: 'MUNI-1001',
    carrier: 'DHL Express Uganda',
    trackingNumber: 'DHL-UG-998822',
    agentName: 'Musa K. (DHL Rider #42)',
    agentPhone: '+256 770 123456',
    etaMinutes: 18,
    status: 'OUT_FOR_DELIVERY',
    events: [
      { id: '1', title: 'Package Dispatched from Warehouse', location: 'Kampala Hub', time: '10:15 AM' },
      { id: '2', title: 'Out for Delivery with Rider Musa K.', location: 'Entebbe Road', time: '11:42 AM' },
    ],
  });

  return (
    <div style={{ maxWidth: 900, margin: '24px auto', padding: 20, fontFamily: 'system-ui' }}>
      <h2 style={{ fontSize: 22, margin: '0 0 16px 0', color: '#0f172a' }}>🚚 Live GPS Order Tracking — #{trackingData.orderId}</h2>

      {/* Simulated Live Map */}
      <div style={{ width: '100%', height: 260, background: '#e2e8f0', borderRadius: 12, overflow: 'hidden', position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 20 }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 36 }}>📍 🛵</div>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#0369a1', marginTop: 4 }}>
            Live GPS Location: Rider Musa K. (1.2 km away)
          </div>
          <div style={{ fontSize: 12, color: '#64748b' }}>GPS Coordinates: 0.3163° N, 32.5822° E • Updated 10s ago</div>
        </div>
      </div>

      {/* Driver ETA Banner */}
      <div style={{ background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: 8, padding: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <div style={{ fontSize: 12, color: '#0369a1', fontWeight: 600 }}>ESTIMATED TIME OF ARRIVAL</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#0284c7' }}>⏱️ {trackingData.etaMinutes} Minutes</div>
          <div style={{ fontSize: 12, color: '#64748b' }}>Assigned Rider: {trackingData.agentName}</div>
        </div>
        <a href={`tel:${trackingData.agentPhone}`} style={{ backgroundColor: '#16a34a', color: '#fff', padding: '10px 16px', borderRadius: 6, textDecoration: 'none', fontWeight: 700, fontSize: 13 }}>
          📞 Call Delivery Rider
        </a>
      </div>

      {/* Timeline */}
      <h3 style={{ fontSize: 16, marginBottom: 12 }}>📋 Tracking Milestone Timeline</h3>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {trackingData.events.map((ev) => (
          <div key={ev.id} style={{ background: '#fff', border: '1px solid #cbd5e1', borderRadius: 8, padding: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ fontWeight: 700, fontSize: 14, color: '#0f172a' }}>{ev.title}</div>
              <div style={{ fontSize: 12, color: '#64748b' }}>{ev.location}</div>
            </div>
            <span style={{ fontSize: 12, fontWeight: 600, color: '#0284c7' }}>{ev.time}</span>
          </div>
        ))}
      </div>
    </div>
  );
};
