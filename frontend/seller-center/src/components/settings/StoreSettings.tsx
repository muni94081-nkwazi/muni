import React, { useState } from 'react';

export const StoreSettings: React.FC = () => {
  const [values, setValues] = useState({
    name: 'My Store', type: 'sole trader', description: '', email: 'vendor@example.com', phone: '+256700000000', address: 'Kampala, Uganda'
  });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    setValues({ ...values, [e.target.name]: e.target.value });
  };

  const inputStyle = { width: '100%', padding: '10px', marginBottom: '16px', border: '1px solid #ccc', borderRadius: '4px' };

  return (
    <div style={{ backgroundColor: '#fff', padding: '24px', borderRadius: '8px', border: '1px solid #e0e0e0', maxWidth: '600px' }}>
      <h3 style={{ marginTop: 0 }}>Store Profile</h3>
      <form onSubmit={(e) => { e.preventDefault(); alert('Saved'); }}>
        <label>Store Name *</label>
        <input name="name" required value={values.name} onChange={handleChange} style={inputStyle} />
        
        <label>Business Type</label>
        <select name="type" value={values.type} onChange={handleChange} style={inputStyle}>
          <option value="sole trader">Sole Trader</option>
          <option value="company">Company</option>
          <option value="partnership">Partnership</option>
        </select>

        <label>Description</label>
        <textarea name="description" value={values.description} onChange={handleChange} style={{ ...inputStyle, minHeight: '100px' }} />

        <label>Contact Email *</label>
        <input name="email" type="email" required value={values.email} onChange={handleChange} style={inputStyle} />

        <label>Contact Phone (Uganda +256) *</label>
        <input name="phone" required value={values.phone} onChange={handleChange} style={inputStyle} />

        <label>Kampala Address</label>
        <input name="address" value={values.address} onChange={handleChange} style={inputStyle} />

        <button type="submit" style={{ padding: '12px 24px', backgroundColor: '#0066cc', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>
          Save Store Settings
        </button>
      </form>
    </div>
  );
};
