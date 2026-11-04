import { lazy, Suspense, type ComponentType, type ReactElement } from 'react';
import { createBrowserRouter } from 'react-router-dom';
import { MainLayout } from '@/components/layout/MainLayout';
import { AuthLayout } from '@/components/layout/AuthLayout';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { PrivateRoute } from './PrivateRoute';
import { LoadingState } from '@/components/common/LoadingState';

// ---------------------------------------------------------------------------
// Eager: the app shell and the landing route.
//
// The four layouts stay eager on purpose. They're small (19-166 lines, no heavy
// deps) and they're the *parent* route element — making them lazy too would put
// a second Suspense boundary above every page, so a single navigation would show
// the fallback twice in sequence (layout chunk, then page chunk) instead of once.
//
// HomePage is eager because it IS the landing route: lazy-loading it would add a
// network round-trip to the one paint that matters most for LCP.
// ---------------------------------------------------------------------------
import { HomePage } from '@/pages/HomePage';
import { NotFoundPage } from '@/pages/NotFoundPage';

/**
 * `React.lazy` expects a module whose *default* export is the component, but
 * every page in this codebase uses named exports. This adapts a named export
 * into the shape `lazy()` wants, so we don't have to add `export default` to
 * 40+ page modules just to code-split them.
 *
 * Repeated calls against the same module specifier share one chunk and one
 * network fetch — `import()` memoizes per specifier — which is why the five
 * `pages/footer/*` modules stay one chunk each despite exporting 5-9 pages
 * apiece, rather than fragmenting into 30 tiny requests.
 */
function lazyPage<K extends string>(loader: () => Promise<Record<K, ComponentType>>, name: K) {
  return lazy(async () => ({ default: (await loader())[name] }));
}

/**
 * Per-route Suspense boundary. Scoped to the individual route rather than
 * hoisted to the layout so a slow chunk only blanks the page area — the
 * Navbar, Footer and CartDrawer in MainLayout stay mounted and interactive.
 */
function suspend(element: ReactElement): ReactElement {
  return <Suspense fallback={<LoadingState />}>{element}</Suspense>;
}

// ---- Core shopping funnel ----
const ProductListPage = lazyPage(() => import('@/pages/ProductListPage'), 'ProductListPage');
const ProductDetailPage = lazyPage(() => import('@/pages/ProductDetailPage'), 'ProductDetailPage');
const CartPage = lazyPage(() => import('@/pages/CartPage'), 'CartPage');
const CheckoutPage = lazyPage(() => import('@/pages/CheckoutPage'), 'CheckoutPage');
const OrderConfirmationPage = lazyPage(() => import('@/pages/OrderConfirmationPage'), 'OrderConfirmationPage');
const WishlistPage = lazyPage(() => import('@/pages/WishlistPage'), 'WishlistPage');
const BuyerProtectionPage = lazyPage(() => import('@/pages/BuyerProtectionPage'), 'BuyerProtectionPage');
const ReturnsDisputesPage = lazyPage(() => import('@/pages/ReturnsDisputesPage'), 'ReturnsDisputesPage');
const CustomerChatPage = lazyPage(() => import('@/pages/CustomerChatPage'), 'CustomerChatPage');
const SellerStorefrontPage = lazyPage(() => import('@/pages/SellerStorefrontPage'), 'SellerStorefrontPage');
const SystemStatusPage = lazyPage(() => import('@/pages/SystemStatusPage'), 'SystemStatusPage');

// ---- Customer dashboard ----
const DashboardPage = lazyPage(() => import('@/pages/DashboardPage'), 'DashboardPage');
const OrdersPage = lazyPage(() => import('@/pages/OrdersPage'), 'OrdersPage');
const OrderDetailPage = lazyPage(() => import('@/pages/OrderDetailPage'), 'OrderDetailPage');
const ProfilePage = lazyPage(() => import('@/pages/ProfilePage'), 'ProfilePage');

