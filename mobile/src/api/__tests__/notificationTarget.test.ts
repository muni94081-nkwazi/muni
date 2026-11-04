import { notificationTarget, type AppNotification } from '../notifications.api';

/**
 * notification-service stores the originating event payload in `data` so a
 * client can deep-link. These pin which ids are honoured and, just as
 * importantly, that an unroutable notification returns null rather than
 * navigating somewhere invented.
 */
function notification(data: Record<string, unknown> | null): AppNotification {
  return {
    id: 'n1',
    userId: 'u1',
    type: 'order.shipped',
    category: 'TRANSACTIONAL',
    title: 'Your order shipped',
    body: 'On its way.',
    data,
    read: false,
    createdAt: new Date().toISOString(),
  };
}

describe('notificationTarget', () => {
  it('routes an order notification to that order', () => {
    expect(notificationTarget(notification({ orderId: 'o-9' }))).toBe('/order/o-9');
  });

  it('accepts the snake_case key the producers also emit', () => {
    expect(notificationTarget(notification({ order_id: 'o-9' }))).toBe('/order/o-9');
  });

  it('routes a product notification to that product', () => {
    expect(notificationTarget(notification({ productId: 'p-3' }))).toBe('/product/p-3');
  });

  it('routes a chat notification to that conversation', () => {
    expect(notificationTarget(notification({ conversationId: 'c-7' }))).toBe('/chat/c-7');
  });

  it('prefers the order when a payload carries several ids', () => {
    // Order is the most specific destination for the events that carry both.
    expect(notificationTarget(notification({ productId: 'p-3', orderId: 'o-9' }))).toBe('/order/o-9');
  });

  it('returns null when the payload has no routable id', () => {
    expect(notificationTarget(notification({ campaign: 'summer' }))).toBeNull();
  });

  it('returns null when there is no payload at all', () => {
    expect(notificationTarget(notification(null))).toBeNull();
  });

  it('ignores an id that is present but empty', () => {
    // An empty string would otherwise build "/order/" and land nowhere.
    expect(notificationTarget(notification({ orderId: '' }))).toBeNull();
  });

  it('ignores a non-string id rather than coercing it', () => {
    expect(notificationTarget(notification({ orderId: 12345 }))).toBeNull();
  });
});
