import React, { useState, useEffect } from 'react';
import { productsApi } from '../../api/products.api';
import { logger } from '../../utils/logger';

export const CategoryManager: React.FC = () => {
  const [categories, setCategories] = useState<any[]>([]);

  useEffect(() => {
    productsApi.getCategories()
      .then(setCategories)
      .catch((err) => logger.error('[CategoryManager] Failed to load categories:', err));
  }, []);

  return (
    <div style={{ backgroundColor: '#fff', padding: '24px', borderRadius: '8px' }}>
      <h3 style={{ marginTop: 0 }}>Categories</h3>
      <ul style={{ listStyleType: 'none', padding: 0 }}>
        {categories.map(c => (
          <li key={c.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 0', borderBottom: '1px solid #e0e0e0' }}>
            <span>{c.name}</span>
            <span style={{ color: '#5f6368' }}>{c.count} products</span>
          </li>
        ))}
      </ul>
    </div>
  );
};
