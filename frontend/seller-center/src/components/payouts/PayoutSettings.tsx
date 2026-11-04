import React, { useState } from 'react';

export const PayoutSettings: React.FC = () => {
  const [values, setValues] = useState({ mtn: '+256770000000', airtel: '', bankAccount: '' });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setValues({ ...values, [e.target.name]: e.target.value });
  };

  const inputStyle = { width: '100%', padding: '10px', marginBottom: '16px', border: '1px solid #ccc', borderRadius: '4px' };

  return (
    <div style={{ backgroundColor: '#fff', padding: '24px', borderRadius: '8px', border: '1px solid #e0e0e0', marginTop: '24px', maxWidth: '600px' }}>
      <h3 style={{ marginTop: 0 }}>Payout Methods</h3>
      <form onSubmit={(e) => { e.preventDefault(); alert('Settings saved'); }}>
        <label>MTN MoMo Number</label>
        <input name="mtn" value={values.mtn} onChange={handleChange} placeholder="+256 77X XXX XXX" style={inputStyle} />
        
        <label>Airtel Money Number</label>
        <input name="airtel" value={values.airtel} onChange={handleChange} placeholder="+256 75X XXX XXX" style={inputStyle} />

        <label>Bank Account Number (Optional)</label>
        <input name="bankAccount" value={values.bankAccount} onChange={handleChange} style={inputStyle} />

        <button type="submit" style={{ padding: '12px 24px', backgroundColor: '#0066cc', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>
          Save Settings
        </button>
      </form>
    </div>
  );
};
