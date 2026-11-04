import React from 'react';
import { useNavigate, useRouteError, isRouteErrorResponse } from 'react-router-dom';
import { ROUTES } from '../router/routes';
import { Button } from '../components/common/Button/Button';
import { logger } from '@/utils/logger';

// ─── Route errors ─────────────────────────────────────────────────────────────
//
// What a seller saw before this existed:
//
//   Unexpected Application Error!
//   404 Not Found
//   💿 Hey developer 👋  You can provide a way better UX than this when your app
//   throws errors by providing your own ErrorBoundary or errorElement prop…
//
// That is react-router's built-in fallback, and it appears for every unmatched
// URL — a mistyped address, a stale bookmark, a link to a route that has since
// been renamed — as well as for any error thrown while a route renders. It
// addresses the developer rather than the seller, offers no way back, and on a
// production deploy leaks the router's internals to whoever hit it.
//
// The root ErrorBoundary in main.tsx does not catch these: RouterProvider
// handles route errors itself and never lets them reach a React error boundary
// above it, which is why that one was not enough.
//
// Two distinct cases, deliberately worded differently — "this page does not
// exist" and "this page broke" are different problems with different fixes.

/**
 * Copy for the two cases that can actually reach this page.
 *
 * Only two, deliberately. Status-specific copy for 401/403 was written and then
 * removed: this router has no loaders, so the only route errors it can produce
 * are an unmatched path (404) and a component that threw. Permission failures
 * are handled long before this — PrivateRoute redirects to /unauthorized, which
 * is its own page — so a 403 branch here would have been unreachable code that
 * no test could honestly cover.
 */
function describe(notFound: boolean): { icon: string; title: string; body: string } {
  return notFound
    ? {
        icon:  '🧭',
        title: 'Page not found',
        body:  'That address does not match anything in the Seller Center. It may have been moved, or the link may have a typo in it.',
      }
    : {
        icon:  '⚠️',
        title: 'Something went wrong',
        body:  'The page could not be opened. This is our fault, not yours.',
      };
}

export const RouteErrorPage: React.FC = () => {
  const error = useRouteError();
  const navigate = useNavigate();

  // This component is mounted two ways: as the router's `errorElement`, where
  // `useRouteError` returns what was thrown, and as the catch-all `*` route,
  // where nothing was thrown and it returns undefined. The second case is not
  // an error at all — the address simply matched no route — so it reads as a
  // plain 404 rather than falling through to "something went wrong".
  const unmatched = error == null;
  const routeResponse = isRouteErrorResponse(error);
  const notFound = unmatched || (routeResponse && error.status === 404);
  const { icon, title, body } = describe(notFound);

  // A 404 is a normal thing for a person to do and not worth logging as a
  // fault; anything else is a real failure someone should be able to find.
  if (!notFound) {
    logger.error('[route-error]', error);
  }

  // The one thing react-router's screen did well was tell a developer what
  // actually happened. Kept, but only in dev — in production this is a seller
  // looking at it, and the detail is noise at best.
  const detail = import.meta.env.DEV && !unmatched
    ? routeResponse
      ? `${error.status} ${error.statusText}`
      : error instanceof Error
        ? error.message
        : String(error)
    : null;

  return (
    <div
      style={{
        minHeight:       '100vh',
        display:         'flex',
        alignItems:      'center',
        justifyContent:  'center',
        padding:         'var(--spacing-4)',
        backgroundColor: 'var(--color-sidebar-bg)',
      }}
    >
      <div
        style={{
          width:           '100%',
          maxWidth:        '460px',
          textAlign:       'center',
          backgroundColor: 'var(--color-surface)',
          padding:         'var(--spacing-8)',
          borderRadius:    'var(--radius-lg)',
          boxShadow:       'var(--shadow-md)',
        }}
      >
        <div style={{ fontSize: '2.5rem', marginBottom: 'var(--spacing-3)' }}>{icon}</div>

        <h1 style={{ margin: 0, fontSize: '1.25rem', color: 'var(--color-text-primary)' }}>
          {title}
        </h1>

        <p
          style={{
            color:      'var(--color-text-secondary)',
            fontSize:   '0.9rem',
            margin:     'var(--spacing-2) 0 var(--spacing-6)',
            lineHeight: 1.5,
          }}
        >
          {body}
        </p>

        <Button fullWidth onClick={() => navigate(ROUTES.DASHBOARD)}>
          Back to dashboard
        </Button>

        <div style={{ marginTop: 'var(--spacing-3)' }}>
          <Button fullWidth variant="ghost" onClick={() => navigate(ROUTES.PRODUCTS)}>
            Go to my products
          </Button>
        </div>

        {/* A render error can be transient — a failed chunk fetch on a flaky
            connection is the common one — so reloading is worth offering.
            A 404 will still be a 404 after a reload, so it is not offered there. */}
        {!notFound && (
          <div style={{ marginTop: 'var(--spacing-3)' }}>
            <Button fullWidth variant="ghost" onClick={() => window.location.reload()}>
              Reload the page
            </Button>
          </div>
        )}

        {detail && (
          <pre
            style={{
              marginTop:  'var(--spacing-6)',
              marginBottom: 0,
              padding:    'var(--spacing-3)',
              textAlign:  'left',
              fontSize:   '0.75rem',
              whiteSpace: 'pre-wrap',
              wordBreak:  'break-word',
              color:      'var(--color-text-secondary)',
              background: 'var(--color-surface-muted)',
              border:     '1px solid var(--color-border)',
              borderRadius: 'var(--radius-md)',
            }}
          >
            {detail}
          </pre>
        )}
      </div>
    </div>
  );
};

export default RouteErrorPage;
