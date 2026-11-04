// `import type` only — erased at compile time, so it never triggers the runtime
// import that throws in Expo Go on Android. The module itself is resolved
// through the guard below. See ./expoNotifications.ts.
import type { NotificationResponse } from 'expo-notifications';
import { router } from 'expo-router';
import { logger } from '@/utils/logger';
import { getNotifications } from './expoNotifications';

export type NotificationData = {
  type: 'order_status' | 'price_alert' | 'flash_sale' | 'promotion';
  orderId?:   string;
  productId?: string;
  url?:       string;
};

/**
 * Identifier of the most recently routed response, so one tap navigates once.
 *
 * Two sources can report the same tap: the response listener, and
 * `getLastNotificationResponseAsync()`, which replays the notification that
 * launched the app. Whether both fire for a given cold start varies by
 * platform, so rather than guess, both paths run and whichever arrives second
 * is dropped — they arrive back to back during startup.
 *
 * Deliberately one identifier rather than a growing Set of every tap ever
 * handled: a Set would leak for the life of the process, and would also block
 * a genuine re-tap of a notification the user had already opened once.
 */
let lastHandledId: string | null = null;

function alreadyHandled(response: NotificationResponse): boolean {
  const id = response.notification.request.identifier;
  if (!id) return false;
  if (id === lastHandledId) return true;
  lastHandledId = id;
  return false;
}

export function handleNotificationResponse(response: NotificationResponse): void {
  if (alreadyHandled(response)) return;

  const data = response.notification.request.content.data as NotificationData;
  switch (data.type) {
    case 'order_status':
      // `/order/${id}` — singular. The detail screen is mobile/app/order/[id].tsx;
      // `/orders` (plural) is the tab list, so the old plural form pushed a
      // route that does not exist and the tap did nothing. Caught once the
      // tsconfig started including .expo/types, which is what makes
      // expo-router's typed routes actually checked.
      if (data.orderId) router.push(`/order/${data.orderId}`);
      else              router.push('/(tabs)/orders');
      break;
    case 'price_alert':
    case 'flash_sale':
      if (data.productId) router.push(`/product/${data.productId}`);
      else                router.push('/(tabs)');
      break;
    case 'promotion':
      if (data.url) router.push(data.url as any);
      else          router.push('/(tabs)');
      break;
    default:
      router.push('/(tabs)');
  }
}

export function setupNotificationListeners(): () => void {
  const Notifications = getNotifications();
  // Expo Go on Android cannot deliver remote notifications at all, so there is
  // nothing to listen for. Returning the same no-op cleanup shape keeps the
  // caller's `return setupNotificationListeners()` effect teardown valid.
  if (!Notifications) return () => {};

  const foregroundSub = Notifications.addNotificationReceivedListener((notification) => {
    logger.debug('[Push] Received in foreground:', notification.request.content.title);
  });

  const responseSub = Notifications.addNotificationResponseReceivedListener(handleNotificationResponse);

  return () => {
    foregroundSub.remove();
    responseSub.remove();
  };
}

/**
 * Route the notification that launched the app, if it was launched by one.
 *
 * `addNotificationResponseReceivedListener` above covers taps while the app is
 * running, but a tap that cold-starts the app can be delivered before any
 * listener exists — so on its own the listener misses the most common case:
 * the app is not running, a push arrives, the user taps it.
 *
 * Safe to call more than once; `handleNotificationResponse` de-duplicates by
 * notification identifier, so this cannot double-navigate with the listener.
 *
 * Never throws: failing to deep-link is not a reason to fail app startup — the
 * user just lands on the default screen.
 */
export async function handleInitialNotificationResponse(): Promise<void> {
  const Notifications = getNotifications();
  if (!Notifications) return;

  try {
    const response = await Notifications.getLastNotificationResponseAsync();
    if (response) handleNotificationResponse(response);
  } catch (err) {
    logger.warn('[Push] Could not read the launching notification:', err);
  }
}
