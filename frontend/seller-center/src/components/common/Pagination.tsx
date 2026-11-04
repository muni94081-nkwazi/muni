import React from 'react';

interface PaginationProps {
  currentPage: number;
  lastPage: number;
  onPageChange: (page: number) => void;
}

export const Pagination: React.FC<PaginationProps> = ({ currentPage, lastPage, onPageChange }) => {
  if (lastPage <= 1) return null;

  const pages = Array.from({ length: lastPage }, (_, i) => i + 1);

  return (
    <div style={{ display: 'flex', justifyContent: 'center', gap: '8px', marginTop: '24px' }}>
      <button
        disabled={currentPage === 1}
        onClick={() => onPageChange(currentPage - 1)}
        style={{ padding: '8px 12px', border: '1px solid #e0e0e0', borderRadius: '4px', background: '#fff', cursor: currentPage === 1 ? 'not-allowed' : 'pointer' }}
      >
        Prev
      </button>
      {pages.map(page => (
        <button
          key={page}
          onClick={() => onPageChange(page)}
          style={{
            padding: '8px 12px', border: '1px solid #e0e0e0', borderRadius: '4px', cursor: 'pointer',
            background: currentPage === page ? '#0066cc' : '#fff', color: currentPage === page ? '#fff' : '#333'
          }}
        >
          {page}
        </button>
      ))}
      <button
        disabled={currentPage === lastPage}
        onClick={() => onPageChange(currentPage + 1)}
        style={{ padding: '8px 12px', border: '1px solid #e0e0e0', borderRadius: '4px', background: '#fff', cursor: currentPage === lastPage ? 'not-allowed' : 'pointer' }}
      >
        Next
      </button>
    </div>
  );
};
