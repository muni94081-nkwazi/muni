import React, { useState } from 'react';

export const PromotionalToolsPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'flash' | 'bogo' | 'freeship'>('flash');
  const [promoMessage, setPromoMessage] = useState('');

  const handleCreateFlashSale = (e: React.FormEvent) => {
    e.preventDefault();
    setPromoMessage('⚡ Flash Sale scheduled successfully! Countdown active on product page.');
  };

  const handleCreateBogo = (e: React.FormEvent) => {
    e.preventDefault();
    setPromoMessage('🎁 BOGO (Buy 1 Get 1) offer published successfully!');
  };

  const handleCreateFreeShipping = (e: React.FormEvent) => {
    e.preventDefault();
    setPromoMessage('🚚 Free Shipping promotion published successfully!');
  };

  return (
    <div style={{ maxWidth: 900, margin: '24px auto', padding: 20, fontFamily: 'system-ui' }}>
      <h2 style={{ fontSize: 22, margin: '0 0 16px 0', color: '#0f172a' }}>🎟️ Seller Promotional Tools Suite</h2>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 8, borderBottom: '2px solid #e2e8f0', marginBottom: 20 }}>
        <button
          onClick={() => { setActiveTab('flash'); setPromoMessage(''); }}
          style={{ padding: '10px 18px', border: 'none', borderBottom: activeTab === 'flash' ? '3px solid #0284c7' : 'none', background: 'none', fontWeight: activeTab === 'flash' ? 700 : 500, color: activeTab === 'flash' ? '#0284c7' : '#64748b', cursor: 'pointer' }}
        >
          ⚡ Flash Sale Scheduler
        </button>
        <button
          onClick={() => { setActiveTab('bogo'); setPromoMessage(''); }}
          style={{ padding: '10px 18px', border: 'none', borderBottom: activeTab === 'bogo' ? '3px solid #0284c7' : 'none', background: 'none', fontWeight: activeTab === 'bogo' ? 700 : 500, color: activeTab === 'bogo' ? '#0284c7' : '#64748b', cursor: 'pointer' }}
        >
          🎁 BOGO (Buy 1 Get 1)
        </button>
        <button
          onClick={() => { setActiveTab('freeship'); setPromoMessage(''); }}
          style={{ padding: '10px 18px', border: 'none', borderBottom: activeTab === 'freeship' ? '3px solid #0284c7' : 'none', background: 'none', fontWeight: activeTab === 'freeship' ? 700 : 500, color: activeTab === 'freeship' ? '#0284c7' : '#64748b', cursor: 'pointer' }}
        >
          🚚 Free Shipping Promo
        </button>
      </div>

      {promoMessage && (
        <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', padding: 12, borderRadius: 8, color: '#15803d', fontWeight: 600, marginBottom: 16 }}>
          {promoMessage}
        </div>
      )}

      {/* Tab Content */}
      {activeTab === 'flash' && (
        <form onSubmit={handleCreateFlashSale} style={{ background: '#fff', border: '1px solid #cbd5e1', borderRadius: 8, padding: 20, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <h3 style={{ margin: 0 }}>⚡ Schedule Flash Sale</h3>
          <input placeholder="Promo Title (e.g. Weekend Tech Flash Sale)" required style={{ padding: 8, borderRadius: 6, border: '1px solid #cbd5e1' }} />
          <input type="number" placeholder="Discount Percentage (%)" defaultValue={30} required style={{ padding: 8, borderRadius: 6, border: '1px solid #cbd5e1' }} />
          <div style={{ display: 'flex', gap: 10 }}>
            <input type="datetime-local" required style={{ flex: 1, padding: 8, borderRadius: 6, border: '1px solid #cbd5e1' }} />
            <input type="datetime-local" required style={{ flex: 1, padding: 8, borderRadius: 6, border: '1px solid #cbd5e1' }} />
          </div>
          <button type="submit" style={{ backgroundColor: '#0284c7', color: '#fff', border: 'none', borderRadius: 6, padding: 12, fontWeight: 700, cursor: 'pointer' }}>
            Schedule Flash Sale & Publish Countdown
          </button>
        </form>
      )}

      {activeTab === 'bogo' && (
        <form onSubmit={handleCreateBogo} style={{ background: '#fff', border: '1px solid #cbd5e1', borderRadius: 8, padding: 20, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <h3 style={{ margin: 0 }}>🎁 Create BOGO Offer</h3>
          <input placeholder="Product ID (e.g. phone-001)" required style={{ padding: 8, borderRadius: 6, border: '1px solid #cbd5e1' }} />
          <select style={{ padding: 8, borderRadius: 6, border: '1px solid #cbd5e1' }}>
            <option value="100">Buy 1 Get 1 FREE (100% Off)</option>
            <option value="50">Buy 1 Get 1 50% OFF</option>
          </select>
          <button type="submit" style={{ backgroundColor: '#16a34a', color: '#fff', border: 'none', borderRadius: 6, padding: 12, fontWeight: 700, cursor: 'pointer' }}>
            Publish BOGO Promotion
          </button>
        </form>
      )}

      {activeTab === 'freeship' && (
        <form onSubmit={handleCreateFreeShipping} style={{ background: '#fff', border: '1px solid #cbd5e1', borderRadius: 8, padding: 20, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <h3 style={{ margin: 0 }}>🚚 Create Free Shipping Promotion</h3>
          <input type="number" placeholder="Minimum Order Amount (UGX)" defaultValue={50000} required style={{ padding: 8, borderRadius: 6, border: '1px solid #cbd5e1' }} />
          <button type="submit" style={{ backgroundColor: '#0284c7', color: '#fff', border: 'none', borderRadius: 6, padding: 12, fontWeight: 700, cursor: 'pointer' }}>
            Activate Free Shipping Promotion
          </button>
        </form>
      )}
    </div>
  );
};
