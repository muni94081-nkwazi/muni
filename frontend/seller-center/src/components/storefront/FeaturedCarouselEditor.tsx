import React, { useState } from 'react';
import { Button } from '@/components/common/Button/Button';
import { Input } from '@/components/common/Input/Input';
import { randomId } from '@/mocks/mockUtils';
import { handleImageError } from '@/utils/imageFallback';
import type { CarouselItem } from '@/types/storefront.types';

interface FeaturedCarouselEditorProps {
  items: CarouselItem[];
  onChange: (items: CarouselItem[]) => void;
}

export const FeaturedCarouselEditor: React.FC<FeaturedCarouselEditorProps> = ({ items, onChange }) => {
  const [dragId, setDragId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);

  const reorder = (fromId: string, toId: string) => {
    if (fromId === toId) return;
    const list = [...items];
    const fromIdx = list.findIndex((i) => i.id === fromId);
    const toIdx = list.findIndex((i) => i.id === toId);
    if (fromIdx === -1 || toIdx === -1) return;
    const [moved] = list.splice(fromIdx, 1);
    list.splice(toIdx, 0, moved);
    onChange(list.map((it, i) => ({ ...it, order: i })));
  };

  const updateField = (id: string, field: 'productName' | 'imageUrl', value: string) => {
    onChange(items.map((it) => (it.id === id ? { ...it, [field]: value } : it)));
  };

  const removeItem = (id: string) => {
    onChange(items.filter((it) => it.id !== id).map((it, i) => ({ ...it, order: i })));
  };

  const addItem = () => {
    const newItem: CarouselItem = {
      id: randomId('carousel'),
      productId: randomId('prod'),
      productName: 'New Featured Product',
      imageUrl: '',
      order: items.length,
    };
    onChange([...items, newItem]);
  };

  return (
    <div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-3)' }}>
        {items.map((item) => (
          <div
            key={item.id}
            draggable
            onDragStart={() => setDragId(item.id)}
            onDragOver={(e) => {
              e.preventDefault();
              if (overId !== item.id) setOverId(item.id);
            }}
            onDragLeave={() => setOverId((prev) => (prev === item.id ? null : prev))}
            onDrop={(e) => {
              e.preventDefault();
              if (dragId) reorder(dragId, item.id);
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
              border: overId === item.id ? '1px dashed var(--color-accent)' : '1px solid var(--color-border)',
              borderRadius: 'var(--radius-md)',
              backgroundColor: 'var(--color-surface)',
              cursor: 'grab',
              opacity: dragId === item.id ? 0.4 : 1,
              transition: 'opacity 0.15s, border-color 0.15s',
            }}
          >
            <div style={{ fontSize: '1.25rem', color: 'var(--color-text-secondary)', paddingTop: '8px', userSelect: 'none' }} title="Drag to reorder">⠿⠿</div>
            {item.imageUrl && (
              <img src={item.imageUrl} alt={item.productName} onError={handleImageError} style={{ width: 56, height: 56, objectFit: 'cover', borderRadius: 'var(--radius-sm)', flexShrink: 0 }} />
            )}
            <div style={{ flex: 1, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 'var(--spacing-3)' }}>
              <Input label="Product Name" value={item.productName} onChange={(e) => updateField(item.id, 'productName', e.target.value)} style={{ marginBottom: 0 }} />
              <Input label="Image URL" value={item.imageUrl} onChange={(e) => updateField(item.id, 'imageUrl', e.target.value)} style={{ marginBottom: 0 }} />
            </div>
            <div style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)', paddingTop: 'var(--spacing-2)' }}>#{item.order + 1}</div>
            <Button variant="danger" size="sm" onClick={() => removeItem(item.id)}>Remove</Button>
          </div>
        ))}
        {items.length === 0 && (
          <div style={{ padding: 'var(--spacing-6)', textAlign: 'center', color: 'var(--color-text-secondary)', border: '1px dashed var(--color-border)', borderRadius: 'var(--radius-md)' }}>
            No featured products yet. Add one to get started.
          </div>
        )}
      </div>
      <div style={{ marginTop: 'var(--spacing-3)' }}>
        <Button variant="secondary" onClick={addItem}>+ Add Featured Product</Button>
      </div>
    </div>
  );
};
