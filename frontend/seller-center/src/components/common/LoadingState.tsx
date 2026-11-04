import React from 'react';
import { Spinner } from './Spinner/Spinner';

interface LoadingStateProps {
  message?: string;
}

export const LoadingState: React.FC<LoadingStateProps> = ({ message = 'Loading...' }) => {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      height: '100%', minHeight: '300px'
    }}>
      <Spinner size="lg" />
      <p style={{ marginTop: '16px', color: '#5f6368', fontWeight: 500 }}>{message}</p>
    </div>
  );
};
