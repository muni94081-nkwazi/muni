// @vitest-environment jsdom
//
// seller-center's other suites are API-payload tests and run in node. This one
// renders a component, so it asks for a DOM per-file rather than switching the
// whole package over.
import { describe, expect, it, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';

// ─── Route errors ─────────────────────────────────────────────────────────────
//
// The router had no `errorElement` and no catch-all, so any unmatched URL — a
// mistyped address, a stale bookmark, a renamed route — produced react-router's
// built-in developer screen:
//
//   Unexpected Application Error!  404 Not Found
//   💿 Hey developer 👋  You can provide a way better UX than this…
//
// It talks to the developer rather than the seller, offers no way back, and is
// what a seller in Kampala would have seen on a bad link.
//
// The root ErrorBoundary in main.tsx never caught these: RouterProvider handles
// route errors itself and does not let them reach a React error boundary above
// it, so the fix had to be at the router.

const { RouteErrorPage } = await import('../RouteErrorPage');

/** Mount the page the way the catch-all `*` route does: a plain element. */
function renderUnmatched() {
  const router = createMemoryRouter(
    [
      { path: '/', element: <div>dashboard</div> },
      { path: '*', element: <RouteErrorPage /> },
    ],
    { initialEntries: ['/no-such-page'] },
  );
  return render(<RouterProvider router={router} />);
}

/** Mount it the way the router does for a route that threw. */
function renderThrown(thrown: unknown) {
  const router = createMemoryRouter(
    [
      {
        path: '/boom',
        element: <Boom thrown={thrown} />,
        errorElement: <RouteErrorPage />,
      },
    ],
    { initialEntries: ['/boom'] },
  );
  return render(<RouterProvider router={router} />);
}

function Boom({ thrown }: { thrown: unknown }): React.ReactElement {
  throw thrown;
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('an address that matches no route', () => {
  it('says the page was not found, in the seller’s language', async () => {
    renderUnmatched();

    expect(screen.getByRole('heading', { name: /page not found/i })).toBeTruthy();
    expect(screen.getByText(/does not match anything in the seller center/i)).toBeTruthy();
  });

  it('never shows react-router’s developer fallback', async () => {
    renderUnmatched();

    expect(screen.queryByText(/unexpected application error/i)).toBeNull();
    expect(screen.queryByText(/hey developer/i)).toBeNull();
  });

  it('offers a way back rather than being a dead end', async () => {
    renderUnmatched();

    expect(screen.getByRole('button', { name: /back to dashboard/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /go to my products/i })).toBeTruthy();
  });

  it('does not offer a reload, which would land on the same missing page', async () => {
    renderUnmatched();
    expect(screen.queryByRole('button', { name: /reload/i })).toBeNull();
  });
});

describe('a route that threw while rendering', () => {
  it('reports a fault rather than a missing page', async () => {
    // react-router logs the caught error itself; silenced so the suite output
    // stays readable.
    vi.spyOn(console, 'error').mockImplementation(() => undefined);

    renderThrown(new Error('kaboom'));

    expect(screen.getByRole('heading', { name: /something went wrong/i })).toBeTruthy();
  });

  it('offers a reload, because a failed chunk fetch often succeeds on retry', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);

    renderThrown(new Error('kaboom'));

    expect(screen.getByRole('button', { name: /reload the page/i })).toBeTruthy();
  });

  it('shows the underlying message in dev, which is the one thing the old screen did well', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);

    renderThrown(new Error('kaboom'));

    // import.meta.env.DEV is true under vitest.
    expect(screen.getByText(/kaboom/)).toBeTruthy();
  });
});

describe('a non-Error value thrown by a route', () => {
  it('still reads as a fault rather than rendering nothing', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);

    // Not everything thrown is an Error — a rejected fetch can surface a
    // Response, a bad `throw` can surface a string.
    renderThrown('something odd');

    expect(screen.getByRole('heading', { name: /something went wrong/i })).toBeTruthy();
  });
});
