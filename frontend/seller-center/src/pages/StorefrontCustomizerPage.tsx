import { useEffect, useState } from 'react';
import { Button } from '@/components/common/Button/Button';
import { LoadingState } from '@/components/common/LoadingState';
import { BannerDragDrop } from '@/components/storefront/BannerDragDrop';
import { CustomUrlField } from '@/components/storefront/CustomUrlField';
import { FeaturedCarouselEditor } from '@/components/storefront/FeaturedCarouselEditor';
import { storefrontApi } from '@/api/storefront.api';
import type { CarouselItem, StorefrontBanner, StorefrontConfig } from '@/types/storefront.types';
import { logger } from '@/utils/logger';

export function StorefrontCustomizerPage() {
  const [storeName, setStoreName] = useState('Kampala Tech Official Store');
  const [tagline, setTagline] = useState('Premier Authorized Electronics & Smart Devices Distributor');
  const [bannerUrl, setBannerUrl] = useState('https://images.unsplash.com/photo-1526738549149-8e07eca6c147?w=1200&q=80');
  const [logoUrl, setLogoUrl] = useState('https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=200&q=80');
  const [businessTaxId, setBusinessTaxId] = useState('TIN-992014-UG');
  const [returnPolicyDays, setReturnPolicyDays] = useState(30);

  const [verificationStatus, setVerificationStatus] = useState<'UNVERIFIED' | 'PENDING_AUDIT' | 'GOLD_SUPPLIER'>('GOLD_SUPPLIER');
  const [notification, setNotification] = useState('');

  // Sponsored/promotional storefront config: banners, featured product carousel, custom URL slug.
  const [config, setConfig] = useState<StorefrontConfig | null>(null);
  const [isConfigLoading, setIsConfigLoading] = useState(true);
  const [isConfigSaving, setIsConfigSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function loadConfig() {
      setIsConfigLoading(true);
      try {
        const data = await storefrontApi.getConfig();
        if (cancelled) return;
        setConfig(data);
      } catch (err) {
        if (!cancelled) logger.error('[StorefrontCustomizerPage] Failed to load config:', err);
      } finally {
        if (!cancelled) setIsConfigLoading(false);
      }
    }
    void loadConfig();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    setNotification('Storefront settings updated successfully! Changes published to MUNI Customer Web.');
    setTimeout(() => setNotification(''), 3000);
  };

  const handleApplyVerification = () => {
    setVerificationStatus('PENDING_AUDIT');
    setNotification('Verification request & business documents submitted for MUNI Admin KYB review.');
    setTimeout(() => setNotification(''), 3500);
  };

  const handleBannersChange = (banners: StorefrontBanner[]) => {
    setConfig((prev) => (prev ? { ...prev, banners } : prev));
  };

  const handleCarouselChange = (carousel: CarouselItem[]) => {
    setConfig((prev) => (prev ? { ...prev, carousel } : prev));
  };

  const handleSlugChange = (customUrlSlug: string) => {
    setConfig((prev) => (prev ? { ...prev, customUrlSlug } : prev));
  };

  const handleSaveConfig = async () => {
    if (!config) return;
    setIsConfigSaving(true);
    try {
      const saved = await storefrontApi.saveConfig(config);
      setConfig(saved);
      setNotification('Banners, featured carousel & custom URL published to MUNI Customer Web.');
      setTimeout(() => setNotification(''), 3000);
    } catch (err) {
      logger.error('[StorefrontCustomizerPage] Failed to save config:', err);
      setNotification('Failed to save storefront settings. Please try again.');
      setTimeout(() => setNotification(''), 3000);
    } finally {
      setIsConfigSaving(false);
    }
  };

  return (
    <div style={{ padding: 'var(--space-6)', maxWidth: 800 }}>
      <div style={{ marginBottom: 'var(--space-6)' }}>
        <h1 style={{ fontSize: '1.75rem', fontWeight: 800 }}>Storefront & Brand Management</h1>
        <p style={{ fontSize: '0.875rem', color: '#64748b', marginTop: '4px' }}>
          Customize your public seller profile, brand banner, policies and verification tier
        </p>
      </div>

      {notification && (
        <div style={{ background: '#dcfce7', border: '1px solid #86efac', color: '#166534', padding: '12px 16px', borderRadius: '8px', marginBottom: '20px', fontSize: '14px', fontWeight: 600 }}>
          ✓ {notification}
        </div>
      )}

      {/* Gold Supplier Verification Box */}
      <div
        style={{
          background: 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)',
          color: '#ffffff',
          padding: '20px',
          borderRadius: '12px',
          marginBottom: '24px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <div>
          <div style={{ display: 'inline-block', background: '#f59e0b', color: '#000', padding: '2px 10px', borderRadius: '10px', fontSize: '11px', fontWeight: 800, textTransform: 'uppercase', marginBottom: '6px' }}>
            Trust & Verification
          </div>
          <h3 style={{ fontSize: '16px', fontWeight: 800 }}>MUNI Seller Verification Tier</h3>
          <p style={{ fontSize: '12px', color: '#94a3b8', marginTop: '4px' }}>
            Current Status: <strong>{verificationStatus === 'GOLD_SUPPLIER' ? '🏆 Gold Supplier Tier 1' : verificationStatus === 'PENDING_AUDIT' ? '⏳ Pending Admin KYB Audit' : 'Unverified'}</strong>
          </p>
        </div>

        {verificationStatus === 'UNVERIFIED' && (
          <button
            onClick={handleApplyVerification}
            style={{
              padding: '10px 18px',
              background: '#f59e0b',
              color: '#000',
              border: 'none',
              borderRadius: '20px',
              fontWeight: 800,
              fontSize: '12px',
              cursor: 'pointer',
            }}
          >
            Apply for Gold Supplier Badge
          </button>
        )}
      </div>

      <form onSubmit={handleSave} style={{ background: '#ffffff', padding: '24px', borderRadius: '12px', border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <div>
          <label style={{ display: 'block', fontSize: '13px', fontWeight: 700, marginBottom: '6px' }}>Store Name</label>
          <input
            type="text"
            required
            value={storeName}
            onChange={(e) => setStoreName(e.target.value)}
            style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #cbd5e1' }}
          />
        </div>

        <div>
          <label style={{ display: 'block', fontSize: '13px', fontWeight: 700, marginBottom: '6px' }}>Brand Tagline</label>
          <input
            type="text"
            value={tagline}
            onChange={(e) => setTagline(e.target.value)}
            style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #cbd5e1' }}
          />
        </div>

        <div>
          <label style={{ display: 'block', fontSize: '13px', fontWeight: 700, marginBottom: '6px' }}>Store Banner Image URL</label>
          <input
            type="text"
            value={bannerUrl}
            onChange={(e) => setBannerUrl(e.target.value)}
            style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #cbd5e1' }}
          />
        </div>

        <div>
          <label style={{ display: 'block', fontSize: '13px', fontWeight: 700, marginBottom: '6px' }}>Store Logo Image URL</label>
          <input
            type="text"
            value={logoUrl}
            onChange={(e) => setLogoUrl(e.target.value)}
            style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #cbd5e1' }}
          />
        </div>

        <div>
          <label style={{ display: 'block', fontSize: '13px', fontWeight: 700, marginBottom: '6px' }}>Business Registration Tax ID (TIN)</label>
          <input
            type="text"
            value={businessTaxId}
            onChange={(e) => setBusinessTaxId(e.target.value)}
            style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #cbd5e1' }}
          />
        </div>

        <div>
          <label style={{ display: 'block', fontSize: '13px', fontWeight: 700, marginBottom: '6px' }}>Return Window Guarantee (Days)</label>
          <input
            type="number"
            value={returnPolicyDays}
            onChange={(e) => setReturnPolicyDays(Number(e.target.value))}
            style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #cbd5e1' }}
          />
        </div>

        <button
          type="submit"
          style={{
            padding: '12px',
            background: '#2563eb',
            color: '#ffffff',
            border: 'none',
            borderRadius: '6px',
            fontWeight: 700,
            fontSize: '14px',
            cursor: 'pointer',
            marginTop: '8px',
          }}
        >
          Save Storefront Configuration
        </button>
      </form>

      {/* Promotional Engine: banners, featured product carousel, custom storefront URL */}
      <div style={{ marginTop: 'var(--spacing-8, 32px)' }}>
        <div style={{ marginBottom: 'var(--spacing-6, 24px)' }}>
          <h2 style={{ fontSize: '1.375rem', fontWeight: 800 }}>Promotional Engine</h2>
          <p style={{ fontSize: '0.875rem', color: '#64748b', marginTop: '4px' }}>
            Manage homepage banners, the featured product carousel, and your custom storefront URL.
          </p>
        </div>

        {isConfigLoading || !config ? (
          <LoadingState message="Loading storefront promotional configuration..." />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-6, 24px)' }}>
            <section style={{ background: '#ffffff', padding: '24px', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
              <h3 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: 'var(--spacing-2, 8px)' }}>Homepage Banners</h3>
              <p style={{ fontSize: '0.8125rem', color: '#64748b', marginBottom: 'var(--spacing-4, 16px)' }}>
                Drag banners to reorder how they appear in your storefront's rotating hero carousel.
              </p>
              <BannerDragDrop banners={config.banners} onChange={handleBannersChange} />
            </section>

            <section style={{ background: '#ffffff', padding: '24px', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
              <h3 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: 'var(--spacing-2, 8px)' }}>Featured Product Carousel</h3>
              <p style={{ fontSize: '0.8125rem', color: '#64748b', marginBottom: 'var(--spacing-4, 16px)' }}>
                Drag products to reorder how they appear in your storefront's featured carousel.
              </p>
              <FeaturedCarouselEditor items={config.carousel} onChange={handleCarouselChange} />
            </section>

            <section style={{ background: '#ffffff', padding: '24px', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
              <h3 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: 'var(--spacing-4, 16px)' }}>Custom Storefront URL</h3>
              <CustomUrlField slug={config.customUrlSlug} onChange={handleSlugChange} />
            </section>

            <div>
              <Button variant="primary" onClick={() => void handleSaveConfig()} isLoading={isConfigSaving}>
                Save Banners, Carousel & URL
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
export default StorefrontCustomizerPage;
