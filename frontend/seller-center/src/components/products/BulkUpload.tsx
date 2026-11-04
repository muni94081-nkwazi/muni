import React, { useState } from 'react';
import { Table } from '../common/Table/Table';

export const BulkUpload: React.FC = () => {
  const [file, setFile] = useState<File | null>(null);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      setFile(e.dataTransfer.files[0]);
    }
  };

  return (
    <div style={{ backgroundColor: '#fff', padding: '24px', borderRadius: '8px', border: '1px solid #e0e0e0', marginTop: '24px' }}>
      <h3 style={{ marginTop: 0 }}>Bulk Upload Products</h3>
      <p style={{ color: '#5f6368', fontSize: '0.875rem' }}>Upload a CSV file with: name, sku, price, stock, category, description</p>
      
      <div 
        onDrop={handleDrop} 
        onDragOver={e => e.preventDefault()}
        style={{ border: '2px dashed #0066cc', padding: '48px', textAlign: 'center', borderRadius: '8px', cursor: 'pointer', backgroundColor: '#f8f9fa' }}
      >
        <div style={{ fontSize: '32px' }}>📄</div>
        <p>Drag and drop CSV file here or click to browse</p>
        <input type="file" accept=".csv" onChange={e => e.target.files && setFile(e.target.files[0])} style={{ display: 'none' }} id="fileUpload" />
        <label htmlFor="fileUpload" style={{ color: '#0066cc', textDecoration: 'underline', cursor: 'pointer' }}>Browse files</label>
      </div>

      {file && (
        <div style={{ marginTop: '16px' }}>
          <p>Selected file: {file.name}</p>
          <button style={{ padding: '10px 16px', backgroundColor: '#0066cc', color: '#fff', border: 'none', borderRadius: '4px' }}>
            Upload File
          </button>
        </div>
      )}
    </div>
  );
};
