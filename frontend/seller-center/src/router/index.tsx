import { createBrowserRouter } from 'react-router-dom';
import SellerLayout from '@/components/layout/SellerLayout';
import { PrivateRoute } from './PrivateRoute';
import { AuthenticatedRoute } from './AuthenticatedRoute';
import LoginPage from '@/pages/LoginPage';
import RegisterPage from '@/pages/RegisterPage';
import UnauthorizedPage from '@/pages/UnauthorizedPage';
import { DashboardPage } from '@/pages/DashboardPage';
import { ProductsPage } from '@/pages/ProductsPage';
import { ProductCreatePage } from '@/pages/ProductCreatePage';
import { ProductEditPage } from '@/pages/ProductEditPage';
import { InventoryPage } from '@/pages/InventoryPage';
import { OrdersPage } from '@/pages/OrdersPage';
import { OrderFulfillmentPage } from '@/pages/OrderFulfillmentPage';
import { PayoutsPage } from '@/pages/PayoutsPage';
import { AnalyticsPage } from '@/pages/AnalyticsPage';
import { SettingsPage } from '@/pages/SettingsPage';
import DisputesReturnsPage from '@/pages/DisputesReturnsPage';
import SellerMessagesPage from '@/pages/SellerMessagesPage';
import StorefrontCustomizerPage from '@/pages/StorefrontCustomizerPage';
import ContainerSubmissionsPage from '@/pages/ContainerSubmissionsPage';
import SellerApplicationPage from '@/pages/SellerApplicationPage';
import MfaSetupPage from '@/pages/MfaSetupPage';
import MfaChallengePage from '@/pages/MfaChallengePage';
import RouteErrorPage from '@/pages/RouteErrorPage';

// ─── Route table ──────────────────────────────────────────────────────────────
//
// Everything hangs off one pathless root so a single `errorElement` covers the
// whole app. Without it, react-router falls back to its own developer screen
// ("Unexpected Application Error! … 💿 Hey developer 👋"), which is what a
// seller saw for any mistyped URL or any error thrown while a route rendered.
//
// The root ErrorBoundary in main.tsx does not help here: RouterProvider handles
// route errors internally and never lets them reach a React error boundary
// above it.
//
// A pathless route does not affect matching — the child paths below stay
// absolute and are unchanged.
export const router = createBrowserRouter([
  {
    errorElement: <RouteErrorPage />,
    children: [
      { path: '/login', element: <LoginPage /> },
      { path: '/register', element: <RegisterPage /> },
      { path: '/unauthorized', element: <UnauthorizedPage /> },
      // Unauthenticated by design: the caller has no session yet — that is exactly
      // what these two steps exist to obtain. Each is gated on the signed,
      // five-minute credential auth-service issued, carried in router state.
      { path: '/mfa/setup', element: <MfaSetupPage /> },
      { path: '/mfa/verify', element: <MfaChallengePage /> },
      // Signed in, but seller access not required: this is where a customer
      // applies to become one, and where they read the real status afterwards.
      {
        element: <AuthenticatedRoute />,
        children: [{ path: '/apply', element: <SellerApplicationPage /> }],
      },
      {
        element: <PrivateRoute />,
        children: [
          {
            path: '/',
            element: <SellerLayout />,
            children: [
              { index: true, element: <DashboardPage /> },
              { path: 'products', element: <ProductsPage /> },
              { path: 'products/new', element: <ProductCreatePage /> },
              { path: 'products/:id/edit', element: <ProductEditPage /> },
              { path: 'inventory', element: <InventoryPage /> },
              { path: 'orders', element: <OrdersPage /> },
              { path: 'orders/:id', element: <OrderFulfillmentPage /> },
              { path: 'disputes-returns', element: <DisputesReturnsPage /> },
              { path: 'messages', element: <SellerMessagesPage /> },
              { path: 'store-settings', element: <StorefrontCustomizerPage /> },
              { path: 'container-submissions', element: <ContainerSubmissionsPage /> },
              { path: 'payouts', element: <PayoutsPage /> },
              { path: 'analytics', element: <AnalyticsPage /> },
              { path: 'settings', element: <SettingsPage /> },
            ],
          },
        ],
      },
      // Anything that matched nothing above. Rendered as a page rather than left
      // to throw, so an unknown address is an ordinary "not found" screen with a
      // way back instead of an error — and so a signed-out visitor who mistypes a
      // URL is not pushed through PrivateRoute to a login form first.
      { path: '*', element: <RouteErrorPage /> },
    ],
  },
], {
  // Strips the /seller prefix before route matching, so every `path` above stays
  // mount-point agnostic. BASE_URL is vite's `base` ('/seller/'), minus the
  // trailing slash react-router does not want.
  basename: import.meta.env.BASE_URL.replace(/\/$/, ''),
});
