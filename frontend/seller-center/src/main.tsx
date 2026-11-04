import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { ErrorBoundary } from '@/components/common/ErrorBoundary/ErrorBoundary';
import { logger } from '@/utils/logger';
import './styles/index.css';

// Surface unhandled promise rejections through the guarded logger instead of
// leaving them as unactionable "Uncaught (in promise)" browser console spam.
window.addEventListener('unhandledrejection', (event) => {
  logger.error('[unhandledrejection]', event.reason);
  event.preventDefault();
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
);
