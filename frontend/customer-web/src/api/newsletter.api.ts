import { apiClient } from './axios.config';

export interface SubscribeResult {
  /** True when the deployment uses double opt-in and a confirmation email is required. */
  pending: boolean;
  message: string;
}

export interface SubscribePayload {
  email: string;
  /** Storefront market the address was captured in, e.g. 'UG'. */
  market?: string;
  source?: 'FOOTER' | 'CHECKOUT' | 'ACCOUNT';
}

/**
 * newsletter-service, mounted public at the gateway (`pub('/newsletter')`).
 *
 * The service answers identically whether the address was new, already
 * subscribed, or suppressed — deliberately, so this endpoint cannot be used to
 * probe who is on the list. There is therefore no "already subscribed" branch
 * for the UI to render: one success message covers every accepted outcome.
 *
 * Errors propagate as ApiError from the axios interceptor, which has already
 * replaced any 5xx body with a generic message — so nothing internal reaches
 * the page.
 */
export const newsletterApi = {
  async subscribe(payload: SubscribePayload): Promise<SubscribeResult> {
    const { data } = await apiClient.post<{
      success: boolean;
      data?: { pending?: boolean };
      message?: string;
    }>('/newsletter/subscribe', {
      email: payload.email,
      market: payload.market ?? 'UG',
      source: payload.source ?? 'FOOTER',
    });

    return {
      pending: Boolean(data?.data?.pending),
      message: data?.message ?? 'Thanks for subscribing.',
    };
  },
};
