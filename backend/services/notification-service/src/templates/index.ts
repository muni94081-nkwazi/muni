import type { Category, Channel } from '../generated/prisma/index.js';

// ─── Template registry ──────────────────────────────────────────────────────
//
// Maps a domain event to what the recipient actually reads, per channel, plus
// the routing decisions that follow from it: which channels to try, and
// whether the message is transactional (always sent) or marketing (opt-in).
//
// SMS bodies are deliberately terse. Every segment past 160 GSM-7 characters
// is billed again, and in these markets the recipient often pays to receive
// nothing but is reached on a feature phone where nothing else lands.
//
// Templates live in code, not the database: they ship with the events that
// produce them, so adding an event and forgetting its copy is a compile
// error rather than a silently unsent notification.

export interface TemplateContext {
  firstName?: string;
  [key: string]: unknown;
}

export interface RenderedMessage {
  title: string;
  /** In-app / push body. */
  body: string;
  /** Short form for SMS and WhatsApp; falls back to `body`. */
  smsBody?: string;
}

export interface NotificationTemplate {
  category: Category;
  /** Channels to attempt, in order of importance. Preferences filter further. */
  channels: Channel[];
  render: (data: Record<string, unknown>, ctx: TemplateContext) => RenderedMessage;
}

/** Order/sub-order id, whichever the producing event carried. */
function orderRef(data: Record<string, unknown>): string {
  return String(data.orderNumber ?? data.orderId ?? data.subOrderId ?? data.id ?? '');
}

function money(data: Record<string, unknown>): string {
  const amount = data.total ?? data.amount ?? data.totalAmount;
  if (amount === undefined || amount === null) return '';
  const currency = String(data.currency ?? 'UGX');
  return `${currency} ${Number(amount).toLocaleString('en-US')}`;
}

const TRANSACTIONAL_FULL: Channel[] = ['IN_APP', 'PUSH', 'SMS'];
const TRANSACTIONAL_QUIET: Channel[] = ['IN_APP', 'PUSH'];

