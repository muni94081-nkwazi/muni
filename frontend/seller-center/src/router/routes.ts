export const ROUTES = {
  LOGIN: '/login',
  REGISTER: '/register',
  UNAUTHORIZED: '/unauthorized',
  // Signed in but not yet a seller — the application lives outside PrivateRoute,
  // whose ROLE_SELLER check a new applicant cannot pass by definition.
  APPLY: '/apply',
  // Two-factor steps. Both take their short-lived credential from router
  // state, so neither is useful when opened directly.
  MFA_SETUP: '/mfa/setup',
  MFA_VERIFY: '/mfa/verify',
  DASHBOARD: '/',
  PRODUCTS: '/products',
  // '/products/new' — must match the path registered in router/index.tsx. This
  // read '/products/create', which no route has ever served, so anything
  // navigating by this constant landed on the 404 screen. Today's callers all
  // hardcode '/products/new', which is why nobody hit it.
  PRODUCT_CREATE: '/products/new',
  PRODUCT_EDIT: '/products/:id/edit',
  INVENTORY: '/inventory',
  ORDERS: '/orders',
  ORDER_FULFILLMENT: '/orders/:id',
  PAYOUTS: '/payouts',
  ANALYTICS: '/analytics',
  SETTINGS: '/settings'
};
