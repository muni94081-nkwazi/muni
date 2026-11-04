import React from 'react';
import { Button } from './Button/Button';

interface PaginationProps {
  currentPage: number;
  lastPage: number;
  onPageChange: (page: number) => void;
}

export const Pagination: React.FC<PaginationProps> = ({ currentPage, lastPage, onPageChange }) => {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', justifyContent: 'center', marginTop: 'var(--space-4)' }}>
      <Button variant="outline" size="sm" disabled={currentPage <= 1} onClick={() => onPageChange(currentPage - 1)}>
        Prev
      </Button>
      <span style={{ fontSize: '14px', color: 'var(--color-text-secondary)' }}>
        Page {currentPage} of {lastPage}
      </span>
      <Button variant="outline" size="sm" disabled={currentPage >= lastPage} onClick={() => onPageChange(currentPage + 1)}>
        Next
      </Button>
    </div>
  );
};
