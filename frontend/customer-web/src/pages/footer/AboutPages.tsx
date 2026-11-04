import { PageHeader } from '@/components/common/PageHeader';
import { Link } from 'react-router-dom';

// 1. /about — About Muni
export function AboutPage() {
  return (
    <div className="container" style={{ padding: '24px 16px 48px' }}>
      <PageHeader
        title="About Muni.ug"
        subtitle="Empowering commerce across Uganda & East Africa with fast delivery and trusted mobile money payments."
        icon="🌍"
        breadcrumbs={[{ label: 'About Us' }]}
      />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '24px', marginBottom: '32px' }}>
        <div style={{ background: '#ffffff', padding: '24px', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
          <h3 style={{ fontSize: '1.25rem', fontWeight: 800, marginBottom: '12px', color: '#0f172a' }}>🚀 Our Mission</h3>
          <p style={{ color: '#475569', lineHeight: 1.6, fontSize: '0.95rem' }}>
            Muni is built to connect everyday buyers and certified merchants across Kampala, Entebbe, Jinja, Gulu, and all districts of Uganda.
            We make shopping effortless, transparent, and 100% secure.
          </p>
        </div>

        <div style={{ background: '#ffffff', padding: '24px', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
          <h3 style={{ fontSize: '1.25rem', fontWeight: 800, marginBottom: '12px', color: '#0f172a' }}>🔒 Buyer Protection Escrow</h3>
          <p style={{ color: '#475569', lineHeight: 1.6, fontSize: '0.95rem' }}>
            Every purchase on Muni is backed by our 100% Escrow Protection guarantee. Payments are held safely until you receive your items in perfect condition.
          </p>
        </div>

        <div style={{ background: '#ffffff', padding: '24px', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
          <h3 style={{ fontSize: '1.25rem', fontWeight: 800, marginBottom: '12px', color: '#0f172a' }}>📲 Localized Payments</h3>
          <p style={{ color: '#475569', lineHeight: 1.6, fontSize: '0.95rem' }}>
            Pay seamlessly using MTN Mobile Money, Airtel Money, or Cash on Delivery. Zero stress, instant push notifications, and clear receipts.
          </p>
        </div>
      </div>

      <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', padding: '32px', borderRadius: '12px', textAlign: 'center' }}>
        <h2 style={{ fontSize: '1.5rem', fontWeight: 800, color: '#1e40af', marginBottom: '12px' }}>Ready to explore products?</h2>
        <p style={{ color: '#1e3a8a', marginBottom: '20px' }}>Browse thousands of deals from Uganda’s top verified sellers.</p>
        <Link to="/products" style={{ background: '#2563eb', color: '#ffffff', padding: '12px 28px', borderRadius: '8px', fontWeight: 700, textDecoration: 'none' }}>
          Shop All Products →
        </Link>
      </div>
    </div>
  );
}

// 2. /careers — Careers
export function CareersPage() {
  const openRoles = [
    { title: 'Senior Full-Stack Engineer (Node/React)', dept: 'Engineering', location: 'Kampala / Remote' },
    { title: 'Mobile Money Integration Specialist', dept: 'Fintech & Payments', location: 'Kampala' },
    { title: 'Merchant Onboarding Manager', dept: 'Vendor Operations', location: 'Jinja / Kampala' },
    { title: 'Customer Success Advocate', dept: 'Support', location: 'Entebbe' },
  ];

  return (
    <div className="container" style={{ padding: '24px 16px 48px' }}>
      <PageHeader
        title="Careers at Muni"
        subtitle="Build the future of digital commerce and logistics in East Africa with our team."
        icon="💼"
        breadcrumbs={[{ label: 'Careers' }]}
      />

      <div style={{ background: '#ffffff', padding: '24px', borderRadius: '12px', border: '1px solid #e2e8f0', marginBottom: '32px' }}>
        <h2 style={{ fontSize: '1.35rem', fontWeight: 800, marginBottom: '16px' }}>Open Positions ({openRoles.length})</h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {openRoles.map((role, idx) => (
            <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px', background: '#f8fafc', borderRadius: '8px', border: '1px solid #cbd5e1' }}>
              <div>
                <h4 style={{ margin: 0, fontSize: '1rem', fontWeight: 800 }}>{role.title}</h4>
                <p style={{ margin: '4px 0 0 0', fontSize: '0.85rem', color: '#64748b' }}>{role.dept} • {role.location}</p>
              </div>
              <button onClick={() => alert(`Applied for ${role.title}! We will contact you soon.`)} style={{ padding: '8px 16px', background: '#2563eb', color: '#ffffff', border: 'none', borderRadius: '6px', fontWeight: 700, cursor: 'pointer' }}>
                Apply Now
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// 3. /press — Press Releases
export function PressPage() {
  const articles = [
    { date: 'August 2026', title: 'Muni Expands Direct Courier Express Services across All Districts in Uganda' },
    { date: 'June 2026', title: 'Muni Partners with Local Mobile Money Operators for 100% Instant Escrow Settlement' },
    { date: 'January 2026', title: 'Muni Hits Milestone 50,000 Verified Local Ugandan Sellers Onboarded' },
  ];

  return (
    <div className="container" style={{ padding: '24px 16px 48px' }}>
      <PageHeader
        title="Press & Media Releases"
        subtitle="Official news, announcements, and media assets from Muni.ug."
        icon="📰"
        breadcrumbs={[{ label: 'Press Releases' }]}
      />

      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        {articles.map((item, idx) => (
          <div key={idx} style={{ background: '#ffffff', padding: '24px', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
            <span style={{ fontSize: '0.8rem', background: '#e0f2fe', color: '#0369a1', padding: '4px 10px', borderRadius: '6px', fontWeight: 700 }}>
              {item.date}
            </span>
            <h3 style={{ fontSize: '1.2rem', fontWeight: 800, margin: '12px 0 8px 0', color: '#0f172a' }}>{item.title}</h3>
            <p style={{ color: '#64748b', fontSize: '0.9rem', lineHeight: 1.6 }}>
              Read official statements on how Muni is revolutionizing e-commerce infrastructure, delivery logistics, and merchant empowerment.
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

// 4. /cares — Muni Cares
export function MuniCaresPage() {
  return (
    <div className="container" style={{ padding: '24px 16px 48px' }}>
      <PageHeader
        title="Muni Cares — Social Impact & Sustainability"
        subtitle="Supporting local Ugandan artisans, green packaging, and community growth."
        icon="💚"
        breadcrumbs={[{ label: 'Muni Cares' }]}
      />

      <div style={{ background: '#ffffff', padding: '24px', borderRadius: '12px', border: '1px solid #e2e8f0', marginBottom: '24px' }}>
        <h3 style={{ fontSize: '1.25rem', fontWeight: 800, marginBottom: '12px' }}>🌱 Sustainable E-Commerce Packaging</h3>
        <p style={{ color: '#475569', lineHeight: 1.6 }}>
          Muni provides biodegradable and recyclable packaging materials to our fulfillment hubs across Kampala and regional centers.
        </p>
      </div>

      <div style={{ background: '#ffffff', padding: '24px', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
        <h3 style={{ fontSize: '1.25rem', fontWeight: 800, marginBottom: '12px' }}>🎨 Empowering Micro & Rural Entrepreneurs</h3>
        <p style={{ color: '#475569', lineHeight: 1.6 }}>
          Through zero-commission onboarding initiatives, we enable traditional Ugandan craftsmen and female entrepreneurs to reach national buyers instantly.
        </p>
      </div>
    </div>
  );
}

// 5. /gift — Gift Cards & Registry
export function GiftRegistryPage() {
  return (
    <div className="container" style={{ padding: '24px 16px 48px' }}>
      <PageHeader
        title="Muni Gift Cards & Registry"
        subtitle="Give the gift of choice for weddings, birthdays, holidays, and special celebrations."
        icon="🎁"
        breadcrumbs={[{ label: 'Gift a Smile' }]}
      />

      <div style={{ background: '#ffffff', padding: '32px', borderRadius: '12px', border: '1px solid #e2e8f0', textAlign: 'center' }}>
        <h2 style={{ fontSize: '1.5rem', fontWeight: 800, marginBottom: '12px' }}>Buy Digital Muni E-Gift Cards</h2>
        <p style={{ color: '#64748b', marginBottom: '24px' }}>Send instant digital gift cards directly via SMS or Email to your loved ones in Uganda.</p>

        <div style={{ display: 'flex', gap: '12px', justifyContent: 'center', flexWrap: 'wrap', marginBottom: '24px' }}>
          {['UGX 50,000', 'UGX 100,000', 'UGX 250,000', 'UGX 500,000'].map((val) => (
            <button key={val} onClick={() => alert(`Selected ${val} Gift Card!`)} style={{ padding: '12px 24px', background: '#f8fafc', border: '2px solid #2563eb', borderRadius: '8px', fontWeight: 800, color: '#2563eb', cursor: 'pointer' }}>
              {val}
            </button>
          ))}
        </div>

        <button onClick={() => alert('Gift card order initiated!')} style={{ background: '#2563eb', color: '#ffffff', padding: '14px 36px', borderRadius: '8px', fontWeight: 800, border: 'none', cursor: 'pointer', fontSize: '1rem' }}>
          Purchase Digital Gift Card →
        </button>
      </div>
    </div>
  );
}

// 6. /investors — Investor Relations
export function InvestorsPage() {
  const highlights = [
    { label: 'GMV Run Rate (FY2026)', value: 'UGX 480B+' },
    { label: 'Active Verified Sellers', value: '52,000+' },
    { label: 'Districts Served', value: 'All 146' },
    { label: 'YoY GMV Growth', value: '+64%' },
  ];

  return (
    <div className="container" style={{ padding: '24px 16px 48px' }}>
      <PageHeader
        title="Investor Relations"
        subtitle="Financial highlights, governance, and growth updates for Muni Group stakeholders."
        icon="📈"
        breadcrumbs={[{ label: 'Investor Relations' }]}
      />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '16px', marginBottom: '32px' }}>
        {highlights.map((h) => (
          <div key={h.label} style={{ background: '#ffffff', padding: '20px', borderRadius: '12px', border: '1px solid #e2e8f0', textAlign: 'center' }}>
            <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#1e40af' }}>{h.value}</div>
            <div style={{ color: '#64748b', fontSize: '0.85rem', marginTop: '4px' }}>{h.label}</div>
          </div>
        ))}
      </div>

      <div style={{ background: '#ffffff', padding: '24px', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
        <h3 style={{ fontSize: '1.2rem', fontWeight: 800, marginBottom: '12px' }}>Governance & Reporting</h3>
        <p style={{ color: '#475569', lineHeight: 1.6, fontSize: '0.95rem' }}>
          Muni Group publishes quarterly shareholder updates covering GMV, take-rate, seller growth, and logistics network expansion.
          For investor inquiries, financial statements, or partnership proposals, contact our Investor Relations desk.
        </p>
      </div>
    </div>
  );
}

// 7. /sustainability — Sustainability & Impact
export function SustainabilityPage() {
  const pillars = [
    { icon: '🌱', title: 'Green Logistics', desc: 'Electric last-mile delivery pilots and carbon-offset freight routes across Kampala.' },
    { icon: '♻️', title: 'Sustainable Packaging', desc: 'Biodegradable mailers and recyclable cartons across all fulfillment hubs.' },
    { icon: '🤝', title: 'Inclusive Growth', desc: 'Zero-commission onboarding for rural artisans and women-led micro-businesses.' },
    { icon: '💧', title: 'Community Investment', desc: 'Clean water and schooling initiatives funded by the Muni Cares Foundation.' },
  ];

  return (
    <div className="container" style={{ padding: '24px 16px 48px' }}>
      <PageHeader
        title="Sustainability & Impact"
        subtitle="Our commitment to responsible commerce, green logistics, and community growth."
        icon="🌍"
        breadcrumbs={[{ label: 'Sustainability & Impact' }]}
      />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '16px' }}>
        {pillars.map((p) => (
          <div key={p.title} style={{ background: '#ffffff', padding: '24px', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
            <div style={{ fontSize: '1.75rem', marginBottom: '8px' }}>{p.icon}</div>
            <h3 style={{ fontSize: '1.1rem', fontWeight: 800, marginBottom: '8px', color: '#166534' }}>{p.title}</h3>
            <p style={{ color: '#475569', fontSize: '0.9rem', lineHeight: 1.6 }}>{p.desc}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
