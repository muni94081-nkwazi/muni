import { PageHeader } from '@/components/common/PageHeader';
import { Link } from 'react-router-dom';

// /express — Muni Express
export function MuniExpressPage() {
  const zones = [
    { area: 'Kampala Central & Suburbs', eta: '3–5 Hours', fee: 'UGX 5,000' },
    { area: 'Entebbe, Mukono, Wakiso', eta: 'Same Day', fee: 'UGX 8,000' },
    { area: 'Jinja, Mbarara, Gulu', eta: 'Next Day (24h)', fee: 'UGX 15,000' },
  ];

  return (
    <div className="container" style={{ padding: '24px 16px 48px' }}>
      <PageHeader
        title="Muni Express — 24h Guaranteed Delivery"
        subtitle="Lightning-fast dispatch and doorstep delivery across East Africa, guaranteed."
        icon="⚡"
        breadcrumbs={[{ label: 'Muni Express' }]}
      />

      <div style={{ background: '#fff7ed', border: '1px solid #fed7aa', padding: '20px 24px', borderRadius: '12px', marginBottom: '24px' }}>
        <strong style={{ color: '#9a3412' }}>Fast Fact:</strong>{' '}
        <span style={{ color: '#7c2d12' }}>Over 90% of Muni Express orders in Kampala arrive in under 5 hours.</span>
      </div>

      <div style={{ background: '#ffffff', padding: '24px', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
        <h3 style={{ fontSize: '1.2rem', fontWeight: 800, marginBottom: '16px' }}>Delivery Zones & Fees</h3>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
          <thead>
            <tr style={{ background: '#f8fafc', textAlign: 'left', borderBottom: '2px solid #e2e8f0' }}>
              <th style={{ padding: '10px' }}>Zone</th>
              <th style={{ padding: '10px' }}>Guaranteed ETA</th>
              <th style={{ padding: '10px' }}>Express Fee</th>
            </tr>
          </thead>
          <tbody>
            {zones.map((z) => (
              <tr key={z.area} style={{ borderBottom: '1px solid #e2e8f0' }}>
                <td style={{ padding: '10px' }}>{z.area}</td>
                <td style={{ padding: '10px', fontWeight: 700, color: '#c2410c' }}>{z.eta}</td>
                <td style={{ padding: '10px' }}>{z.fee}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div style={{ textAlign: 'center', marginTop: '32px' }}>
        <Link to="/products" style={{ background: '#c2410c', color: '#ffffff', padding: '12px 28px', borderRadius: '8px', fontWeight: 700, textDecoration: 'none' }}>
          Shop Express-Eligible Products →
        </Link>
      </div>
    </div>
  );
}

// /fresh — Muni Fresh
export function MuniFreshPage() {
  const categories = ['Fresh Vegetables', 'Fruits & Berries', 'Dairy & Eggs', 'Meat & Poultry', 'Bakery', 'Pantry Staples'];

  return (
    <div className="container" style={{ padding: '24px 16px 48px' }}>
      <PageHeader
        title="Muni Fresh — Farm to Doorstep Groceries"
        subtitle="Same-day fresh produce sourced directly from local Ugandan farms and markets."
        icon="🥬"
        breadcrumbs={[{ label: 'Muni Fresh' }]}
      />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '16px', marginBottom: '32px' }}>
        {categories.map((cat) => (
          <div key={cat} style={{ background: '#ffffff', padding: '20px', borderRadius: '12px', border: '1px solid #e2e8f0', textAlign: 'center' }}>
            <div style={{ fontSize: '1.75rem', marginBottom: '8px' }}>🌿</div>
            <div style={{ fontWeight: 700, color: '#166534' }}>{cat}</div>
          </div>
        ))}
      </div>

      <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', padding: '24px', borderRadius: '12px' }}>
        <h3 style={{ fontSize: '1.2rem', fontWeight: 800, marginBottom: '12px', color: '#166534' }}>Same-Day Cold Chain Delivery</h3>
        <p style={{ color: '#166534', lineHeight: 1.6 }}>
          Orders placed before 12:00 PM are delivered the same evening in temperature-controlled vans across Kampala and Wakiso.
        </p>
      </div>
    </div>
  );
}

// /global — Muni Global Shipping
export function MuniGlobalPage() {
  const routes = [
    { origin: 'Guangzhou, China', dest: 'Kampala, Uganda', transit: '18–25 Days', mode: 'Sea Freight' },
    { origin: 'Dubai, UAE', dest: 'Kampala, Uganda', transit: '7–10 Days', mode: 'Air Freight' },
    { origin: 'Nairobi, Kenya', dest: 'Kampala, Uganda', transit: '2–3 Days', mode: 'Road Freight' },
  ];

  return (
    <div className="container" style={{ padding: '24px 16px 48px' }}>
      <PageHeader
        title="Muni Global Shipping"
        subtitle="Cross-border import logistics connecting Uganda to global manufacturing hubs."
        icon="🌐"
        breadcrumbs={[{ label: 'Muni Global' }]}
      />

      <div style={{ background: '#ffffff', padding: '24px', borderRadius: '12px', border: '1px solid #e2e8f0', marginBottom: '24px' }}>
        <h3 style={{ fontSize: '1.2rem', fontWeight: 800, marginBottom: '16px' }}>Active Freight Lanes</h3>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
          <thead>
            <tr style={{ background: '#f8fafc', textAlign: 'left', borderBottom: '2px solid #e2e8f0' }}>
              <th style={{ padding: '10px' }}>Origin</th>
              <th style={{ padding: '10px' }}>Destination</th>
              <th style={{ padding: '10px' }}>Transit Time</th>
              <th style={{ padding: '10px' }}>Mode</th>
            </tr>
          </thead>
          <tbody>
            {routes.map((r) => (
              <tr key={r.origin} style={{ borderBottom: '1px solid #e2e8f0' }}>
                <td style={{ padding: '10px' }}>{r.origin}</td>
                <td style={{ padding: '10px' }}>{r.dest}</td>
                <td style={{ padding: '10px', fontWeight: 700 }}>{r.transit}</td>
                <td style={{ padding: '10px' }}>{r.mode}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div style={{ textAlign: 'center' }}>
        <Link to="/containers" style={{ color: '#2563eb', fontWeight: 700, textDecoration: 'none' }}>
          Learn about bulk container imports →
        </Link>
      </div>
    </div>
  );
}

// /b2b — Muni Wholesale B2B
export function MuniB2bPage() {
  const tiers = [
    { units: '50 – 199 units', discount: '5% off' },
    { units: '200 – 499 units', discount: '12% off' },
    { units: '500+ units', discount: '20% off + dedicated account manager' },
  ];

  return (
    <div className="container" style={{ padding: '24px 16px 48px' }}>
      <PageHeader
        title="Muni Wholesale B2B"
        subtitle="Bulk purchasing platform for retailers, distributors, and institutional buyers."
        icon="🏭"
        breadcrumbs={[{ label: 'Muni B2B' }]}
      />

      <div style={{ background: '#ffffff', padding: '24px', borderRadius: '12px', border: '1px solid #e2e8f0', marginBottom: '24px' }}>
        <h3 style={{ fontSize: '1.2rem', fontWeight: 800, marginBottom: '16px' }}>Volume Discount Tiers</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {tiers.map((t) => (
            <div key={t.units} style={{ display: 'flex', justifyContent: 'space-between', padding: '14px 16px', background: '#f8fafc', borderRadius: '8px', border: '1px solid #cbd5e1' }}>
              <span style={{ fontWeight: 700 }}>{t.units}</span>
              <span style={{ color: '#2563eb', fontWeight: 800 }}>{t.discount}</span>
            </div>
          ))}
        </div>
      </div>

      <div style={{ textAlign: 'center' }}>
        <button onClick={() => alert('B2B account application started!')} style={{ background: '#0f172a', color: '#ffffff', padding: '12px 28px', borderRadius: '8px', fontWeight: 700, border: 'none', cursor: 'pointer' }}>
          Apply for a Business Account →
        </button>
      </div>
    </div>
  );
}

// /academy — Muni Academy
export function MuniAcademyPage() {
  const courses = [
    { title: 'Getting Started as a Muni Seller', level: 'Beginner', duration: '45 min' },
    { title: 'Winning the Buy Box with Smart Pricing', level: 'Intermediate', duration: '1h 10min' },
    { title: 'Mastering Sponsored Product Ads', level: 'Advanced', duration: '55 min' },
    { title: 'Inventory & Fulfillment Best Practices', level: 'Intermediate', duration: '40 min' },
  ];

  return (
    <div className="container" style={{ padding: '24px 16px 48px' }}>
      <PageHeader
        title="Muni Academy for Sellers"
        subtitle="Free e-commerce masterclasses to help Ugandan entrepreneurs grow their business."
        icon="🎓"
        breadcrumbs={[{ label: 'Muni Academy' }]}
      />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '16px' }}>
        {courses.map((c) => (
          <div key={c.title} style={{ background: '#ffffff', padding: '20px', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
            <span style={{ fontSize: '0.75rem', background: '#ede9fe', color: '#6d28d9', padding: '4px 10px', borderRadius: '6px', fontWeight: 700 }}>
              {c.level}
            </span>
            <h3 style={{ fontSize: '1.05rem', fontWeight: 800, margin: '12px 0 8px 0', color: '#0f172a' }}>{c.title}</h3>
            <p style={{ color: '#64748b', fontSize: '0.85rem', margin: 0 }}>⏱ {c.duration}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

// /pay — Muni Pay & Escrow
export function MuniPayPage() {
  return (
    <div className="container" style={{ padding: '24px 16px 48px' }}>
      <PageHeader
        title="Muni Pay & Escrow"
        subtitle="Secure Mobile Money payments backed by 100% buyer protection escrow."
        icon="🔒"
        breadcrumbs={[{ label: 'Muni Pay' }]}
      />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '20px', marginBottom: '24px' }}>
        <div style={{ background: '#ffffff', padding: '24px', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
          <h3 style={{ fontSize: '1.1rem', fontWeight: 800, marginBottom: '10px' }}>1. Pay Securely</h3>
          <p style={{ color: '#475569', fontSize: '0.9rem', lineHeight: 1.6 }}>Funds are held safely in escrow the moment you check out — sellers can't touch it yet.</p>
        </div>
        <div style={{ background: '#ffffff', padding: '24px', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
          <h3 style={{ fontSize: '1.1rem', fontWeight: 800, marginBottom: '10px' }}>2. We Verify Delivery</h3>
          <p style={{ color: '#475569', fontSize: '0.9rem', lineHeight: 1.6 }}>Escrow stays locked until you confirm receipt or the delivery window closes.</p>
        </div>
        <div style={{ background: '#ffffff', padding: '24px', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
          <h3 style={{ fontSize: '1.1rem', fontWeight: 800, marginBottom: '10px' }}>3. Funds Released</h3>
          <p style={{ color: '#475569', fontSize: '0.9rem', lineHeight: 1.6 }}>Once confirmed, funds release to the seller. Not happy? Open a dispute for a full refund.</p>
        </div>
      </div>

      <div style={{ textAlign: 'center' }}>
        <Link to="/buyer-protection" style={{ color: '#2563eb', fontWeight: 700, textDecoration: 'none' }}>
          Read the full Buyer Protection guarantee →
        </Link>
      </div>
    </div>
  );
}

// /containers — Muni Containers (Bulk Freight Import)
export function MuniContainersPage() {
  const steps = [
    { step: '1', label: 'Submit Sourcing Request', desc: 'Tell us what products & quantities you want imported.' },
    { step: '2', label: 'Container Consolidation', desc: 'Your goods are consolidated into a shared or full container.' },
    { step: '3', label: 'Customs Clearance', desc: 'Muni handles URA customs clearance and duty payments.' },
    { step: '4', label: 'Local Delivery', desc: 'Goods are delivered to your warehouse or Muni fulfillment hub.' },
  ];

  return (
    <div className="container" style={{ padding: '24px 16px 48px' }}>
      <PageHeader
        title="Muni Containers — Bulk Freight Imports"
        subtitle="Direct China-to-East Africa sea freight logistics for sellers and businesses."
        icon="🚢"
        breadcrumbs={[{ label: 'Muni Containers' }]}
      />

      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '24px' }}>
        {steps.map((s) => (
          <div key={s.step} style={{ display: 'flex', gap: '16px', alignItems: 'flex-start', background: '#ffffff', padding: '18px 20px', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
            <div style={{ width: 36, height: 36, borderRadius: '50%', background: '#1e3a8a', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, flexShrink: 0 }}>
              {s.step}
            </div>
            <div>
              <h4 style={{ margin: 0, fontWeight: 800, color: '#0f172a' }}>{s.label}</h4>
              <p style={{ margin: '4px 0 0 0', color: '#64748b', fontSize: '0.9rem' }}>{s.desc}</p>
            </div>
          </div>
        ))}
      </div>

      <div style={{ textAlign: 'center' }}>
        <button onClick={() => alert('Container import request submitted!')} style={{ background: '#1e3a8a', color: '#ffffff', padding: '12px 28px', borderRadius: '8px', fontWeight: 700, border: 'none', cursor: 'pointer' }}>
          Request a Sourcing Quote →
        </button>
      </div>
    </div>
  );
}
