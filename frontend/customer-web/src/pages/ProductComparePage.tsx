import React from 'react';
import { handleImageError } from '@/utils/imageFallback';
import { OptimizedImage } from '@/components/common/OptimizedImage/OptimizedImage';

interface CompareItem {
  id: string;
  name: string;
  price: number;
  rating: number;
  brand: string;
  warranty: string;
  image: string;
}

// This page is not routed and has no backend: product-service exposes no
// comparison endpoint, and `warranty` is not a field on any product it
// returns. It held three invented handsets — named flagship models at
// real-looking UGX prices, with invented ratings, invented warranty terms and
// Unsplash photography — presented as a price comparison a shopper could act
// on.
//
// The items are now the caller's to supply, so nothing is compared until there
// is something real to compare. Wiring this up needs a comparison API, or at
// minimum a multi-get on the catalogue.
interface ProductComparePageProps {
  items?: CompareItem[];
}

export const ProductComparePage: React.FC<ProductComparePageProps> = ({ items = [] }) => {

  return (
    <div style={{ maxWidth: 1000, margin: '24px auto', padding: 20, fontFamily: 'system-ui' }}>
      <h2 style={{ fontSize: 22, margin: '0 0 16px 0' }}>⚖️ Product Comparison (Up to 4 Items)</h2>

      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', background: '#ffffff', border: '1px solid #cbd5e1', borderRadius: 8 }}>
          <thead>
            <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
              <th style={{ padding: 12, textAlign: 'left', width: 160 }}>Feature</th>
              {items.map((item) => (
                <th key={item.id} style={{ padding: 12, textAlign: 'center', minWidth: 200 }}>
                  <OptimizedImage src={item.image} alt={item.name} width={80} height={80} sizes="80px" onError={handleImageError} style={{ width: 80, height: 80, objectFit: 'cover', borderRadius: 6, margin: '0 auto 8px auto' }} />
                  <div style={{ fontWeight: 700, fontSize: 14 }}>{item.name}</div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr style={{ borderBottom: '1px solid #e2e8f0' }}>
              <td style={{ padding: 12, fontWeight: 600 }}>Price (UGX)</td>
              {items.map((i) => (
                <td key={i.id} style={{ padding: 12, textAlign: 'center', fontWeight: 700, color: '#0284c7' }}>
                  {i.price.toLocaleString()} UGX
                </td>
              ))}
            </tr>
            <tr style={{ borderBottom: '1px solid #e2e8f0' }}>
              <td style={{ padding: 12, fontWeight: 600 }}>Customer Rating</td>
              {items.map((i) => (
                <td key={i.id} style={{ padding: 12, textAlign: 'center', color: '#eab308', fontWeight: 700 }}>
                  ⭐ {i.rating} / 5.0
                </td>
              ))}
            </tr>
            <tr style={{ borderBottom: '1px solid #e2e8f0' }}>
              <td style={{ padding: 12, fontWeight: 600 }}>Brand</td>
              {items.map((i) => (
                <td key={i.id} style={{ padding: 12, textAlign: 'center' }}>{i.brand}</td>
              ))}
            </tr>
            <tr>
              <td style={{ padding: 12, fontWeight: 600 }}>Buyer Protection</td>
              {items.map((i) => (
                <td key={i.id} style={{ padding: 12, textAlign: 'center', color: '#16a34a', fontWeight: 700 }}>
                  🛡️ 100% Covered (30 Days)
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
};