// ---- Auth ----
const LoginForm = lazyPage(() => import('@/components/auth/LoginForm'), 'LoginForm');
const RegisterForm = lazyPage(() => import('@/components/auth/RegisterForm'), 'RegisterForm');
const ForgotPassword = lazyPage(() => import('@/components/auth/ForgotPassword'), 'ForgotPassword');
const ResetPassword = lazyPage(() => import('@/components/auth/ResetPassword'), 'ResetPassword');
const OAuthCallback = lazyPage(() => import('@/components/auth/OAuthCallback'), 'OAuthCallback');
const TwoFactorChallenge = lazyPage(
  () => import('@/components/auth/TwoFactorChallenge'),
  'TwoFactorChallenge',
);

// ---- Admin (never loaded for a shopper) ----
const AdminOverviewPage = lazyPage(() => import('@/pages/admin/AdminOverviewPage'), 'AdminOverviewPage');
const AdminOrdersPage = lazyPage(() => import('@/pages/admin/AdminOrdersPage'), 'AdminOrdersPage');
const AdminProductsPage = lazyPage(() => import('@/pages/admin/AdminProductsPage'), 'AdminProductsPage');
const AdminUsersPage = lazyPage(() => import('@/pages/admin/AdminUsersPage'), 'AdminUsersPage');
const AdminCouponsPage = lazyPage(() => import('@/pages/admin/AdminCouponsPage'), 'AdminCouponsPage');
const AdminNotificationsPage = lazyPage(() => import('@/pages/admin/AdminNotificationsPage'), 'AdminNotificationsPage');

// ---- Footer: About ----
const AboutPage = lazyPage(() => import('@/pages/footer/AboutPages'), 'AboutPage');
const CareersPage = lazyPage(() => import('@/pages/footer/AboutPages'), 'CareersPage');
const PressPage = lazyPage(() => import('@/pages/footer/AboutPages'), 'PressPage');
const MuniCaresPage = lazyPage(() => import('@/pages/footer/AboutPages'), 'MuniCaresPage');
const GiftRegistryPage = lazyPage(() => import('@/pages/footer/AboutPages'), 'GiftRegistryPage');
const InvestorsPage = lazyPage(() => import('@/pages/footer/AboutPages'), 'InvestorsPage');
const SustainabilityPage = lazyPage(() => import('@/pages/footer/AboutPages'), 'SustainabilityPage');

// ---- Footer: Make money with us ----
const SellOnMuniPage = lazyPage(() => import('@/pages/footer/MakeMoneyPages'), 'SellOnMuniPage');
const AffiliateProgramPage = lazyPage(() => import('@/pages/footer/MakeMoneyPages'), 'AffiliateProgramPage');
const AdvertiseOnMuniPage = lazyPage(() => import('@/pages/footer/MakeMoneyPages'), 'AdvertiseOnMuniPage');
const ShipWithMuniPage = lazyPage(() => import('@/pages/footer/MakeMoneyPages'), 'ShipWithMuniPage');

// ---- Footer: Payment ----
const MtnMomoPage = lazyPage(() => import('@/pages/footer/PaymentPages'), 'MtnMomoPage');
const AirtelMoneyPage = lazyPage(() => import('@/pages/footer/PaymentPages'), 'AirtelMoneyPage');
const CashOnDeliveryPage = lazyPage(() => import('@/pages/footer/PaymentPages'), 'CashOnDeliveryPage');
const MuniBusinessPage = lazyPage(() => import('@/pages/footer/PaymentPages'), 'MuniBusinessPage');
const MuniBnplPage = lazyPage(() => import('@/pages/footer/PaymentPages'), 'MuniBnplPage');

// ---- Footer: Policy & help ----
const ShippingPolicyPage = lazyPage(() => import('@/pages/footer/PolicyHelpPages'), 'ShippingPolicyPage');
const RefundReturnsPolicyPage = lazyPage(() => import('@/pages/footer/PolicyHelpPages'), 'RefundReturnsPolicyPage');
const HelpCenterPage = lazyPage(() => import('@/pages/footer/PolicyHelpPages'), 'HelpCenterPage');
const ConditionsPage = lazyPage(() => import('@/pages/footer/PolicyHelpPages'), 'ConditionsPage');
const PrivacyPage = lazyPage(() => import('@/pages/footer/PolicyHelpPages'), 'PrivacyPage');
const InterestAdsPage = lazyPage(() => import('@/pages/footer/PolicyHelpPages'), 'InterestAdsPage');
const CookieNoticePage = lazyPage(() => import('@/pages/footer/PolicyHelpPages'), 'CookieNoticePage');
const ConsumerRightsPage = lazyPage(() => import('@/pages/footer/PolicyHelpPages'), 'ConsumerRightsPage');
const SitemapPage = lazyPage(() => import('@/pages/footer/PolicyHelpPages'), 'SitemapPage');

