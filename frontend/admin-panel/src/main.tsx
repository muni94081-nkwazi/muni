import React from 'react';
import ReactDOM from 'react-dom/client';
import { Provider } from 'react-redux';
import { BrowserRouter } from 'react-router-dom';
import { App } from './App';
import { store } from './store';
import { ErrorBoundary } from '@/components/common/ErrorBoundary/ErrorBoundary';
import { logger } from '@/utils/logger';
import './styles/index.css';

// Surface unhandled promise rejections through the guarded logger instead of
// leaving them as unactionable "Uncaught (in promise)" browser console spam.
window.addEventListener('unhandledrejection', (event) => {
  logger.error('[unhandledrejection]', event.reason);
  event.preventDefault();
});

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <ErrorBoundary>
      <Provider store={store}>
        {/* basename strips the /admin prefix before route matching, so the
            route paths in ./router stay mount-point agnostic. BASE_URL is
            vite's `base` ('/admin/'), minus the trailing slash. */}
        <BrowserRouter basename={import.meta.env.BASE_URL.replace(/\/$/, '')}>
          <App />
        </BrowserRouter>
      </Provider>
    </ErrorBoundary>
  </React.StrictMode>
);
