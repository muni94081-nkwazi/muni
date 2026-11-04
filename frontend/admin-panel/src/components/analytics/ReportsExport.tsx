import React, { useState } from 'react';

export const ReportsExport: React.FC = () => {
  const [exporting, setExporting] = useState(false);

  function handleExport(type: string) {
    setExporting(true);
    setTimeout(() => {
      setExporting(false);
      alert(`${type} report exported successfully!`);
    }, 1500);
  }

  return (
    <div style={{ background: 'var(--color-surface)', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)', padding: 'var(--space-4)' }}>
      <h3 style={{ fontWeight: 700, marginBottom: 16, fontSize: 'var(--text-base)' }}>Export Reports</h3>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        {['Sales Report', 'User Report', 'Seller Report', 'Orders Report', 'Revenue Report'].map((report) => (
          <button
            key={report}
            onClick={() => handleExport(report)}
            disabled={exporting}
            style={{ padding: '8px 16px', border: '1px solid var(--color-border)', borderRadius: 6, background: exporting ? '#f1f5f9' : '#fff', cursor: exporting ? 'not-allowed' : 'pointer', fontSize: 13, fontWeight: 600, color: '#475569', display: 'flex', alignItems: 'center', gap: 6 }}
          >
            📥 {report}
          </button>
        ))}
      </div>
      {exporting && <p style={{ marginTop: 12, fontSize: 12, color: '#64748b' }}>⏳ Generating report...</p>}
    </div>
  );
};
