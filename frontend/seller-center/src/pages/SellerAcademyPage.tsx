import React, { useState } from 'react';

export const SellerAcademyPage: React.FC = () => {
  const [completedSteps, setCompletedSteps] = useState<string[]>(['step-verify', 'step-product', 'step-payout']);
  const [registeredWebinars, setRegisteredWebinars] = useState<string[]>([]);

  const handleToggleStep = (id: string) => {
    setCompletedSteps((prev) => (prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]));
  };

  const handleRegisterWebinar = (id: string) => {
    setRegisteredWebinars((prev) => [...prev, id]);
  };

  const onboardingSteps = [
    { id: 'step-verify', name: 'Submit Business Verification ID / Tax Reg' },
    { id: 'step-product', name: 'Upload 1+ Active Product Listings with Photos' },
    { id: 'step-payout', name: 'Link Mobile Money (MTN/Airtel) or Bank Account' },
    { id: 'step-order', name: 'Fulfill & Dispatch Your First Customer Order' },
  ];

  return (
    <div style={{ maxWidth: 1000, margin: '24px auto', padding: 20, fontFamily: 'system-ui' }}>
      <h2 style={{ fontSize: 22, margin: '0 0 16px 0', color: '#0f172a' }}>🎓 MUNI Seller Academy & Onboarding Hub</h2>

      {/* Onboarding Progress Checklist */}
      <div style={{ background: '#f8fafc', border: '1px solid #cbd5e1', borderRadius: 12, padding: 20, marginBottom: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <h3 style={{ margin: 0, fontSize: 16 }}>📋 Seller Onboarding Checklist</h3>
          <span style={{ fontWeight: 800, fontSize: 16, color: '#0284c7' }}>
            {Math.round((completedSteps.length / onboardingSteps.length) * 100)}% Completed
          </span>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {onboardingSteps.map((step) => {
            const isDone = completedSteps.includes(step.id);
            return (
              <div key={step.id} onClick={() => handleToggleStep(step.id)} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: 10, background: '#fff', borderRadius: 6, border: '1px solid #e2e8f0', cursor: 'pointer' }}>
                <input type="checkbox" checked={isDone} readOnly />
                <span style={{ fontSize: 13, textDecoration: isDone ? 'line-through' : 'none', color: isDone ? '#64748b' : '#0f172a' }}>
                  {step.name}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Video Masterclasses */}
      <h3 style={{ fontSize: 18, marginBottom: 12 }}>📹 Video Masterclasses</h3>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16, marginBottom: 24 }}>
        <div style={{ border: '1px solid #cbd5e1', borderRadius: 8, overflow: 'hidden', background: '#fff' }}>
          <div style={{ height: 140, background: '#0284c7', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 32 }}>▶</div>
          <div style={{ padding: 12 }}>
            <div style={{ fontWeight: 700, fontSize: 14 }}>Setting Up Your Store & Product Listings</div>
            <div style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>12 min • Beginner</div>
          </div>
        </div>
        <div style={{ border: '1px solid #cbd5e1', borderRadius: 8, overflow: 'hidden', background: '#fff' }}>
          <div style={{ height: 140, background: '#16a34a', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 32 }}>▶</div>
          <div style={{ padding: 12 }}>
            <div style={{ fontWeight: 700, fontSize: 14 }}>Launching PPC Search Ads for Maximum ROI</div>
            <div style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>15 min • Intermediate</div>
          </div>
        </div>
      </div>

      {/* Upcoming Webinars */}
      <h3 style={{ fontSize: 18, marginBottom: 12 }}>🗓️ Live Seller Webinars</h3>
      <div style={{ background: '#fff', border: '1px solid #cbd5e1', borderRadius: 8, padding: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: 15 }}>East Africa E-Commerce Growth Summit 2026</div>
          <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>Speaker: Grace Atuhaire, Head of Seller Success • 342 Attendees</div>
        </div>
        <button
          onClick={() => handleRegisterWebinar('webinar-1')}
          disabled={registeredWebinars.includes('webinar-1')}
          style={{ backgroundColor: registeredWebinars.includes('webinar-1') ? '#16a34a' : '#0284c7', color: '#fff', border: 'none', borderRadius: 6, padding: '8px 16px', fontWeight: 700, cursor: 'pointer' }}
        >
          {registeredWebinars.includes('webinar-1') ? '✅ Registered' : 'Register for Webinar'}
        </button>
      </div>
    </div>
  );
};
