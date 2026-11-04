import React, { useRef, useState } from 'react';

interface FileDropzoneProps {
  onFilesSelected: (files: File[]) => void;
  accept?: string;
  multiple?: boolean;
  label?: string;
  hint?: string;
}

export const FileDropzone: React.FC<FileDropzoneProps> = ({
  onFilesSelected,
  accept,
  multiple = false,
  label = 'Drag and drop a file here, or click to browse',
  hint,
}) => {
  const [isDragOver, setIsDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFiles = (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    onFilesSelected(Array.from(fileList));
  };

  return (
    <div
      onClick={() => inputRef.current?.click()}
      onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
      onDragLeave={() => setIsDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setIsDragOver(false);
        handleFiles(e.dataTransfer.files);
      }}
      style={{
        border: `2px dashed ${isDragOver ? 'var(--color-accent)' : 'var(--color-border)'}`,
        borderRadius: 'var(--radius-md)',
        padding: 'var(--space-6)',
        textAlign: 'center',
        cursor: 'pointer',
        backgroundColor: isDragOver ? 'var(--color-bg)' : 'var(--color-surface)',
        transition: 'all 0.15s',
      }}
    >
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        multiple={multiple}
        onChange={(e) => handleFiles(e.target.files)}
        style={{ display: 'none' }}
      />
      <div style={{ fontSize: '28px', marginBottom: 'var(--space-2)' }}>📁</div>
      <div style={{ fontSize: '14px', color: 'var(--color-text-primary)' }}>{label}</div>
      {hint && <div style={{ fontSize: '12px', color: 'var(--color-text-secondary)', marginTop: 'var(--space-1)' }}>{hint}</div>}
    </div>
  );
};
