import React, { useState } from 'react';

export const LoyaltyDashboardPage: React.FC = () => {
  const [userData, setUserData] = useState({
    points: 2450,
    tier: 'GOLD',
    tierProgress: 49,
    lifetimePoints: 6450,
    referralCode: 'REF-USER123-8899',
  });

  const [claimedBirthday, setClaimedBirthday] = useState(false);

  const handleClaimBirthday = () => {
    setUserData((prev) => ({ ...prev, points: prev.points + 50 }));
    setClaimedBirthday(true);
  };

  return (
    <div style={{ maxWidth: 900, margin: '24px auto', padding: 20, fontFamily: 'system-ui' }}>
      {/* Loyalty Header Card */}
      <div style={{ background: 'linear-gradient(135deg, #0284c7 0%, #0369a1 100%)', color: '#fff', borderRadius: 16, padding: 24, boxShadow: '0 10px 24px rgba(2,132,199,0.3)', marginBottom: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <span style={{ background: 'rgba(255,255,255,0.2)', padding: '4px 12px', borderRadius: 12, fontSize: 11, fontWeight: 800, letterSpacing: 1 }}>
              MUNI LOYALTY REWARDS
            </span>
            <h2 style={{ margin: '8px 0 0 0', fontSize: 32 }}>🏆 {userData.points.toLocaleString()} Points</h2>
            <div style={{ fontSize: 13, opacity: 0.9, marginTop: 4 }}>Lifetime Points Earned: {userData.lifetimePoints.toLocaleString()} pts</div>
          </div>
          <div style={{ textAlign: 'right', background: 'rgba(255,255,255,0.15)', padding: '12px 20px', borderRadius: 12 }}>
            <span style={{ fontSize: 11, textTransform: 'uppercase', opacity: 0.9 }}>Current Tier</span>
            <div style={{ fontSize: 22, fontWeight: 800 }}>⭐ {userData.tier}</div>
          </div>
        </div>

        {/* Progress Bar */}
        <div style={{ marginTop: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
            <span>Progress to PLATINUM Level</span>
            <span>{userData.tierProgress}%</span>
          </div>
          <div style={{ height: 8, background: 'rgba(255,255,255,0.3)', borderRadius: 4, overflow: 'hidden' }}>
            <div style={{ width: `${userData.tierProgress}%`, height: '100%', background: '#fff' }} />
          </div>
        </div>
      </div>

      {/* Birthday & Referral Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 24 }}>
        {/* Referral Card */}
        <div style={{ background: '#fff', border: '1px solid #cbd5e1', borderRadius: 12, padding: 16 }}>
          <h3 style={{ margin: '0 0 4px 0', fontSize: 16 }}>🤝 Refer a Friend (+100 Pts)</h3>
          <p style={{ fontSize: 12, color: '#64748b', margin: 0 }}>Share your referral code to get 100 points when friends make their first order!</p>
          <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
            <input readOnly value={userData.referralCode} style={{ flex: 1, padding: 8, borderRadius: 6, border: '1px solid #cbd5e1', fontSize: 12, fontWeight: 700 }} />
            <button style={{ backgroundColor: '#0284c7', color: '#fff', border: 'none', borderRadius: 6, padding: '8px 14px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
              Copy Link
            </button>
          </div>
        </div>

        {/* Birthday Card */}
        <div style={{ background: '#fff', border: '1px solid #cbd5e1', borderRadius: 12, padding: 16 }}>
          <h3 style={{ margin: '0 0 4px 0', fontSize: 16 }}>🎂 Annual Birthday Reward (+50 Pts)</h3>
          <p style={{ fontSize: 12, color: '#64748b', margin: 0 }}>Claim your annual 50 bonus points during your birthday month!</p>
          <button
            onClick={handleClaimBirthday}
            disabled={claimedBirthday}
            style={{ marginTop: 12, width: '100%', backgroundColor: claimedBirthday ? '#16a34a' : '#16a34a', color: '#fff', border: 'none', borderRadius: 6, padding: 10, fontWeight: 700, cursor: claimedBirthday ? 'default' : 'pointer' }}
          >
            {claimedBirthday ? '✅ Birthday Bonus Claimed!' : '🎉 Claim 50 Points Now'}
          </button>
        </div>
      </div>

      {/* Rewards Catalog */}
      <h3 style={{ fontSize: 18, marginBottom: 12 }}>🎁 Available Rewards Catalog</h3>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 16 }}>
        <div style={{ background: '#fff', border: '1px solid #cbd5e1', borderRadius: 8, padding: 16, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
          <div>
            <span style={{ background: '#f0f9ff', color: '#0284c7', fontSize: 11, fontWeight: 800, padding: '2px 8px', borderRadius: 10 }}>500 POINTS</span>
            <h4 style={{ margin: '8px 0 4px 0', fontSize: 15 }}>5,000 UGX Off Coupon</h4>
            <p style={{ fontSize: 12, color: '#64748b', margin: 0 }}>Instant 5,000 UGX checkout discount voucher.</p>
          </div>
          <button style={{ marginTop: 14, backgroundColor: '#0284c7', color: '#fff', border: 'none', borderRadius: 6, padding: 8, fontWeight: 700, cursor: 'pointer' }}>
            Redeem for 500 Pts
          </button>
        </div>

        <div style={{ background: '#fff', border: '1px solid #cbd5e1', borderRadius: 8, padding: 16, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
          <div>
            <span style={{ background: '#f0fdf4', color: '#16a34a', fontSize: 11, fontWeight: 800, padding: '2px 8px', borderRadius: 10 }}>750 POINTS</span>
            <h4 style={{ margin: '8px 0 4px 0', fontSize: 15 }}>Free Standard Delivery</h4>
            <p style={{ fontSize: 12, color: '#64748b', margin: 0 }}>Free shipping voucher for any nationwide delivery in Uganda.</p>
          </div>
          <button style={{ marginTop: 14, backgroundColor: '#16a34a', color: '#fff', border: 'none', borderRadius: 6, padding: 8, fontWeight: 700, cursor: 'pointer' }}>
            Redeem for 750 Pts
          </button>
        </div>
      </div>
    </div>
  );
};