export const TEMPLATES: Record<string, NotificationTemplate> = {
  // ── Orders ────────────────────────────────────────────────────────────────
  'order.created': {
    category: 'TRANSACTIONAL',
    channels: TRANSACTIONAL_FULL,
    render: (data) => ({
      title: 'Order confirmed',
      body: `Your order ${orderRef(data)} has been confirmed${money(data) ? ` — ${money(data)}` : ''}. We'll let you know when it ships.`,
      smsBody: `MUNI: Order ${orderRef(data)} confirmed${money(data) ? `, ${money(data)}` : ''}. Track it in the app.`,
    }),
  },

  'order.payment_confirmed': {
    category: 'TRANSACTIONAL',
    channels: TRANSACTIONAL_FULL,
    render: (data) => ({
      title: 'Payment received',
      body: `We've received your payment for order ${orderRef(data)}.`,
      smsBody: `MUNI: Payment received for order ${orderRef(data)}. Thank you.`,
    }),
  },

  'order.shipped': {
    category: 'TRANSACTIONAL',
    channels: TRANSACTIONAL_FULL,
    render: (data) => {
      const tracking = data.trackingNumber ? ` Tracking: ${data.trackingNumber}.` : '';
      return {
        title: 'Order shipped',
        body: `Your order ${orderRef(data)} is on its way.${tracking}`,
        smsBody: `MUNI: Order ${orderRef(data)} shipped.${tracking}`,
      };
    },
  },

  'order.out_for_delivery': {
    category: 'TRANSACTIONAL',
    channels: TRANSACTIONAL_FULL,
    render: (data) => ({
      title: 'Out for delivery',
      body: `Your order ${orderRef(data)} is out for delivery today. Please keep your phone reachable.`,
      smsBody: `MUNI: Order ${orderRef(data)} arrives today. Keep your phone on.`,
    }),
  },

  'order.delivered': {
    category: 'TRANSACTIONAL',
    channels: TRANSACTIONAL_FULL,
    render: (data) => ({
      title: 'Order delivered',
      body: `Your order ${orderRef(data)} has been delivered. Tell other buyers how it went — you can review it now.`,
      smsBody: `MUNI: Order ${orderRef(data)} delivered. Rate it in the app.`,
    }),
  },

  'order.cancelled': {
    category: 'TRANSACTIONAL',
    channels: TRANSACTIONAL_FULL,
    render: (data) => ({
      title: 'Order cancelled',
      body: `Your order ${orderRef(data)} has been cancelled${data.reason ? `: ${data.reason}` : ''}. Any payment will be refunded.`,
      smsBody: `MUNI: Order ${orderRef(data)} cancelled. Refund on its way if you paid.`,
    }),
  },

  // ── Payments ──────────────────────────────────────────────────────────────
  'payment.failed': {
    category: 'TRANSACTIONAL',
    channels: TRANSACTIONAL_FULL,
    render: (data) => ({
      title: 'Payment failed',
      body: `We couldn't complete your payment for order ${orderRef(data)}. Please try again.`,
      smsBody: `MUNI: Payment failed for order ${orderRef(data)}. Please try again.`,
    }),
  },

  'payment.refunded': {
    category: 'TRANSACTIONAL',
    channels: TRANSACTIONAL_FULL,
    render: (data) => ({
      title: 'Refund issued',
      body: `A refund${money(data) ? ` of ${money(data)}` : ''} for order ${orderRef(data)} is on its way to you.`,
      smsBody: `MUNI: Refund${money(data) ? ` ${money(data)}` : ''} issued for order ${orderRef(data)}.`,
    }),
  },

  // ── Account & security ────────────────────────────────────────────────────
  // Security messages go to SMS and email regardless of push: the whole point
  // is reaching someone who may have lost access to the app.
  'user.registered': {
    category: 'TRANSACTIONAL',
    channels: ['IN_APP', 'EMAIL'],
    render: (_data, ctx) => ({
      title: 'Welcome to MUNI',
      body: `${ctx.firstName ? `${ctx.firstName}, w` : 'W'}elcome to MUNI. Your account is ready — start browsing thousands of products from local sellers.`,
    }),
  },

  'user.password_reset_requested': {
    category: 'TRANSACTIONAL',
    channels: ['SMS', 'EMAIL'],
    render: (data) => ({
      title: 'Reset your password',
      // The raw token arrives on the event and is never logged or persisted in
      // the notification body beyond what the recipient needs to act on it.
      body: `Use this code to reset your MUNI password: ${String(data.resetToken ?? '').slice(0, 8).toUpperCase()}. It expires shortly. If you didn't request this, ignore this message.`,
      smsBody: `MUNI reset code: ${String(data.resetToken ?? '').slice(0, 8).toUpperCase()}. Ignore if you didn't request it.`,
    }),
  },

  'user.password_reset': {
    category: 'TRANSACTIONAL',
    channels: ['SMS', 'EMAIL', 'IN_APP'],
    render: () => ({
      title: 'Your password was changed',
      body: "Your MUNI password was just changed. If this wasn't you, contact support immediately.",
      smsBody: "MUNI: your password was changed. Not you? Contact support now.",
    }),
  },

  // ── Seller lifecycle ──────────────────────────────────────────────────────
  'seller.registered': {
    category: 'TRANSACTIONAL',
    channels: ['IN_APP'],
    render: () => ({
      title: 'New seller awaiting verification',
      body: 'A new seller has registered and is pending verification.',
    }),
  },

  'seller.approved': {
    category: 'TRANSACTIONAL',
    channels: TRANSACTIONAL_FULL,
    render: () => ({
      title: 'Your seller account is approved',
      body: 'Congratulations — your MUNI seller account has been approved. You can start listing products now.',
      smsBody: 'MUNI: your seller account is approved. Start listing today.',
    }),
  },

  'seller.rejected': {
    category: 'TRANSACTIONAL',
    channels: ['IN_APP', 'EMAIL'],
    render: (data) => ({
      title: 'Seller application not approved',
      body: `Your seller application was not approved${data.reason ? `: ${data.reason}` : ''}. You can correct the issue and apply again.`,
    }),
  },

  'seller.suspended': {
    category: 'TRANSACTIONAL',
    channels: TRANSACTIONAL_FULL,
    render: (data) => ({
      title: 'Seller account suspended',
      body: `Your seller account has been suspended${data.reason ? `: ${data.reason}` : ''}. Existing orders must still be fulfilled.`,
      smsBody: 'MUNI: your seller account is suspended. Check the app for details.',
    }),
  },

  'seller.standing_changed': {
    category: 'TRANSACTIONAL',
    channels: TRANSACTIONAL_QUIET,
    render: (data) => ({
      title:
        data.standing === 'SUSPENDED'
          ? 'Your account has been suspended'
          : data.standing === 'AT_RISK'
            ? 'Your account performance needs attention'
            : 'Your account is back in good standing',
      body:
        data.standing === 'GOOD'
          ? 'Your seller metrics are back within target. Thank you for putting it right.'
          : `${data.reason ?? 'Your seller metrics are outside target.'} Review your scorecard in Seller Center.`,
    }),
  },

  // ── Reviews ───────────────────────────────────────────────────────────────
  'review.created': {
    category: 'TRANSACTIONAL',
    channels: TRANSACTIONAL_QUIET,
    render: (data) => ({
      title: 'New review on your product',
      body: `A buyer left a ${data.rating}★ review on one of your products.`,
    }),
  },
};

export function getTemplate(eventType: string): NotificationTemplate | undefined {
  return TEMPLATES[eventType];
}
