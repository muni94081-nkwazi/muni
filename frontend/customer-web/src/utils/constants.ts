export const APP_NAME = import.meta.env.VITE_APP_NAME || 'MUNI';
export const DEFAULT_CURRENCY = import.meta.env.VITE_DEFAULT_CURRENCY || 'UGX';
// Relative by default so requests go through the Vite dev proxy (see
// vite.config.ts `server.proxy`) instead of straight to :8080 cross-origin.
export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api/v1';
// ─── Chat (Socket.io) ─────────────────────────────────────────────────────────
//
// The gateway's HTTP proxy cannot carry a websocket upgrade, so chat does not
// go through /api/. nginx proxies it directly instead — `location /chat/` in
// nginx/includes/server-common.conf, with a trailing-slash proxy_pass that
// strips the prefix, so /chat/ws/chat arrives at chat-service as its own
// /ws/chat mount.
//
// The default used to be `http://localhost:4025`, and nothing set
// VITE_CHAT_SERVICE_URL — not the compose build, not the Dockerfile. So every
// built image told the BROWSER to open a socket to port 4025 on whatever
// machine the shopper happened to be using. It only ever worked for a developer
// running the stack locally.
//
// Empty string means "the origin this page came from", which is what socket.io
// does with no URL and what the single-origin topology actually wants. Setting
// VITE_CHAT_SERVICE_URL still overrides it for a direct connection, and the
// path follows: through the edge it is prefixed, straight at the service it is
// not.
export const CHAT_SERVICE_URL = import.meta.env.VITE_CHAT_SERVICE_URL || '';
export const CHAT_SOCKET_PATH = import.meta.env.VITE_CHAT_SERVICE_URL
  ? '/ws/chat'
  : '/chat/ws/chat';

export const ACCESS_TOKEN_KEY = 'muni_access_token';
export const REFRESH_TOKEN_KEY = 'muni_refresh_token';
export const CART_SESSION_KEY = 'muni_cart_session';
export const LOW_DATA_MODE_KEY = 'muni_low_data_mode';
// Chosen market/display-currency. Validated against src/config/markets.ts on
// read — localStorage is user-writable and must not be trusted verbatim.
export const MARKET_KEY = 'muni_market';

export const UGANDAN_PHONE_REGEX = /^(\+256|0)(7|3)[0-9]{8}$/;

export const PAYMENT_METHOD_LABELS: Record<string, string> = {
  mtn_momo: 'MTN Mobile Money',
  airtel_money: 'Airtel Money',
  card: 'Card',
  cod: 'Cash on Delivery',
};

export const ORDER_STATUS_LABELS: Record<string, string> = {
  pending: 'Pending',
  payment_processing: 'Processing payment',
  paid: 'Paid',
  confirmed: 'Confirmed',
  processing: 'Processing',
  shipped: 'Shipped',
  out_for_delivery: 'Out for delivery',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
  payment_failed: 'Payment failed',
  refunded: 'Refunded',
  return_requested: 'Return requested',
  returned: 'Returned',
};

export const UGANDAN_DISTRICTS = [
  'Kampala',
  'Wakiso',
  'Mukono',
  'Jinja',
  'Mbarara',
  'Gulu',
  'Entebbe',
  'Masaka',
  'Lira',
  'Mbale',
] as const;
