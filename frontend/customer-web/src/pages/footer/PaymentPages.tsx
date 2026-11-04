import { PageHeader } from '@/components/common/PageHeader';

// 10. /mtn-momo — Pay with MTN Mobile Money
export function MtnMomoPage() {
  return (
    <div className="container" style={{ padding: '24px 16px 48px' }}>
      <PageHeader
        title="Pay with MTN Mobile Money (MoMo)"
        subtitle="Fast, secure & automated payments using your MTN Uganda line."
        icon="💛"
        breadcrumbs={[{ label: 'MTN Mobile Money' }]}
      />

      <div style={{ background: '#ffffff', padding: '24px', borderRadius: '12px', border: '1px solid #e2e8f0', marginBottom: '24px' }}>
        <h3 style={{ fontSize: '1.2rem', fontWeight: 800, marginBottom: '12px', color: '#b45309' }}>How to Pay via MTN MoMo</h3>
        <ol style={{ color: '#475569', lineHeight: 1.8, paddingLeft: '20px' }}>
          <li>Select <strong>MTN Mobile Money</strong> at checkout.</li>
          <li>Enter your MTN phone number (e.g. <code>077XXXXXXX</code> or <code>078XXXXXXX</code>).</li>
          <li>Approve the USSD prompt on your phone by entering your MoMo PIN.</li>
          <li>Your payment is verified automatically within 3 seconds!</li>
        </ol>
      </div>
    </div>
  );
}

// 11. /airtel-money — Pay with Airtel Money
export function AirtelMoneyPage() {
  return (
    <div className="container" style={{ padding: '24px 16px 48px' }}>
      <PageHeader
        title="Pay with Airtel Money Uganda"
        subtitle="Instant payments using Airtel Money USSD prompt."
        icon="🔴"
        breadcrumbs={[{ label: 'Airtel Money' }]}
      />

      <div style={{ background: '#ffffff', padding: '24px', borderRadius: '12px', border: '1px solid #e2e8f0', marginBottom: '24px' }}>
        <h3 style={{ fontSize: '1.2rem', fontWeight: 800, marginBottom: '12px', color: '#b91c1c' }}>How to Pay via Airtel Money</h3>
        <ol style={{ color: '#475569', lineHeight: 1.8, paddingLeft: '20px' }}>
          <li>Select <strong>Airtel Money</strong> at checkout.</li>
          <li>Enter your Airtel phone number (e.g. <code>070XXXXXXX</code> or <code>075XXXXXXX</code>).</li>
          <li>Confirm the USSD prompt on your phone with your PIN.</li>
          <li>Instant order confirmation and SMS receipt generated.</li>
        </ol>
      </div>
    </div>
  );
}

// 12. /cod — Cash on Delivery
export function CashOnDeliveryPage() {
  return (
    <div className="container" style={{ padding: '24px 16px 48px' }}>
      <PageHeader
        title="Cash on Delivery (COD) Policy"
        subtitle="Pay in cash or mobile money directly to the courier upon receiving your package."
        icon="💵"
        breadcrumbs={[{ label: 'Cash on Delivery' }]}
      />

      <div style={{ background: '#ffffff', padding: '24px', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
        <h3 style={{ fontSize: '1.2rem', fontWeight: 800, marginBottom: '12px' }}>COD Guidelines</h3>
        <p style={{ color: '#475569', lineHeight: 1.6 }}>
          Cash on Delivery is available for eligible orders in Kampala, Wakiso, Mukono, and Entebbe. Please inspect the package exterior before completing payment.
        </p>
      </div>
    </div>
  );
}

// 13. /business — Muni Business
export function MuniBusinessPage() {
  return (
    <div className="container" style={{ padding: '24px 16px 48px' }}>
      <PageHeader
        title="Muni for Business (B2B Procurement)"
        subtitle="Corporate purchasing, tax invoices, and bulk pricing discounts."
        icon="🏢"
        breadcrumbs={[{ label: 'Muni Business' }]}
      />

      <div style={{ background: '#ffffff', padding: '24px', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
        <h3 style={{ fontSize: '1.2rem', fontWeight: 800, marginBottom: '12px' }}>Corporate Accounts</h3>
        <p style={{ color: '#475569', lineHeight: 1.6 }}>
          Get EFRIS-compliant tax receipts, credit payment terms, and dedicated account managers for company procurement.
        </p>
      </div>
    </div>
  );
}

// /bnpl — Muni Buy Now Pay Later
export function MuniBnplPage() {
  const plans = [
    { name: 'Pay in 4', desc: '4 equal instalments, 0% interest, every 2 weeks', fee: '0% interest' },
    { name: 'Pay in 3 Months', desc: 'Spread larger purchases over 3 monthly payments', fee: '2.5%/month' },
    { name: 'Pay in 6 Months', desc: 'For big-ticket items like electronics & appliances', fee: '3%/month' },
  ];

  return (
    <div className="container" style={{ padding: '24px 16px 48px' }}>
      <PageHeader
        title="Muni Buy Now, Pay Later (BNPL)"
        subtitle="Split your purchase into flexible instalments — approved in seconds, no credit card required."
        icon="🧾"
        breadcrumbs={[{ label: 'Muni BNPL' }]}
      />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '16px', marginBottom: '24px' }}>
        {plans.map((p) => (
          <div key={p.name} style={{ background: '#ffffff', padding: '22px', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
            <h3 style={{ fontSize: '1.1rem', fontWeight: 800, marginBottom: '8px', color: '#0f172a' }}>{p.name}</h3>
            <p style={{ color: '#64748b', fontSize: '0.85rem', lineHeight: 1.5, marginBottom: '10px' }}>{p.desc}</p>
            <span style={{ fontSize: '0.8rem', background: '#ecfdf5', color: '#047857', padding: '4px 10px', borderRadius: '6px', fontWeight: 700 }}>
              {p.fee}
            </span>
          </div>
        ))}
      </div>

      <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', padding: '20px 24px', borderRadius: '12px' }}>
        <strong style={{ color: '#1e40af' }}>Eligibility:</strong>{' '}
        <span style={{ color: '#1e3a8a' }}>Available to Muni account holders with a verified MTN or Airtel Mobile Money line and a completed order history.</span>
      </div>
    </div>
  );
}
