import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { ErrorBoundary } from '@/components/common/ErrorBoundary/ErrorBoundary';
import { registerServiceWorker } from '@/pwa/registerServiceWorker';
import { captureError, initSentry } from '@/observability/sentry';
import { logger } from '@/utils/logger';
import '@/styles/index.css';

// Before the tree renders, so an error thrown during the first paint is
// reported rather than lost. No-op unless VITE_SENTRY_DSN is set.
initSentry();

const rootElement = document.getElementById('root');

if (!rootElement) {
  throw new Error('Root element #root not found in index.html');
}

// Surface unhandled promise rejections through the guarded logger instead of
// leaving them as unactionable "Uncaught (in promise)" browser console spam.
window.addEventListener('unhandledrejection', (event) => {
  logger.error('[unhandledrejection]', event.reason);
  captureError(event.reason, { source: 'unhandledrejection' });
  event.preventDefault();
});

/**
 * Promote the web-font stylesheet from `media="print"` to `all`.
 *
 * index.html requests Google Fonts with `media="print"` so the fetch does not
 * block first paint — on a Ugandan 3G link a render-blocking third-origin
 * stylesheet is most of a second of white screen. Something has to flip it back
 * once it has arrived, and that used to be an inline `onload` attribute on the
 * <link>. CSP counts an inline handler as inline script, so under
 * `script-src 'self'` it silently never ran and the fonts never applied.
 *
 * Doing it here costs one frame more than the attribute did and is allowed by
 * the policy. The <noscript> fallback in index.html still covers JS-disabled.
 */
const webfonts = document.getElementById('webfonts') as HTMLLinkElement | null;
if (webfonts) {
  if (webfonts.sheet) {
    // Already downloaded and parsed — swap immediately rather than waiting for
    // a load event that has already fired.
    webfonts.media = 'all';
  } else {
    webfonts.addEventListener('load', () => { webfonts.media = 'all'; }, { once: true });
  }
}

createRoot(rootElement).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);

registerServiceWorker();
