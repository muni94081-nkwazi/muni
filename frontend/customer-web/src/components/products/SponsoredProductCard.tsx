import React from 'react';
import { handleImageError } from '@/utils/imageFallback';
import { OptimizedImage } from '@/components/common/OptimizedImage/OptimizedImage';

interface SponsoredProductCardProps {
  campaignId: string;
  productId: string;
  productName: string;
  /**
   * All required. These defaulted to an Unsplash photograph, a price of
   * 4,200,000 UGX and a seller called "Kampala Electronics Hub" — so a
   * sponsored placement rendered with no data still looked like a real,
   * purchasable listing from a real merchant. A paid placement in particular
   * has to be the advertiser's actual product; there is no honest default.
   */
  productImage: string;
  price: number;
  sellerName: string;
  currency?: string;
}

export const SponsoredProductCard: React.FC<SponsoredProductCardProps> = ({
  campaignId,
  productName,
  productImage,
  price,
  sellerName,
  currency = 'UGX',
}) => {
  const handleClick = async () => {
    try {
      await fetch('/api/v1/advertising/clicks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ campaignId }),
      });
    } catch {
      // Non-blocking click tracking
    }
  };

  return (
    <div
      onClick={handleClick}
      style={{
        border: '2px solid #0284c7',
        borderRadius: 8,
        padding: 12,
        background: '#f0f9ff',
        position: 'relative',
        cursor: 'pointer',
        fontFamily: 'system-ui',
      }}
    >
      <div
        style={{
          position: 'absolute',
          top: 8,
          right: 8,
          backgroundColor: '#0284c7',
          color: '#ffffff',
          fontSize: 10,
          fontWeight: 800,
          padding: '2px 6px',
          borderRadius: 4,
          letterSpacing: 0.5,
        }}
      >
        SPONSORED AD
      </div>

      <OptimizedImage src={productImage} alt={productName} width={240} height={160} sizes="(max-width: 768px) 50vw, 240px" onError={handleImageError} style={{ width: '100%', height: 160, objectFit: 'cover', borderRadius: 6 }} />

      <div style={{ fontWeight: 700, fontSize: 14, marginTop: 8, color: '#0f172a' }}>{productName}</div>
      <div style={{ fontSize: 12, color: '#64748b' }}>By {sellerName}</div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 10 }}>
        <span style={{ fontWeight: 800, fontSize: 16, color: '#0284c7' }}>
          {price.toLocaleString()} {currency}
        </span>
        <button style={{ backgroundColor: '#0284c7', color: '#fff', border: 'none', borderRadius: 4, padding: '6px 12px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
          View Deal
        </button>
      </div>
    </div>
  );
};
