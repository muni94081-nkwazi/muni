import { apiClient } from './client';

/**
 * notification-service's own inbox, behind the gateway's `auth('/notifications')`.
 *
 * The app already had push registration (src/notifications/push.ts) but never
 * read the stored history, so delivered notifications were unreachable once the
 * system tray was cleared. These are that service's real endpoints.
 *
 * The list is enveloped as `{ success, data, meta }` — note `meta`, not the
 * `{ success, data }` shape most other services return.
 */

export type NotificationCategory = 'TRANSACTIONAL' | 'MARKETING' | 'SYSTEM' | string;

export interface AppNotification {
  id: string;
  userId: string;
  /** The domain event that produced it, e.g. "order.shipped". */
  type: string;
  category: NotificationCategory;
  title: string;
  body: string;
  /** Event payload kept for deep-linking — orderId, productId and so on. */
  data?: Record<string, unknown> | null;
  read: boolean;
  readAt?: string | null;
  createdAt: string;
}

export interface NotificationPage {
  items: AppNotification[];
  total: number;
  page: number;
  lastPage: number;
}

interface ListEnvelope {
  success: boolean;
  data: AppNotification[];
  meta?: { current_page: number; per_page: number; total: number; last_page: number };
}

export const notificationsApi = {
  list: async (page = 1, perPage = 20, unreadOnly = false): Promise<NotificationPage> => {
    const { data } = await apiClient.get<ListEnvelope>('/api/v1/notifications', {
      params: { page, per_page: perPage, ...(unreadOnly ? { unread: 'true' } : {}) },
    });
    return {
      items: data.data ?? [],
      total: data.meta?.total ?? 0,
      page: data.meta?.current_page ?? page,
      lastPage: data.meta?.last_page ?? 1,
    };
  },

  counts: async (): Promise<{ total: number; unread: number }> => {
    const { data } = await apiClient.get<{ success: boolean; data: { total: number; unread: number } }>(
      '/api/v1/notifications/count',
    );
    return data.data ?? { total: 0, unread: 0 };
  },

  markRead: async (id: string): Promise<void> => {
    await apiClient.patch(`/api/v1/notifications/${id}/read`);
  },

  markAllRead: async (): Promise<void> => {
    await apiClient.patch('/api/v1/notifications/read-all');
  },
};

/**
 * Where a notification should take the shopper, derived from the event payload
 * the service stores. Returns null when the payload carries nothing routable —
 * the row then simply marks itself read rather than navigating nowhere.
 */
export function notificationTarget(n: AppNotification): string | null {
  const data = n.data ?? {};
  const orderId = data.orderId ?? data.order_id;
  if (typeof orderId === 'string' && orderId) return `/order/${orderId}`;

  const productId = data.productId ?? data.product_id;
  if (typeof productId === 'string' && productId) return `/product/${productId}`;

  const conversationId = data.conversationId ?? data.conversation_id;
  if (typeof conversationId === 'string' && conversationId) return `/chat/${conversationId}`;

  return null;
}
