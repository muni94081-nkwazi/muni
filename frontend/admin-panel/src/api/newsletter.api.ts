import { apiClient } from './axios.config';

export const SUBSCRIPTION_STATUSES = ['PENDING', 'CONFIRMED', 'UNSUBSCRIBED'] as const;
export type SubscriptionStatus = (typeof SUBSCRIPTION_STATUSES)[number];

export interface Subscriber {
  id: string;
  email: string;
  status: SubscriptionStatus;
  source: string;
  market: string;
  locale: string;
  userId: string | null;
  consentAt: string | null;
  confirmedAt: string | null;
  unsubscribedAt: string | null;
  createdAt: string;
}

export interface SubscriberPage {
  subscribers: Subscriber[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  countsByStatus: Record<SubscriptionStatus, number>;
}

export interface ListSubscribersParams {
  status?: SubscriptionStatus;
  market?: string;
  q?: string;
  page?: number;
  limit?: number;
}

export const newsletterApi = {
  /**
   * GET /admin/newsletter/subscribers
   *
   * Deliberately not wrapped in a try/catch that returns fixtures. The sibling
   * analytics client does that, and the result was a dashboard that rendered
   * invented numbers when the endpoint was missing — the failure looked like
   * data. Here a failure propagates and the page shows an error.
   */
  async list(params: ListSubscribersParams = {}): Promise<SubscriberPage> {
    const { data } = await apiClient.get<{ data: SubscriberPage }>(
      '/admin/newsletter/subscribers',
      { params },
    );
    return data.data;
  },
};
