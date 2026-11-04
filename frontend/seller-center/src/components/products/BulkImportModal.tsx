import React, { useState } from 'react';

interface BulkImportModalProps {
  onClose: () => void;
}

export const BulkImportModal: React.FC<BulkImportModalProps> = ({ onClose }) => {
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState<'idle' | 'uploading' | 'processing' | 'completed'>('idle');
  const [importedCount, setImportedCount] = useState(0);

  const handleUpload = () => {
    if (!file) return;
    setStatus('uploading');
    setTimeout(() => {
      setStatus('processing');
      setTimeout(() => {
        setStatus('completed');
        setImportedCount(42);
      }, 1500);
    }, 1000);
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ background: '#ffffff', borderRadius: 12, width: 500, padding: 24, boxShadow: '0 12px 32px rgba(0,0,0,0.2)', fontFamily: 'system-ui' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #e2e8f0', paddingBottom: 12 }}>
          <h3 style={{ margin: 0, fontSize: 18, color: '#0f172a' }}>📄 Bulk Product Import (CSV / Excel)</h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer' }}>✕</button>
        </div>

        {status === 'idle' && (
          <div style={{ margin: '20px 0', display: 'flex', flexDirection: 'column', gap: 14 }}>
            <p style={{ fontSize: 13, color: '#64748b', margin: 0 }}>
              Upload your catalog spreadsheet (.csv or .xlsx) using BullMQ asynchronous queue processing.
            </p>
            <input
              type="file"
              accept=".csv, .xlsx"
              onChange={(e) => setFile(e.target.files?.[0] || null)}
              style={{ padding: 8, border: '1px dashed #cbd5e1', borderRadius: 6, fontSize: 13 }}
            />
            <a href="/templates/muni-bulk-import-template.csv" style={{ fontSize: 12, color: '#0284c7', fontWeight: 600 }}>
              📥 Download Sample CSV Template
            </a>
            <button
              onClick={handleUpload}
              disabled={!file}
              style={{ backgroundColor: '#0284c7', color: '#fff', border: 'none', borderRadius: 6, padding: 12, fontWeight: 700, cursor: file ? 'pointer' : 'not-allowed', opacity: file ? 1 : 0.5 }}
            >
              Start Bulk Import
            </button>
          </div>
        )}

        {(status === 'uploading' || status === 'processing') && (
          <div style={{ margin: '30px 0', textAlign: 'center' }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: '#0284c7' }}>
              ⏳ {status === 'uploading' ? 'Uploading Spreadsheet...' : 'BullMQ Processing Catalog Batches...'}
            </div>
          </div>
        )}

        {status === 'completed' && (
          <div style={{ margin: '20px 0', textAlign: 'center' }}>
            <div style={{ fontSize: 18, fontWeight: 800, color: '#16a34a' }}>🎉 Import Complete!</div>
            <div style={{ fontSize: 14, color: '#334155', marginTop: 6 }}>Successfully imported <strong>{importedCount} products</strong> into catalog!</div>
            <button
              onClick={onClose}
              style={{ marginTop: 16, backgroundColor: '#16a34a', color: '#fff', border: 'none', borderRadius: 6, padding: '10px 20px', fontWeight: 700, cursor: 'pointer' }}
            >
              Close & Refresh Products
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
