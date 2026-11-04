/**
 * Notification tap → navigation.
 *
 * Two bugs these lock down:
 *   1. `setupNotificationListeners()` was exported but never called anywhere,
 *      so tapping a push notification did nothing at all.
 *   2. order_status routed to `/orders/${id}` (plural) — the tab list — while
 *      the detail screen is app/order/[id].tsx. The tap navigated nowhere.
 */
jest.mock('expo-router', () => ({ router: { push: jest.fn(), replace: jest.fn() } }));

// Each mock declares the argument it actually receives rather than taking a
// spread. `(...args: unknown[]) => fn(...args)` does not typecheck against a
// zero-parameter jest.fn (TS2556: a spread argument needs a tuple type), and
// jest runs through Babel — which strips types without checking them — so the
// suite passed while `tsc --noEmit` failed.
const mockGetLastResponse = jest.fn();
const mockAddResponseListener = jest.fn((_listener: unknown) => ({ remove: jest.fn() }));
const mockAddReceivedListener = jest.fn((_listener: unknown) => ({ remove: jest.fn() }));

jest.mock('expo-notifications', () => ({
  getLastNotificationResponseAsync: () => mockGetLastResponse(),
  addNotificationResponseReceivedListener: (listener: unknown) => mockAddResponseListener(listener),
  addNotificationReceivedListener: (listener: unknown) => mockAddReceivedListener(listener),
}));

import { router } from 'expo-router';
import {
  handleNotificationResponse,
  setupNotificationListeners,
  handleInitialNotificationResponse,
  type NotificationData,
} from '../handlers';

/** Minimal NotificationResponse — only the fields the handler reads. */
function response(data: NotificationData, identifier = `n-${Math.random()}`) {
  return {
    notification: { request: { identifier, content: { data } } },
  } as never;
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('notification routing', () => {
  it('opens the order detail screen, not the orders tab', () => {
    handleNotificationResponse(response({ type: 'order_status', orderId: 'ord-1' }));

    // Singular `/order/` — `/orders/ord-1` is not a route that exists.
    expect(router.push).toHaveBeenCalledWith('/order/ord-1');
  });

  it('falls back to the orders tab when the payload carries no orderId', () => {
    handleNotificationResponse(response({ type: 'order_status' }));
    expect(router.push).toHaveBeenCalledWith('/(tabs)/orders');
  });

  it('opens the product screen for price alerts and flash sales', () => {
    handleNotificationResponse(response({ type: 'price_alert', productId: 'p-1' }));
    expect(router.push).toHaveBeenCalledWith('/product/p-1');

    handleNotificationResponse(response({ type: 'flash_sale', productId: 'p-2' }));
    expect(router.push).toHaveBeenCalledWith('/product/p-2');
  });

  it('falls back to home for an unrecognised type', () => {
    handleNotificationResponse(response({ type: 'nonsense' as never }));
    // No trailing slash. expo-router 6's generated route union accepts
    // `/(tabs)` or `/`, and rejects `/(tabs)/` — the trailing-slash form was a
    // typecheck failure that only surfaced once .expo/types was regenerated
    // against the SDK 54 router.
    expect(router.push).toHaveBeenCalledWith('/(tabs)');
  });
});

describe('listener registration', () => {
  it('registers both listeners and removes them on teardown', () => {
    const removeResponse = jest.fn();
    const removeReceived = jest.fn();
    mockAddResponseListener.mockReturnValueOnce({ remove: removeResponse });
    mockAddReceivedListener.mockReturnValueOnce({ remove: removeReceived });

    const teardown = setupNotificationListeners();

    expect(mockAddResponseListener).toHaveBeenCalledTimes(1);
    expect(mockAddReceivedListener).toHaveBeenCalledTimes(1);

    teardown();
    expect(removeResponse).toHaveBeenCalledTimes(1);
    expect(removeReceived).toHaveBeenCalledTimes(1);
  });
});

describe('cold start', () => {
  it('routes the notification that launched the app', async () => {
    mockGetLastResponse.mockResolvedValueOnce(
      response({ type: 'order_status', orderId: 'ord-cold' }),
    );

    await handleInitialNotificationResponse();

    // Without this path a tap that starts the app from killed state is never
    // routed: the listener is registered too late to see it.
    expect(router.push).toHaveBeenCalledWith('/order/ord-cold');
  });

  it('does nothing when the app was not launched by a notification', async () => {
    mockGetLastResponse.mockResolvedValueOnce(null);

    await handleInitialNotificationResponse();

    expect(router.push).not.toHaveBeenCalled();
  });

  it('navigates once when the listener and the replay report the same tap', async () => {
    const sameTap = response({ type: 'order_status', orderId: 'ord-dup' }, 'identical-id');
    mockGetLastResponse.mockResolvedValueOnce(sameTap);

    // The listener fires, then the cold-start replay reports the same
    // notification — the user tapped once and must land on one screen.
    handleNotificationResponse(sameTap);
    await handleInitialNotificationResponse();

    expect(router.push).toHaveBeenCalledTimes(1);
  });

  it('still routes a genuinely different notification', async () => {
    handleNotificationResponse(response({ type: 'order_status', orderId: 'ord-a' }, 'id-a'));
    mockGetLastResponse.mockResolvedValueOnce(
      response({ type: 'order_status', orderId: 'ord-b' }, 'id-b'),
    );

    await handleInitialNotificationResponse();

    expect(router.push).toHaveBeenCalledTimes(2);
    expect(router.push).toHaveBeenLastCalledWith('/order/ord-b');
  });

  it('does not throw when reading the launching notification fails', async () => {
    mockGetLastResponse.mockRejectedValueOnce(new Error('native module unavailable'));

    // Failing to deep-link must not take app startup down with it.
    await expect(handleInitialNotificationResponse()).resolves.toBeUndefined();
    expect(router.push).not.toHaveBeenCalled();
  });
});
