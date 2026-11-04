import React from 'react';
import { useNavigate } from 'react-router-dom';

export const QuickActions: React.FC = () => {
  const navigate = useNavigate();

  return (
    <div style={{ background: '#ffffff', padding: '20px', borderRadius: '12px', border: '1px solid #e2e8f0', marginBottom: '24px' }}>
      <h3 style={{ fontSize: '15px', fontWeight: 800, marginBottom: '16px', color: '#0f172a' }}>⚡ Quick Seller Actions</h3>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px' }}>
        <button
          onClick={() => navigate('/products/new')}
          style={{
            padding: '14px',
            border: '1px solid #e2e8f0',
            borderRadius: '8px',
            background: '#f8fafc',
            cursor: 'pointer',
            fontWeight: 700,
            fontSize: '13px',
            textAlign: 'left',
            color: '#0f172a',
          }}
        >
          ➕ Add New Product
        </button>

        <button
          onClick={() => navigate('/container-submissions')}
          style={{
            padding: '14px',
            border: '1px solid #bfdbfe',
            borderRadius: '8px',
            background: '#eff6ff',
            cursor: 'pointer',
            fontWeight: 700,
            fontSize: '13px',
            textAlign: 'left',
            color: '#1d4ed8',
          }}
        >
          🌟 Nominate for Homepage Deals
        </button>

        <button
          onClick={() => navigate('/disputes-returns')}
          style={{
            padding: '14px',
            border: '1px solid #fde68a',
            borderRadius: '8px',
            background: '#fffbeb',
            cursor: 'pointer',
            fontWeight: 700,
            fontSize: '13px',
            textAlign: 'left',
            color: '#b45309',
          }}
        >
          ⚖️ Resolve Returns & Disputes
        </button>

        <button
          onClick={() => navigate('/messages')}
          style={{
            padding: '14px',
            border: '1px solid #e2e8f0',
            borderRadius: '8px',
            background: '#f8fafc',
            cursor: 'pointer',
            fontWeight: 700,
            fontSize: '13px',
            textAlign: 'left',
            color: '#0f172a',
          }}
        >
          💬 Buyer Messages (2 New)
        </button>

        <button
          onClick={() => navigate('/store-settings')}
          style={{
            padding: '14px',
            border: '1px solid #e2e8f0',
            borderRadius: '8px',
            background: '#f8fafc',
            cursor: 'pointer',
            fontWeight: 700,
            fontSize: '13px',
            textAlign: 'left',
            color: '#0f172a',
          }}
        >
          🏪 Storefront Customizer
        </button>

        <button
          onClick={() => navigate('/inventory')}
          style={{
            padding: '14px',
            border: '1px solid #e2e8f0',
            borderRadius: '8px',
            background: '#f8fafc',
            cursor: 'pointer',
            fontWeight: 700,
            fontSize: '13px',
            textAlign: 'left',
            color: '#0f172a',
          }}
        >
          📦 Update Stock Levels
        </button>
      </div>
    </div>
  );
};
