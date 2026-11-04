import React, { useState } from 'react';
import { handleImageError } from '@/utils/imageFallback';

interface MediaItem {
  id: string;
  reviewId: string;
  userName: string;
  productName: string;
  type: 'IMAGE' | 'VIDEO';
  url: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
}

export const ReviewMediaModerationPage: React.FC = () => {
  const [items, setItems] = useState<MediaItem[]>([
    {
      id: 'm-1',
      reviewId: 'rev-101',
      userName: 'MUNI Buyer Sarah',
      productName: 'Samsung Galaxy S24 Ultra',
      type: 'IMAGE',
      url: 'https://images.unsplash.com/photo-1610945265064-0e34e5519bbf',
      status: 'PENDING',
    },
    {
      id: 'm-2',
      reviewId: 'rev-102',
      userName: 'MUNI Buyer Alex',
      productName: 'LG 55" 4K Smart OLED TV',
      type: 'IMAGE',
      url: 'https://images.unsplash.com/photo-1593784991095-a205069470b6',
      status: 'PENDING',
    },
  ]);

  const handleModerate = (id: string, status: 'APPROVED' | 'REJECTED') => {
    setItems((prev) => prev.map((item) => (item.id === id ? { ...item, status } : item)));
  };

  return (
    <div style={{ maxWidth: 1000, margin: '24px auto', padding: 20, fontFamily: 'system-ui' }}>
      <h2 style={{ fontSize: 20, margin: '0 0 16px 0', color: '#0f172a' }}>🛡️ Review Photo & Video Media Moderation Console</h2>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
        {items.map((m) => (
          <div key={m.id} style={{ background: '#fff', border: '1px solid #cbd5e1', borderRadius: 8, overflow: 'hidden', padding: 12 }}>
            <img src={m.url} alt="Review Media" onError={handleImageError} style={{ width: '100%', height: 160, objectFit: 'cover', borderRadius: 6 }} />
            <div style={{ fontWeight: 700, fontSize: 14, marginTop: 8 }}>{m.productName}</div>
            <div style={{ fontSize: 12, color: '#64748b' }}>Uploaded by {m.userName}</div>

            <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
              {m.status === 'PENDING' ? (
                <>
                  <button onClick={() => handleModerate(m.id, 'APPROVED')} style={{ flex: 1, backgroundColor: '#16a34a', color: '#fff', border: 'none', borderRadius: 4, padding: 8, fontWeight: 700, cursor: 'pointer' }}>
                    Approve
                  </button>
                  <button onClick={() => handleModerate(m.id, 'REJECTED')} style={{ flex: 1, backgroundColor: '#ef4444', color: '#fff', border: 'none', borderRadius: 4, padding: 8, fontWeight: 700, cursor: 'pointer' }}>
                    Reject
                  </button>
                </>
              ) : (
                <div style={{ width: '100%', textAlign: 'center', fontWeight: 800, fontSize: 12, color: m.status === 'APPROVED' ? '#16a34a' : '#ef4444' }}>
                  {m.status === 'APPROVED' ? '✅ APPROVED' : '❌ REJECTED'}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
