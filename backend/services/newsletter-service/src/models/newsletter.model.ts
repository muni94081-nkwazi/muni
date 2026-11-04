import { z } from 'zod';

/**
 * Server-side email validation.
 *
 * Deliberately not a maximal RFC 5322 regex. Zod's `.email()` rejects the
 * malformed input that actually shows up (missing @, missing TLD, spaces),
 * and the length bounds below stop the two abuse shapes that matter: an empty
 * string, and a multi-kilobyte string used to bloat the row. Anything that
 * survives this is a *syntactically* plausible address — whether it receives
 * mail is settled by the confirmation step, not by a cleverer regex.
 */
export const EmailSchema = z
  .string()
  .trim()
  .min(3, 'Enter a valid email address')
  // 254 is the practical maximum length of an email address (RFC 5321 path limit).
  .max(254, 'Enter a valid email address')
  .email('Enter a valid email address')
  .transform((value) => value.toLowerCase());

export const SubscribeSchema = z.object({
  email: EmailSchema,
  source: z.enum(['FOOTER', 'CHECKOUT', 'ACCOUNT', 'IMPORT']).default('FOOTER'),
  /** Storefront market code, e.g. "UG". Bounded so it cannot be used as free storage. */
  market: z.string().trim().min(2).max(8).default('UG'),
  locale: z.string().trim().min(2).max(10).default('en'),
  /** Identifies the consent copy shown beside the input. */
  consentVersion: z.string().trim().min(1).max(64).default('footer-v1'),
});

export type SubscribeInput = z.infer<typeof SubscribeSchema>;

export const UnsubscribeSchema = z.object({
  token: z.string().trim().min(8).max(128),
});

/** What the API returns. Never includes the unsubscribe token or the consent IP. */
export interface SubscriptionView {
  status: 'PENDING' | 'CONFIRMED' | 'UNSUBSCRIBED' | 'SUPPRESSED';
  /** True when this request created a new subscription rather than updating one. */
  created: boolean;
  /** True when the address was already actively subscribed before this request. */
  alreadySubscribed: boolean;
}

// ─── Admin subscriber listing ───────────────────────────────────────────────

export const SUBSCRIPTION_STATUSES = ['PENDING', 'CONFIRMED', 'UNSUBSCRIBED'] as const;
export type SubscriptionStatusName = (typeof SUBSCRIPTION_STATUSES)[number];

/**
 * Query for GET /api/v1/admin/newsletter/subscribers.
 *
 * `coerce` on the numbers because these arrive as strings from the query
 * string. The limit is capped at 200: this endpoint feeds a paginated table,
 * and an uncapped limit turns one request into a full list dump.
 */
export const ListSubscribersSchema = z.object({
  status: z.enum(SUBSCRIPTION_STATUSES).optional(),
  market: z.string().trim().min(2).max(8).optional(),
  /** Case-insensitive substring match on the email address. */
  q: z.string().trim().min(1).max(120).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

export type ListSubscribersQuery = z.infer<typeof ListSubscribersSchema>;

/**
 * One row as the admin table sees it.
 *
 * Deliberately omits `unsubscribeToken`. That token is the credential behind
 * one-click unsubscribe — anyone holding it can unsubscribe that address
 * without authenticating, so it must never travel to a browser, not even an
 * admin's.
 */
export interface AdminSubscriberView {
  id: string;
  email: string;
  status: SubscriptionStatusName;
  source: string;
  market: string;
  locale: string;
  userId: string | null;
  consentAt: string | null;
  confirmedAt: string | null;
  unsubscribedAt: string | null;
  createdAt: string;
}

export interface AdminSubscriberPage {
  subscribers: AdminSubscriberView[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  /** Totals for every status, unaffected by the status filter, for the tabs. */
  countsByStatus: Record<SubscriptionStatusName, number>;
}
