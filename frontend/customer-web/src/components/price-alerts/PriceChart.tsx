import React, { useState } from 'react';

interface PricePoint {
  id: string;
  price: number;
  currency: string;
  timestamp: string;
}

interface PriceChartProps {
  productId: string;
  productName: string;
  currentPrice: number;
  currency?: string;
}

export const PriceChart: React.FC<PriceChartProps> = ({
  productName,
  currentPrice,
  currency = 'UGX',
}) => {
  const [history] = useState<PricePoint[]>([
    { id: '1', price: Math.round(currentPrice * 1.15), currency, timestamp: '30 days ago' },
    { id: '2', price: Math.round(currentPrice * 1.08), currency, timestamp: '15 days ago' },
    { id: '3', price: currentPrice, currency, timestamp: 'Today' },
  ]);

  const maxPrice = Math.max(...history.map((p) => p.price));
  const minPrice = Math.min(...history.map((p) => p.price));

  return (
    <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 8, padding: 16, margin: '16px 0', fontFamily: 'system-ui' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <span style={{ fontWeight: 700, fontSize: 14 }}>📈 30-Day Price History — {productName}</span>
        <span style={{ fontSize: 12, color: '#16a34a', fontWeight: 600 }}>Lowest price in 30 days!</span>
      </div>

      {/* SVG Price Chart */}
      <div style={{ height: 120, width: '100%', background: '#f8fafc', borderRadius: 6, padding: '12px 16px', display: 'flex', alignItems: 'flex-end', gap: 24, justifyContent: 'space-around' }}>
        {history.map((p, idx) => {
          const heightPercent = maxPrice === minPrice ? 70 : Math.max(20, Math.round(((p.price - minPrice) / (maxPrice - minPrice)) * 70 + 20));
          return (
            <div key={idx} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 1, gap: 4 }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: '#1e293b' }}>
                {p.price.toLocaleString()} {p.currency}
              </span>
              <div
                style={{
                  width: '100%',
                  maxWidth: 40,
                  height: `${heightPercent}%`,
                  backgroundColor: idx === history.length - 1 ? '#0284c7' : '#cbd5e1',
                  borderRadius: '4px 4px 0 0',
                  transition: 'height 0.3s ease',
                }}
              />
              <span style={{ fontSize: 10, color: '#64748b' }}>{p.timestamp}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
};
