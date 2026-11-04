import React, { useState } from 'react';
import { handleImageError } from '@/utils/imageFallback';
import { OptimizedImage } from '@/components/common/OptimizedImage/OptimizedImage';

interface WishlistItem {
  id: string;
  productId: string;
  productName: string;
  productImage: string;
  price: number;
}

// wishlist-service genuinely serves shared lists: a share token is redeemed on
// a deliberately public route, and getPublicWishlist filters on `isPublic` so
// nothing unshared is ever returned. What this component did instead was hold
// an invented registry — "Wedding Gift Registry" belonging to "Sarah & Alex",
// containing two named products with real-looking UGX prices and photographs
// from Unsplash — none of which belonged to anyone.
//
// The data is now the caller's to supply from that endpoint. Nothing here
// invents a list, an owner, or an item.
interface SharedWishlistViewProps {
  shareToken?: string;
  wishlistName: string;
  ownerName: string;
  items: WishlistItem[];
}

export const SharedWishlistView: React.FC<SharedWishlistViewProps> = ({
  wishlistName,
  ownerName,
  items,
}) => {

  const [copied, setCopied] = useState(false);

  const handleCopyWishlist = () => {
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div style={{ maxWidth: 800, margin: '20px auto', padding: 20, background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', fontFamily: 'system-ui' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '2px solid #f1f5f9', paddingBottom: 16 }}>
        <div>
          <span style={{ background: '#f0fdf4', color: '#166534', padding: '4px 10px', borderRadius: 12, fontSize: 11, fontWeight: 700 }}>🎁 Shared Gift Registry</span>
          <h2 style={{ margin: '8px 0 4px 0', fontSize: 22 }}>{wishlistName}</h2>
          <div style={{ fontSize: 13, color: '#64748b' }}>Created by {ownerName}</div>
        </div>
        <button
          onClick={handleCopyWishlist}
          style={{ backgroundColor: '#0284c7', color: '#fff', border: 'none', borderRadius: 6, padding: '10px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
        >
          {copied ? '✅ Wishlist Cloned!' : '📋 Copy to My Account'}
        </button>
      </div>

      <div style={{ marginTop: 20, display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 16 }}>
        {items.map((item) => (
          <div key={item.id} style={{ border: '1px solid #e2e8f0', borderRadius: 8, overflow: 'hidden', padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <OptimizedImage src={item.productImage} alt={item.productName} width={220} height={140} sizes="(max-width: 768px) 50vw, 220px" onError={handleImageError} style={{ width: '100%', height: 140, objectFit: 'cover', borderRadius: 6 }} />
            <div style={{ fontWeight: 600, fontSize: 14 }}>{item.productName}</div>
            <div style={{ fontWeight: 700, fontSize: 15, color: '#0284c7' }}>{item.price.toLocaleString()} UGX</div>
            <button style={{ backgroundColor: '#16a34a', color: '#fff', border: 'none', borderRadius: 6, padding: '8px 12px', fontWeight: 600, cursor: 'pointer', marginTop: 'auto' }}>
              🎁 Gift This Item
            </button>
          </div>
        ))}
      </div>
    </div>
  );
};
