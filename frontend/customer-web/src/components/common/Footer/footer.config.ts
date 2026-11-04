// ---------------------------------------------------------------------------
// Footer configuration.
//
// The footer's structure lives here rather than in JSX, so adding, reordering
// or gating a link is a data edit. Two hard rules:
//
//   1. Every internal `href` must resolve to a real route in
//      src/router/index.tsx. footer.links.test.ts asserts this against the
//      router, so a dead link fails the suite instead of shipping.
//
//   2. No URL is invented. SOCIAL_LINKS and APP_LINKS start empty and their
//      components render nothing while they are — see the note on each.
// ---------------------------------------------------------------------------

export interface FooterLink {
  label: string;
  href: string;
  badge?: string;
  /**
   * Outside this SPA's router — a sibling app served by nginx, or an off-site
   * URL. Rendered as a plain <a>: a <Link> would try to resolve /seller/
   * inside this bundle and land on NotFoundPage.
   */
  external?: boolean;
  /**
   * The destination sits behind PrivateRoute. The footer does NOT hide these —
   * it intercepts the click for a signed-out visitor and opens the auth prompt
   * instead of letting the router bounce them to /login unexplained.
   */
  requiresAuth?: boolean;
  /** Shown only to an admin. The one role-gated entry. */
  adminOnly?: boolean;
}

export interface FooterColumn {
  id: string;
  title: string;
  links: FooterLink[];
}

export const FOOTER_COLUMNS: FooterColumn[] = [
  {
    id: 'about',
    title: 'Get to Know Us',
    links: [
      { label: 'About Muni Group', href: '/about' },
      { label: 'Careers at Muni', href: '/careers' },
      { label: 'Press & Media Center', href: '/press' },
      { label: 'Muni Cares Foundation', href: '/cares' },
      { label: 'Investor Relations', href: '/investors' },
      { label: 'Sustainability & Impact', href: '/sustainability' },
    ],
  },
  {
    id: 'sell',
    title: 'Make Money with Us',
    links: [
      { label: 'Sell on Muni Market', href: '/sell' },
      { label: 'Seller Center Portal', href: '/seller/', external: true },
      { label: 'Become a Logistics Partner', href: '/shipping' },
      { label: 'Join Affiliate Program', href: '/affiliate' },
      { label: 'Advertise Your Products', href: '/advertise' },
      { label: 'Bulk Container Imports', href: '/containers' },
      { label: 'Admin Panel', href: '/admin/', external: true, adminOnly: true },
    ],
  },
  {
    id: 'finance',
    title: 'Payment & Financing',
    links: [
      { label: 'MTN Mobile Money (MoMo)', href: '/payment-momo' },
      { label: 'Airtel Money Instant Pay', href: '/payment-airtel' },
      { label: 'Cash on Delivery (COD)', href: '/cod' },
      { label: 'Muni Business Card', href: '/business-card' },
      { label: 'Escrow Buyer Protection', href: '/buyer-protection' },
    ],
  },
  {
    id: 'help',
    title: 'Let Us Help You',
    links: [
      { label: 'Your Account & Dashboard', href: '/dashboard', requiresAuth: true },
      { label: 'Track Your Orders', href: '/orders', requiresAuth: true },
      { label: 'Shipping Rates & Policies', href: '/shipping-policy' },
      { label: 'Returns & Refund Center', href: '/returns' },
      { label: 'Dispute Tribunal Desk', href: '/disputes' },
      { label: 'Help & Live Support 24/7', href: '/help' },
    ],
  },
  {
    id: 'ecosystem',
    title: 'Muni Services',
    links: [
      { label: 'Muni Express 24h Delivery', href: '/express', badge: 'Fast' },
      { label: 'Muni Global Shipping', href: '/global' },
      { label: 'Muni Wholesale B2B', href: '/b2b' },
    ],
  },
];

export const LEGAL_LINKS: FooterLink[] = [
  { label: 'Conditions of Use', href: '/conditions' },
  { label: 'Privacy Notice', href: '/privacy' },
  { label: 'Consumer Protection Rights', href: '/consumer-rights' },
  { label: 'Interest-Based Ads', href: '/ads' },
  { label: 'Cookies Settings', href: '/cookies' },
  { label: 'Sitemap', href: '/sitemap' },
];

// ---------------------------------------------------------------------------
// Social channels
//
// EMPTY ON PURPOSE. There are no verified MUNI accounts, and the previous
// footer linked the bare facebook.com / twitter.com / instagram.com /
// linkedin.com homepages plus a wa.me/256700000000 placeholder number — links
// that look official and go nowhere.
//
// Add a real profile URL and SocialLinks renders it immediately. Nothing else
// has to change. The test suite rejects bare-homepage URLs, so a placeholder
// cannot creep back in.
// ---------------------------------------------------------------------------

export interface SocialLink {
  id: string;
  /** Accessible name. Icons never stand in for this. */
  label: string;
  url: string;
}

export const SOCIAL_LINKS: SocialLink[] = [];

// ---------------------------------------------------------------------------
// App store listings
//
// ALSO EMPTY ON PURPOSE. A real Expo app exists at mobile/ (bundle
// ug.muni.app) but is unpublished — eas.json still carries
// "ascAppId": "YOUR_APP_STORE_CONNECT_APP_ID", and no store URL appears
// anywhere in the repository.
//
// `qrTarget` is what the QR code encodes. It is only rendered once at least
// one store URL exists, so the code can never encode a dead link.
// ---------------------------------------------------------------------------

export interface AppLink {
  id: string;
  label: string;
  platform: 'ios' | 'android';
  url: string;
}

export const APP_LINKS: AppLink[] = [];

/**
 * URL the QR code encodes. A landing page that redirects by user-agent is the
 * right target — one code serves both platforms. Left null until a real
 * destination exists.
 */
export const APP_QR_TARGET: string | null = null;

/** Payment methods the checkout genuinely accepts — see utils/constants.ts. */
export { PAYMENT_METHOD_LABELS as PAYMENT_METHODS } from '@/utils/constants';
