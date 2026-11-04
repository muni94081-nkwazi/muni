import { PageHeader } from '@/components/common/PageHeader';
import { Link } from 'react-router-dom';
import { TERMS_CONTENT, PRIVACY_CONTENT } from '@legal';
import { LegalDocument } from '@/components/common/LegalDocument/LegalDocument';

// 14. /shipping-policy — Shipping Policy
export function ShippingPolicyPage() {
  return (
    <div className="container" style={{ padding: '24px 16px 48px' }}>
      <PageHeader
        title="Shipping Rates & Delivery Policies"
        subtitle="Detailed breakdown of delivery timelines, courier fees, and regional pickup centers."
        icon="📦"
        breadcrumbs={[{ label: 'Shipping Policy' }]}
      />

      <div style={{ background: '#ffffff', padding: '24px', borderRadius: '12px', border: '1px solid #e2e8f0', marginBottom: '24px' }}>
        <h3 style={{ fontSize: '1.2rem', fontWeight: 800, marginBottom: '12px' }}>Delivery Timelines</h3>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
          <thead>
            <tr style={{ background: '#f8fafc', textAlign: 'left', borderBottom: '2px solid #e2e8f0' }}>
              <th style={{ padding: '10px' }}>Region</th>
              <th style={{ padding: '10px' }}>Standard Delivery</th>
              <th style={{ padding: '10px' }}>Express Delivery</th>
            </tr>
          </thead>
          <tbody>
            <tr style={{ borderBottom: '1px solid #e2e8f0' }}>
              <td style={{ padding: '10px' }}>Kampala Central & Suburbs</td>
              <td style={{ padding: '10px' }}>24 Hours</td>
              <td style={{ padding: '10px' }}>Same Day (3-5 Hours)</td>
            </tr>
            <tr style={{ borderBottom: '1px solid #e2e8f0' }}>
              <td style={{ padding: '10px' }}>Entebbe, Mukono, Jinja</td>
              <td style={{ padding: '10px' }}>1-2 Days</td>
              <td style={{ padding: '10px' }}>24 Hours</td>
            </tr>
            <tr>
              <td style={{ padding: '10px' }}>Upcountry Districts (Gulu, Mbarara, Arua, Mbale)</td>
              <td style={{ padding: '10px' }}>2-3 Days</td>
              <td style={{ padding: '10px' }}>48 Hours</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

// 15. /returns — Returns Policy
export function RefundReturnsPolicyPage() {
  return (
    <div className="container" style={{ padding: '24px 16px 48px' }}>
      <PageHeader
        title="Returns & Replacements Policy"
        subtitle="Enjoy 7-day hassle-free returns with 100% money-back guarantee."
        icon="🔄"
        breadcrumbs={[{ label: 'Returns Policy' }]}
      />

      <div style={{ background: '#ffffff', padding: '24px', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
        <h3 style={{ fontSize: '1.2rem', fontWeight: 800, marginBottom: '12px' }}>7-Day Easy Return Guarantee</h3>
        <p style={{ color: '#475569', lineHeight: 1.6 }}>
          If an item is damaged, defective, or incorrect, log into your account, open a claim in <Link to="/returns-disputes" style={{ color: '#2563eb', fontWeight: 700 }}>Returns & Disputes Hub</Link>, and drop off the package at any Muni pickup station.
        </p>
      </div>
    </div>
  );
}

// 16. /help — Help Center
export function HelpCenterPage() {
  const faqs = [
    { q: 'How do I track my delivery status?', a: 'Go to Your Orders -> Click Track Package to see real-time GPS courier status.' },
    { q: 'What payment options are accepted?', a: 'MTN Mobile Money, Airtel Money, Visa/Mastercard, and Cash on Delivery.' },
    { q: 'How do I request a refund?', a: 'Submit a claim under Returns & Disputes within 7 days of package delivery.' },
  ];

  return (
    <div className="container" style={{ padding: '24px 16px 48px' }}>
      <PageHeader
        title="Muni Help Center & Support"
        subtitle="Frequently asked questions, order assistance, and live customer chat."
        icon="❓"
        breadcrumbs={[{ label: 'Help Center' }]}
      />

      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginBottom: '32px' }}>
        {faqs.map((faq, idx) => (
          <div key={idx} style={{ background: '#ffffff', padding: '20px', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
            <h4 style={{ fontSize: '1rem', fontWeight: 800, margin: '0 0 8px 0', color: '#0f172a' }}>{faq.q}</h4>
            <p style={{ color: '#64748b', margin: 0, fontSize: '0.9rem', lineHeight: 1.6 }}>{faq.a}</p>
          </div>
        ))}
      </div>

      <div style={{ textAlign: 'center', background: '#eff6ff', padding: '24px', borderRadius: '12px', border: '1px solid #bfdbfe' }}>
        <h3 style={{ fontSize: '1.2rem', fontWeight: 800, color: '#1e40af', marginBottom: '8px' }}>Need further assistance?</h3>
        <p style={{ color: '#1e3a8a', marginBottom: '16px' }}>Our customer care advocates are online 24/7.</p>
        <Link to="/chat" style={{ background: '#2563eb', color: '#ffffff', padding: '10px 24px', borderRadius: '6px', fontWeight: 700, textDecoration: 'none' }}>
          💬 Start Live Chat
        </Link>
      </div>
    </div>
  );
}

// 17. /conditions — Conditions of Use
export function ConditionsPage() {
  return <LegalDocument content={TERMS_CONTENT} icon="📜" breadcrumbLabel="Conditions of Use" />;
}

// 18. /privacy — Privacy Notice
export function PrivacyPage() {
  return <LegalDocument content={PRIVACY_CONTENT} icon="🔐" breadcrumbLabel="Privacy Notice" />;
}

// 19. /ads — Interest-Based Ads
export function InterestAdsPage() {
  return (
    <div className="container" style={{ padding: '24px 16px 48px' }}>
      <PageHeader
        title="Interest-Based Ads Policy"
        subtitle="Understanding personalized deal recommendations on Muni."
        icon="🎯"
        breadcrumbs={[{ label: 'Interest-Based Ads' }]}
      />

      <div style={{ background: '#ffffff', padding: '24px', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
        <p style={{ color: '#475569', fontSize: '0.9rem', lineHeight: 1.6 }}>
          Muni presents relevant product suggestions based on your browsing history, wishlists, and category preferences without selling your data to third parties.
        </p>
      </div>
    </div>
  );
}

// 20. /cookies — Cookie Policy
export function CookieNoticePage() {
  return (
    <div className="container" style={{ padding: '24px 16px 48px' }}>
      <PageHeader
        title="Cookie Notice & Preferences"
        subtitle="Manage essential, analytical, and marketing cookies."
        icon="🍪"
        breadcrumbs={[{ label: 'Cookies' }]}
      />

      <div style={{ background: '#ffffff', padding: '24px', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
        <h3 style={{ fontSize: '1.1rem', fontWeight: 800, marginBottom: '8px' }}>Cookie Preferences</h3>
        <p style={{ color: '#475569', fontSize: '0.9rem', lineHeight: 1.6, marginBottom: '16px' }}>
          Cookies allow us to remember your cart items, maintain session authentication, and analyze site performance.
        </p>
        <button onClick={() => alert('Cookie preferences saved!')} style={{ background: '#2563eb', color: '#ffffff', padding: '10px 20px', border: 'none', borderRadius: '6px', fontWeight: 700, cursor: 'pointer' }}>
          Save Preferences
        </button>
      </div>
    </div>
  );
}

// 21. /consumer-rights — Consumer Protection Rights
export function ConsumerRightsPage() {
  const rights = [
    { title: 'Right to Accurate Information', desc: 'Product listings must truthfully describe condition, price, and specifications.' },
    { title: 'Right to a Fair Refund', desc: 'Defective, damaged, or misdescribed items qualify for a full refund within 7 days.' },
    { title: 'Right to Dispute Resolution', desc: 'Every buyer can escalate unresolved issues to the Dispute Tribunal Desk free of charge.' },
    { title: 'Right to Data Privacy', desc: 'Your personal and payment information is never sold to third parties.' },
  ];

  return (
    <div className="container" style={{ padding: '24px 16px 48px' }}>
      <PageHeader
        title="Consumer Protection Rights"
        subtitle="Know your rights as a shopper on the Muni marketplace, in line with Ugandan consumer protection law."
        icon="⚖️"
        breadcrumbs={[{ label: 'Consumer Protection Rights' }]}
      />

      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginBottom: '24px' }}>
        {rights.map((r) => (
          <div key={r.title} style={{ background: '#ffffff', padding: '20px', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
            <h3 style={{ fontSize: '1.05rem', fontWeight: 800, margin: '0 0 8px 0', color: '#0f172a' }}>{r.title}</h3>
            <p style={{ color: '#64748b', fontSize: '0.9rem', margin: 0, lineHeight: 1.6 }}>{r.desc}</p>
          </div>
        ))}
      </div>

      <div style={{ textAlign: 'center', background: '#eff6ff', padding: '20px', borderRadius: '12px', border: '1px solid #bfdbfe' }}>
        <Link to="/returns-disputes" style={{ background: '#2563eb', color: '#ffffff', padding: '10px 24px', borderRadius: '6px', fontWeight: 700, textDecoration: 'none' }}>
          File a Dispute →
        </Link>
      </div>
    </div>
  );
}

// 22. /sitemap — Sitemap
export function SitemapPage() {
  const sections: { title: string; links: { label: string; href: string }[] }[] = [
    {
      title: 'Get to Know Us',
      links: [
        { label: 'About Muni Group', href: '/about' },
        { label: 'Careers at Muni', href: '/careers' },
        { label: 'Press & Media Center', href: '/press' },
        { label: 'Muni Cares Foundation', href: '/cares' },
        { label: 'Investor Relations', href: '/investors' },
        { label: 'Sustainability & Impact', href: '/sustainability' },
      ],
    },
    {
      title: 'Make Money with Us',
      links: [
        { label: 'Sell on Muni Market', href: '/sell' },
        { label: 'Become a Logistics Partner', href: '/shipping' },
        { label: 'Join Affiliate Program', href: '/affiliate' },
        { label: 'Advertise Your Products', href: '/advertise' },
        { label: 'Bulk Container Imports', href: '/containers' },
      ],
    },
    {
      title: 'Payment & Financing',
      links: [
        { label: 'MTN Mobile Money (MoMo)', href: '/mtn-momo' },
        { label: 'Airtel Money Instant Pay', href: '/airtel-money' },
        { label: 'Cash on Delivery (COD)', href: '/cod' },
        { label: 'Muni Buy Now Pay Later', href: '/bnpl' },
        { label: 'Muni Business Card', href: '/business' },
        { label: 'Escrow Buyer Protection', href: '/buyer-protection' },
      ],
    },
    {
      title: 'Let Us Help You',
      links: [
        { label: 'Your Account & Dashboard', href: '/dashboard' },
        { label: 'Track Your Orders', href: '/orders' },
        { label: 'Shipping Rates & Policies', href: '/shipping-policy' },
        { label: 'Returns & Refund Center', href: '/returns' },
        { label: 'Dispute Tribunal Desk', href: '/returns-disputes' },
        { label: 'Help & Live Support 24/7', href: '/help' },
      ],
    },
    {
      title: 'Muni Services',
      links: [
        { label: 'Muni Express 24h Delivery', href: '/express' },
        { label: 'Muni Fresh Groceries', href: '/fresh' },
        { label: 'Muni Global Shipping', href: '/global' },
        { label: 'Muni Wholesale B2B', href: '/b2b' },
        { label: 'Muni Academy for Sellers', href: '/academy' },
        { label: 'Muni Pay & Escrow', href: '/pay' },
      ],
    },
    {
      title: 'Legal & Policies',
      links: [
        { label: 'Conditions of Use', href: '/conditions' },
        { label: 'Privacy Notice', href: '/privacy' },
        { label: 'Consumer Protection Rights', href: '/consumer-rights' },
        { label: 'Interest-Based Ads', href: '/ads' },
        { label: 'Cookies Settings', href: '/cookies' },
      ],
    },
  ];

  return (
    <div className="container" style={{ padding: '24px 16px 48px' }}>
      <PageHeader
        title="Sitemap"
        subtitle="A complete directory of every page on Muni.ug."
        icon="🗺️"
        breadcrumbs={[{ label: 'Sitemap' }]}
      />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '24px' }}>
        {sections.map((section) => (
          <div key={section.title} style={{ background: '#ffffff', padding: '20px', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
            <h3 style={{ fontSize: '1rem', fontWeight: 800, marginBottom: '12px', color: '#0f172a' }}>{section.title}</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {section.links.map((link) => (
                <Link key={link.href} to={link.href} style={{ color: '#2563eb', fontSize: '0.88rem', textDecoration: 'none' }}>
                  {link.label}
                </Link>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