// ---- Footer: Muni ecosystem ----
const MuniExpressPage = lazyPage(() => import('@/pages/footer/EcosystemPages'), 'MuniExpressPage');
const MuniFreshPage = lazyPage(() => import('@/pages/footer/EcosystemPages'), 'MuniFreshPage');
const MuniGlobalPage = lazyPage(() => import('@/pages/footer/EcosystemPages'), 'MuniGlobalPage');
const MuniB2bPage = lazyPage(() => import('@/pages/footer/EcosystemPages'), 'MuniB2bPage');
const MuniAcademyPage = lazyPage(() => import('@/pages/footer/EcosystemPages'), 'MuniAcademyPage');
const MuniPayPage = lazyPage(() => import('@/pages/footer/EcosystemPages'), 'MuniPayPage');
const MuniContainersPage = lazyPage(() => import('@/pages/footer/EcosystemPages'), 'MuniContainersPage');

export const router = createBrowserRouter(
  [
    // ---- Public + customer routes ----
    {
      element: <MainLayout />,
      children: [
        { path: '/', element: <HomePage /> },
        { path: '/products', element: suspend(<ProductListPage />) },
        { path: '/products/:slug', element: suspend(<ProductDetailPage />) },
        { path: '/wishlist', element: suspend(<WishlistPage />) },
        { path: '/buyer-protection', element: suspend(<BuyerProtectionPage />) },
        { path: '/returns-disputes', element: suspend(<ReturnsDisputesPage />) },
        { path: '/chat', element: suspend(<CustomerChatPage />) },
        { path: '/store/:sellerId', element: suspend(<SellerStorefrontPage />) },
        { path: '/cart', element: suspend(<CartPage />) },

        // 20 Footer Links Routes
        { path: '/about', element: suspend(<AboutPage />) },
        { path: '/careers', element: suspend(<CareersPage />) },
        { path: '/press', element: suspend(<PressPage />) },
        { path: '/cares', element: suspend(<MuniCaresPage />) },
        { path: '/gift', element: suspend(<GiftRegistryPage />) },
        { path: '/sell', element: suspend(<SellOnMuniPage />) },
        { path: '/affiliate', element: suspend(<AffiliateProgramPage />) },
        { path: '/advertise', element: suspend(<AdvertiseOnMuniPage />) },
        { path: '/shipping', element: suspend(<ShipWithMuniPage />) },
        { path: '/mtn-momo', element: suspend(<MtnMomoPage />) },
        { path: '/airtel-money', element: suspend(<AirtelMoneyPage />) },
        { path: '/cod', element: suspend(<CashOnDeliveryPage />) },
        { path: '/business', element: suspend(<MuniBusinessPage />) },
        { path: '/shipping-policy', element: suspend(<ShippingPolicyPage />) },
        { path: '/returns', element: suspend(<RefundReturnsPolicyPage />) },
        { path: '/help', element: suspend(<HelpCenterPage />) },
        { path: '/conditions', element: suspend(<ConditionsPage />) },
        { path: '/privacy', element: suspend(<PrivacyPage />) },
        { path: '/ads', element: suspend(<InterestAdsPage />) },
        { path: '/cookies', element: suspend(<CookieNoticePage />) },
        { path: '/investors', element: suspend(<InvestorsPage />) },
        { path: '/sustainability', element: suspend(<SustainabilityPage />) },
        { path: '/bnpl', element: suspend(<MuniBnplPage />) },
        { path: '/consumer-rights', element: suspend(<ConsumerRightsPage />) },
        { path: '/sitemap', element: suspend(<SitemapPage />) },

        // Muni Ecosystem pages
        { path: '/express', element: suspend(<MuniExpressPage />) },
        { path: '/fresh', element: suspend(<MuniFreshPage />) },
        { path: '/global', element: suspend(<MuniGlobalPage />) },
        { path: '/b2b', element: suspend(<MuniB2bPage />) },
        { path: '/academy', element: suspend(<MuniAcademyPage />) },
        { path: '/pay', element: suspend(<MuniPayPage />) },
        { path: '/containers', element: suspend(<MuniContainersPage />) },

        // Footer href aliases (kept in sync with Footer.tsx link labels)
        { path: '/payment-momo', element: suspend(<MtnMomoPage />) },
        { path: '/payment-airtel', element: suspend(<AirtelMoneyPage />) },
        { path: '/business-card', element: suspend(<MuniBusinessPage />) },
        { path: '/disputes', element: suspend(<ReturnsDisputesPage />) },

        {
          path: '/checkout',
          element: suspend(<PrivateRoute><CheckoutPage /></PrivateRoute>),
        },
        {
          path: '/order-confirmation/:id',
          element: suspend(<PrivateRoute><OrderConfirmationPage /></PrivateRoute>),
        },
        { path: '/system-status', element: suspend(<SystemStatusPage />) },
      ],
    },

    // ---- Auth routes ----
    {
      element: <AuthLayout />,
      children: [
        { path: '/login', element: suspend(<LoginForm />) },
        { path: '/register', element: suspend(<RegisterForm />) },
        { path: '/forgot-password', element: suspend(<ForgotPassword />) },
        { path: '/reset-password', element: suspend(<ResetPassword />) },
        // Where auth-service sends the browser back after a social login —
        // FRONTEND_REDIRECT_URL for success, /auth/error when the user denies
        // consent or the exchange fails. One component handles both.
        { path: '/auth/callback', element: suspend(<OAuthCallback />) },
        { path: '/auth/error', element: suspend(<OAuthCallback />) },
        // The second leg of a login. Reached by navigation from the password
        // form, and by redirect from auth-service when a social login lands on
        // an account that owes a second factor.
        { path: '/auth/2fa/challenge', element: suspend(<TwoFactorChallenge />) },
      ],
    },

    // ---- Customer dashboard ----
    {
      element: <PrivateRoute><DashboardLayout /></PrivateRoute>,
      children: [
        { path: '/dashboard', element: suspend(<DashboardPage />) },
        { path: '/orders', element: suspend(<OrdersPage />) },
        { path: '/orders/:id', element: suspend(<OrderDetailPage />) },
        { path: '/profile', element: suspend(<ProfilePage />) },
        { path: '/dashboard/wishlist', element: suspend(<WishlistPage />) },
        { path: '/dashboard/returns', element: suspend(<ReturnsDisputesPage />) },
        { path: '/dashboard/chat', element: suspend(<CustomerChatPage />) },
      ],
    },

    // ---- Built-in admin section (/dashboard/admin) — ROLE_ADMIN or ROLE_SUPER_ADMIN ----
    //
    // Deliberately NOT at /admin/*: nginx routes /admin/ to the standalone
    // admin-panel SPA before the request ever reaches this bundle. See
    // ADMIN_ROUTES in ./routes.ts.
    {
      element: <AdminLayout />,
      children: [
        { path: '/dashboard/admin', element: suspend(<AdminOverviewPage />) },
        { path: '/dashboard/admin/orders', element: suspend(<AdminOrdersPage />) },
        { path: '/dashboard/admin/products', element: suspend(<AdminProductsPage />) },
        { path: '/dashboard/admin/users', element: suspend(<AdminUsersPage />) },
        { path: '/dashboard/admin/coupons', element: suspend(<AdminCouponsPage />) },
        { path: '/dashboard/admin/notifications', element: suspend(<AdminNotificationsPage />) },
      ],
    },

    { path: '*', element: <NotFoundPage /> },
  ],
  {
    future: {
      v7_relativeSplatPath: true,
    },
  }
);
