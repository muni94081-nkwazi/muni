import React, { useState } from 'react';
import { Button } from '@/components/common/Button/Button';
import { Input } from '@/components/common/Input/Input';
import { randomId } from '@/mocks/mockUtils';
import { handleImageError } from '@/utils/imageFallback';
import type { StorefrontBanner } from '@/types/storefront.types';

interface BannerDragDropProps {
  banners: StorefrontBanner[];
  onChange: (banners: StorefrontBanner[]) => void;
}

export const BannerDragDrop: React.FC<BannerDragDropProps> = ({ banners, onChange }) => {
  const [dragId, setDragId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);

  const reorder = (fromId: string, toId: string) => {
    if (fromId === toId) return;
    const list = [...banners];
    const fromIdx = list.findIndex((b) => b.id === fromId);
    const toIdx = list.findIndex((b) => b.id === toId);
    if (fromIdx === -1 || toIdx === -1) return;
    const [moved] = list.splice(fromIdx, 1);
    list.splice(toIdx, 0, moved);
    onChange(list.map((b, i) => ({ ...b, order: i })));
  };

  const updateField = (id: string, field: 'headline' | 'imageUrl' | 'linkUrl', value: string) => {
    onChange(banners.map((b) => (b.id === id ? { ...b, [field]: value } : b)));
  };

  const removeBanner = (id: string) => {
    onChange(banners.filter((b) => b.id !== id).map((b, i) => ({ ...b, order: i })));
  };

  const addBanner = () => {
    const newBanner: StorefrontBanner = {
      id: randomId('banner'),
      headline: 'New Banner',
      imageUrl: '',
      linkUrl: '',
      order: banners.length,
    };
    onChange([...banners, newBanner]);
  };

  return (
    <div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-3)' }}>
        {banners.map((banner) => (
          <div
            key={banner.id}
            draggable
            onDragStart={() => setDragId(banner.id)}
            onDragOver={(e) => {
              e.preventDefault();
              if (overId !== banner.id) setOverId(banner.id);
            }}
            onDragLeave={() => setOverId((prev) => (prev === banner.id ? null : prev))}
            onDrop={(e) => {
              e.preventDefault();
              if (dragId) reorder(dragId, banner.id);
              setDragId(null);
              setOverId(null);
            }}
            onDragEnd={() => {
              setDragId(null);
              setOverId(null);
            }}
            style={{
              display: 'flex',
              gap: 'var(--spacing-3)',
              alignItems: 'flex-start',
              padding: 'var(--spacing-3)',
              border: overId === banner.id ? '1px dashed var(--color-accent)' : '1px solid var(--color-border)',
              borderRadius: 'var(--radius-md)',
              backgroundColor: 'var(--color-surface)',
              cursor: 'grab',
              opacity: dragId === banner.id ? 0.4 : 1,
              transition: 'opacity 0.15s, border-color 0.15s',
            }}
          >
            <div style={{ fontSize: '1.25rem', color: 'var(--color-text-secondary)', paddingTop: '8px', userSelect: 'none' }} title="Drag to reorder">⠿⠿</div>
            {banner.imageUrl && (
              <img src={banner.imageUrl} alt={banner.headline} onError={handleImageError} style={{ width: 96, height: 56, objectFit: 'cover', borderRadius: 'var(--radius-sm)', flexShrink: 0 }} />
            )}
            <div style={{ flex: 1, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 'var(--spacing-3)' }}>
              <Input label="Headline" value={banner.headline} onChange={(e) => updateField(banner.id, 'headline', e.target.value)} style={{ marginBottom: 0 }} />
              <Input label="Image URL" value={banner.imageUrl} onChange={(e) => updateField(banner.id, 'imageUrl', e.target.value)} style={{ marginBottom: 0 }} />
              <Input label="Link URL" value={banner.linkUrl} onChange={(e) => updateField(banner.id, 'linkUrl', e.target.value)} style={{ marginBottom: 0 }} />
            </div>
            <Button variant="danger" size="sm" onClick={() => removeBanner(banner.id)}>Remove</Button>
          </div>
        ))}
        {banners.length === 0 && (
          <div style={{ padding: 'var(--spacing-6)', textAlign: 'center', color: 'var(--color-text-secondary)', border: '1px dashed var(--color-border)', borderRadius: 'var(--radius-md)' }}>
            No banners yet. Add one to get started.
          </div>
        )}
      </div>
      <div style={{ marginTop: 'var(--spacing-3)' }}>
        <Button variant="secondary" onClick={addBanner}>+ Add Banner</Button>
      </div>
    </div>
  );
};
