import { PageHeader } from '@/components/common/PageHeader';

// 6. /sell — Sell on Muni
export function SellOnMuniPage() {
  return (
    <div className="container" style={{ padding: '24px 16px 48px' }}>
      <PageHeader
        title="Sell on Muni.ug"
        subtitle="Reach millions of buyers across Uganda and East Africa with 0% setup fees."
        icon="🛍️"
        breadcrumbs={[{ label: 'Sell on Muni' }]}
      />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '20px', marginBottom: '32px' }}>
        <div style={{ background: '#ffffff', padding: '24px', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
          <h3 style={{ fontSize: '1.2rem', fontWeight: 800, marginBottom: '8px' }}>1. Create Your Store</h3>
          <p style={{ color: '#64748b', fontSize: '0.9rem', lineHeight: 1.6 }}>Register in under 3 minutes with your National ID/TIN number and Mobile Money wallet.</p>
        </div>

        <div style={{ background: '#ffffff', padding: '24px', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
          <h3 style={{ fontSize: '1.2rem', fontWeight: 800, marginBottom: '8px' }}>2. List Products</h3>
          <p style={{ color: '#64748b', fontSize: '0.9rem', lineHeight: 1.6 }}>Upload catalog images, set prices, or use bulk CSV imports to add thousands of items.</p>
        </div>

        <div style={{ background: '#ffffff', padding: '24px', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
          <h3 style={{ fontSize: '1.2rem', fontWeight: 800, marginBottom: '8px' }}>3. Instant Payouts</h3>
          <p style={{ color: '#64748b', fontSize: '0.9rem', lineHeight: 1.6 }}>Get paid directly into your MTN MoMo or Airtel Money account as soon as orders are delivered.</p>
        </div>
      </div>

      <div style={{ textAlign: 'center', background: '#f8fafc', padding: '32px', borderRadius: '12px', border: '1px solid #cbd5e1' }}>
        <h2 style={{ fontSize: '1.5rem', fontWeight: 800, marginBottom: '12px' }}>Start Selling Today</h2>
        <p style={{ color: '#475569', marginBottom: '20px' }}>Join over 50,000 top vendors selling Electronics, Fashion, Home goods & Groceries.</p>
        <a href="/seller/register" style={{ background: '#16a34a', color: '#ffffff', padding: '14px 32px', borderRadius: '8px', fontWeight: 800, textDecoration: 'none' }}>
          Register as Seller →
        </a>
      </div>
    </div>
  );
}

// 7. /affiliate — Affiliate Program
export function AffiliateProgramPage() {
  return (
    <div className="container" style={{ padding: '24px 16px 48px' }}>
      <PageHeader
        title="Muni Affiliate Program"
        subtitle="Earn up to 10% commission on every order you refer to Muni.ug."
        icon="🤝"
        breadcrumbs={[{ label: 'Affiliate Program' }]}
      />

      <div style={{ background: '#ffffff', padding: '24px', borderRadius: '12px', border: '1px solid #e2e8f0', marginBottom: '24px' }}>
        <h3 style={{ fontSize: '1.25rem', fontWeight: 800, marginBottom: '12px' }}>How it Works</h3>
        <ul style={{ color: '#475569', lineHeight: 1.8, paddingLeft: '20px' }}>
          <li>Sign up as a Muni Creator / Publisher.</li>
          <li>Share unique tracking links on WhatsApp, Facebook, TikTok, or your website.</li>
          <li>Earn commissions paid directly to your Mobile Money account every Monday!</li>
        </ul>
      </div>
    </div>
  );
}

// 8. /advertise — Advertise on Muni
export function AdvertiseOnMuniPage() {
  return (
    <div className="container" style={{ padding: '24px 16px 48px' }}>
      <PageHeader
        title="Advertise on Muni"
        subtitle="Promote your products directly in search results and homepage hero banners."
        icon="📢"
        breadcrumbs={[{ label: 'Advertise' }]}
      />

      <div style={{ background: '#ffffff', padding: '24px', borderRadius: '12px', border: '1px solid #e2e8f0', marginBottom: '24px' }}>
        <h3 style={{ fontSize: '1.25rem', fontWeight: 800, marginBottom: '12px' }}>Sponsored Products & Keyword Bidding</h3>
        <p style={{ color: '#475569', lineHeight: 1.6 }}>
          Boost your listings to the top of customer search queries and category containers with PPC advertising starting from UGX 50 per click.
        </p>
      </div>
    </div>
  );
}

// 9. /shipping — Ship with Muni
export function ShipWithMuniPage() {
  return (
    <div className="container" style={{ padding: '24px 16px 48px' }}>
      <PageHeader
        title="Ship with Muni Express Logistics"
        subtitle="Fast, door-to-door fulfillment and hub pickup networks across Uganda."
        icon="🚚"
        breadcrumbs={[{ label: 'Ship with Muni' }]}
      />

      <div style={{ background: '#ffffff', padding: '24px', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
        <h3 style={{ fontSize: '1.25rem', fontWeight: 800, marginBottom: '12px' }}>Logistics Coverage</h3>
        <p style={{ color: '#475569', lineHeight: 1.6 }}>
          Same-Day Delivery in Greater Kampala & Entebbe. 24-48 Hours Delivery to Jinja, Mbarara, Gulu, Lira, Mbale, Fort Portal & Arua.
        </p>
      </div>
    </div>
  );
}
