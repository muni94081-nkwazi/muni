import React from 'react';
import { handleImageError } from '@/utils/imageFallback';
import { OptimizedImage } from '@/components/common/OptimizedImage/OptimizedImage';

interface RecommendedProduct {
  id: string;
  name: string;
  price: number;
  image: string;
  rating: number;
  currency: string;
}

// This held three invented products — named accessories at real-looking UGX
// prices, each with an invented rating to two significant figures and a
// photograph from Unsplash — and it ignored `productId` entirely, so the same
// three appeared beneath every listing on the site. Ratings in particular are
// claims other customers are supposed to have made.
//
// There is no per-product recommendation endpoint to wire this to. The real
// recommendation surface is ProductRecommendations, which is backed by an API;
// this one now renders only what a caller hands it, and nothing when that is
// empty.
interface CustomersAlsoViewedProps {
  productId: string;
  recommendations: RecommendedProduct[];
}

export const CustomersAlsoViewed: React.FC<CustomersAlsoViewedProps> = ({ recommendations }) => {
  if (recommendations.length === 0) return null;

  return (
    <div style={{ margin: '24px 0', padding: 16, background: '#f8fafc', borderRadius: 12, border: '1px solid #e2e8f0', fontFamily: 'system-ui' }}>
      <div style={{ fontWeight: 800, fontSize: 16, marginBottom: 12, color: '#0f172a' }}>
        🤖 Customers Also Viewed
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 14 }}>
        {recommendations.map((p) => (
          <div key={p.id} style={{ background: '#ffffff', border: '1px solid #cbd5e1', borderRadius: 8, padding: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
            <OptimizedImage src={p.image} alt={p.name} width={200} height={120} sizes="(max-width: 768px) 50vw, 200px" onError={handleImageError} style={{ width: '100%', height: 120, objectFit: 'cover', borderRadius: 6 }} />
            <div style={{ fontWeight: 600, fontSize: 13, color: '#1e293b' }}>{p.name}</div>
            <div style={{ fontSize: 11, color: '#eab308' }}>⭐ {p.rating} / 5.0</div>
            <div style={{ fontWeight: 700, fontSize: 14, color: '#0284c7', marginTop: 'auto' }}>
              {p.price.toLocaleString()} {p.currency}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
