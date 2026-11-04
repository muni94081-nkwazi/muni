import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { apiClient } from '@/api/client';
import { Colors } from '@/constants/theme';
import { logger } from '@/utils/logger';
import { getNotifications } from './expoNotifications';

// Resolved through the guard rather than imported directly: a bare
// `import 'expo-notifications'` throws during module evaluation in Expo Go on
// Android and takes the entire app down with it. See ./expoNotifications.ts.
// Still evaluated at module scope, so in a real build the handler below is
// installed at exactly the same moment it always was.
const Notifications = getNotifications();

Notifications?.setNotificationHandler({
  // `shouldShowAlert` was split into `shouldShowBanner` (the heads-up banner)
  // and `shouldShowList` (the notification centre / tray entry) in
  // expo-notifications 0.29. Both are set so foreground behaviour matches what
  // the single old flag did.
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList:   true,
    shouldPlaySound:  true,
    shouldSetBadge:   true,
  }),
});

export async function registerForPushNotifications(): Promise<string | null> {
  // Same contract as a denied permission: null means "no token here", which
  // every caller already handles.
  if (!Notifications) return null;

  if (!Device.isDevice) {
    logger.warn('Push notifications only work on physical devices');
    return null;
  }

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== 'granted') {
    logger.warn('Push notification permission denied');
    return null;
  }

  const projectId = Constants.expoConfig?.extra?.eas?.projectId;
  const token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'MUNI Notifications',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: Colors.primary,
    });
    await Notifications.setNotificationChannelAsync('orders', {
      name: 'Order Updates',
      description: 'Order status notifications',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
    });
    await Notifications.setNotificationChannelAsync('promotions', {
      name: 'Deals & Promotions',
      description: 'Flash sales and discounts',
      importance: Notifications.AndroidImportance.DEFAULT,
    });
  }

  return token;
}

/**
 * Platforms notification-service will accept. Its `deviceSchema` is
 * z.enum(['android','ios','web']), so Platform.OS values outside that set
 * (macos, windows) must not be sent — they fail validation with a 400.
 */
type PushPlatform = 'android' | 'ios' | 'web';

function currentPlatform(): PushPlatform | null {
  if (Platform.OS === 'android' || Platform.OS === 'ios' || Platform.OS === 'web') {
    return Platform.OS;
  }
  return null;
}

/**
 * Obtain the token the BACKEND can actually push to.
 *
 * This is deliberately the native device token, not the Expo token that
 * `registerForPushNotifications` returns. notification-service dispatches
 * through `fcmProvider` (see its dispatch.service.ts), and FCM rejects an
 * `ExponentPushToken[...]` string as a dead token — which the service then
 * records as a dead device and stops selecting. The two token types are not
 * interchangeable despite both coming from expo-notifications.
 *
 * Requires a development or production build: Expo Go cannot mint a native FCM
 * token, so this returns null there rather than registering something FCM will
 * refuse.
 */
async function getDevicePushToken(): Promise<string | null> {
  if (!Notifications) return null;
  try {
    const devicePushToken = await Notifications.getDevicePushTokenAsync();
    return typeof devicePushToken.data === 'string' ? devicePushToken.data : null;
  } catch (err) {
    logger.warn('[Push] Native device token unavailable (Expo Go cannot mint one):', err);
    return null;
  }
}

/**
 * Register this device for push against the signed-in user.
 *
 * Called on every successful login, not just the first: FCM rotates tokens, and
 * a shared handset can change hands, so the service upserts on the token and
 * re-points it at whoever is signed in now.
 *
 * Never throws. Push is a nice-to-have at the end of login — a denied
 * permission, Expo Go, or a notification-service outage must not turn a
 * successful sign-in into a failure.
 */
export async function registerPushToken(): Promise<void> {
  try {
    const platform = currentPlatform();
    if (!platform) return;

    // Permission prompt and Android channel setup live here.
    const expoToken = await registerForPushNotifications();
    if (!expoToken) return; // permission denied, or not a physical device

    const token = await getDevicePushToken();
    if (!token) return;

    await apiClient.post('/api/v1/notifications/devices', { token, platform });
    logger.debug('[Push] Device registered for push notifications');
  } catch (err) {
    logger.warn('[Push] Could not register device for push:', err);
  }
}

/**
 * @deprecated Use `registerPushToken()`. Kept because the endpoint it names is
 * wrong (`/api/v1/users/push-token` does not exist — the route is
 * `POST /api/v1/notifications/devices`) and callers should move off it.
 */
export async function sendPushTokenToServer(token: string): Promise<void> {
  const platform = currentPlatform();
  if (!platform) return;
  try {
    await apiClient.post('/api/v1/notifications/devices', { token, platform });
  } catch (err) {
    logger.error('Failed to register push token:', err);
  }
}
