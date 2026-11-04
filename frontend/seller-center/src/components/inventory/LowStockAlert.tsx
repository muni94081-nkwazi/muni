import React from 'react';
import { useNavigate } from 'react-router-dom';

export const LowStockAlert: React.FC<{ count: number }> = ({ count }) => {
  const navigate = useNavigate();
  
  if (count === 0) return null;

  return (
    <div style={{ backgroundColor: '#fef7e0', border: '1px solid #f2c94c', padding: '16px', borderRadius: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
      <span style={{ color: '#b06000', fontWeight: 500 }}>⚠️ {count} products are running low on stock.</span>
      <button 
        onClick={() => navigate('/inventory?filter=low_stock')}
        style={{ background: 'none', border: 'none', color: '#b06000', textDecoration: 'underline', cursor: 'pointer' }}
      >
        View items
      </button>
    </div>
  );
};
