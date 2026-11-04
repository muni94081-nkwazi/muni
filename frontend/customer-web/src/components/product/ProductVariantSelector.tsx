import React, { useState } from 'react';

export interface VariantOption {
  id: string;
  label: string; // e.g. "Titanium Black / 256GB"
  color?: string;
  size?: string;
  material?: string;
  price: number;
  stock: number;
}

interface ProductVariantSelectorProps {
  variants?: VariantOption[];
  onSelectVariant?: (variant: VariantOption) => void;
  currency?: string;
}

export const ProductVariantSelector: React.FC<ProductVariantSelectorProps> = ({
  variants = [],
  onSelectVariant,
  currency = 'UGX',
}) => {
  const [selectedId, setSelectedId] = useState(variants[0]?.id || '');

  if (variants.length === 0) return null;

  const handleSelect = (v: VariantOption) => {
    if (v.stock === 0) return;
    setSelectedId(v.id);
    if (onSelectVariant) onSelectVariant(v);
  };

  return (
    <div style={{ margin: '16px 0', fontFamily: 'system-ui' }}>
      <div style={{ fontWeight: 700, fontSize: 13, color: '#334155', marginBottom: 8 }}>
        SELECT VARIANT (COLOR / CAPACITY):
      </div>

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        {variants.map((v) => {
          const isSelected = selectedId === v.id;
          const isOutOfStock = v.stock === 0;

          return (
            <button
              key={v.id}
              onClick={() => handleSelect(v)}
              disabled={isOutOfStock}
              style={{
                border: isSelected ? '2px solid #0284c7' : '1px solid #cbd5e1',
                backgroundColor: isSelected ? '#f0f9ff' : isOutOfStock ? '#f1f5f9' : '#ffffff',
                color: isOutOfStock ? '#94a3b8' : '#0f172a',
                padding: '8px 14px',
                borderRadius: 8,
                fontSize: 13,
                fontWeight: isSelected ? 700 : 500,
                cursor: isOutOfStock ? 'not-allowed' : 'pointer',
                opacity: isOutOfStock ? 0.6 : 1,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'flex-start',
                gap: 2,
              }}
            >
              <span>{v.label}</span>
              <span style={{ fontSize: 11, color: isSelected ? '#0284c7' : '#64748b' }}>
                {v.price.toLocaleString()} {currency} {isOutOfStock ? '(Out of Stock)' : `(${v.stock} left)`}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
};
