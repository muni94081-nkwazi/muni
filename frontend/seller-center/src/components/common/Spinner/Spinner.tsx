import React from 'react';

interface SpinnerProps {
  size?: 'sm' | 'md' | 'lg';
  color?: string;
}

export const Spinner: React.FC<SpinnerProps> = ({ size = 'md', color = '#0066cc' }) => {
  const sizeMap = { sm: '16px', md: '24px', lg: '48px' };
  const d = sizeMap[size];

  return (
    <svg width={d} height={d} viewBox="0 0 50 50" style={{ animation: 'spin 1s linear infinite' }}>
      <circle cx="25" cy="25" r="20" fill="none" stroke={color} strokeWidth="4" strokeDasharray="31.4 31.4" strokeLinecap="round" />
      <style>{`
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}</style>
    </svg>
  );
};
