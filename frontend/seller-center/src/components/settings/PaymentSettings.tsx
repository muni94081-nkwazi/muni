import { useState, type FormEvent } from 'react';

export function PaymentSettings() {
  const [mtnNumber, setMtnNumber] = useState('+256 770 123456');
  const [airtelNumber, setAirtelNumber] = useState('');
  const [bankName, setBankName] = useState('');
  const [bankAccount, setBankAccount] = useState('');
  const [saved, setSaved] = useState(false);

  function handleSave(e: FormEvent) {
    e.preventDefault();
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  const inputStyle = { width: '100%', padding: '8px 12px', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: 14, boxSizing: 'border-box' as const };
  const labelStyle = { display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 4, color: '#0f172a' } as const;

  return (
    <form onSubmit={handleSave}>
      <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 20 }}>Payment Settings</h3>
      <p style={{ fontSize: 13, color: '#64748b', marginBottom: 20 }}>Configure your payout accounts. Payouts are processed within 1-2 business days.</p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20, maxWidth: 480 }}>
        <div style={{ padding: 20, border: '1px solid #e2e8f0', borderRadius: 8, background: '#fef9ef' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
            <span style={{ fontSize: 24 }}>📱</span>
            <p style={{ fontWeight: 700 }}>MTN Mobile Money</p>
          </div>
          <label style={labelStyle}>MTN MoMo Number</label>
          <input value={mtnNumber} onChange={(e) => setMtnNumber(e.target.value)} placeholder="+256 77X XXXXXX" style={inputStyle} />
        </div>
        <div style={{ padding: 20, border: '1px solid #e2e8f0', borderRadius: 8, background: '#fef0f0' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
            <span style={{ fontSize: 24 }}>📱</span>
            <p style={{ fontWeight: 700 }}>Airtel Money</p>
          </div>
          <label style={labelStyle}>Airtel Money Number</label>
          <input value={airtelNumber} onChange={(e) => setAirtelNumber(e.target.value)} placeholder="+256 75X XXXXXX" style={inputStyle} />
        </div>
        <div style={{ padding: 20, border: '1px solid #e2e8f0', borderRadius: 8, background: '#f0f7ff' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
            <span style={{ fontSize: 24 }}>🏦</span>
            <p style={{ fontWeight: 700 }}>Bank Account</p>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div><label style={labelStyle}>Bank Name</label><input value={bankName} onChange={(e) => setBankName(e.target.value)} placeholder="Centenary Bank, Stanbic, etc." style={inputStyle} /></div>
            <div><label style={labelStyle}>Account Number</label><input value={bankAccount} onChange={(e) => setBankAccount(e.target.value)} placeholder="0001234567890" style={inputStyle} /></div>
          </div>
        </div>
        <button type="submit" style={{ background: saved ? '#10b981' : '#3b82f6', color: '#fff', border: 'none', borderRadius: 6, padding: '10px 24px', fontWeight: 600, cursor: 'pointer', fontSize: 14, alignSelf: 'flex-start', transition: 'background 0.2s' }}>
          {saved ? '✓ Saved!' : 'Save Payment Settings'}
        </button>
      </div>
    </form>
  );
}
