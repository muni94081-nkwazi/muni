export const ROUTES = {
  home: '/',
  products: '/products',
  productDetail: (slug: string) => `/products/${slug}`,
  cart: '/cart',
  checkout: '/checkout',
  orderConfirmation: (id: string) => `/order-confirmation/${id}`,
  login: '/login',
  register: '/register',
  forgotPassword: '/forgot-password',
  resetPassword: '/reset-password',
  profile: '/profile',
  dashboard: '/dashboard',
  orders: '/orders',
  orderDetail: (id: string) => `/orders/${id}`,
  systemStatus: '/system-status',
} as const;

// Customer-web's built-in admin section.
//
// Nested under /dashboard/admin rather than /admin: nginx owns /admin/ at the
// edge and proxies it to the standalone admin-panel app, so anything served
// from this bundle under /admin/* is unreachable in a deployed environment.
// It cannot sit at /dashboard/* directly either — /dashboard is already the
// customer DashboardPage.
export const ADMIN_ROUTES = {
  overview: '/dashboard/admin',
  orders: '/dashboard/admin/orders',
  products: '/dashboard/admin/products',
  users: '/dashboard/admin/users',
  coupons: '/dashboard/admin/coupons',
  notifications: '/dashboard/admin/notifications',
} as const;

// The standalone admin-panel SPA, served by nginx at the domain root.
export const ADMIN_PANEL_URL = '/admin/';
