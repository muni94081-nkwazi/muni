import { isRunningInExpoGo } from 'expo';
import { Platform } from 'react-native';
import { logger } from '@/utils/logger';

/**
 * Loads `expo-notifications` only where it can actually be loaded.
 *
 * Importing that package is FATAL on Android in Expo Go, and not in a way any
 * call-site guard can catch. Its index re-exports
 * `DevicePushTokenAutoRegistration.fx`, and that module calls
 * `addPushTokenListener()` at module scope; the listener in turn calls
 * `warnOfExpoGoPushUsage()`, which throws outright — not warns — when
 * `Platform.OS === 'android'` and the app is running in Expo Go. Remote push was
 * removed from Expo Go in SDK 53.
 *
 * So the throw happens during `import`, before any of our code runs. Anything
 * that transitively imports it dies with it: `_layout.tsx` → `@/store` →
 * `auth.slice` → `push.ts` meant the root layout module never finished
 * evaluating, so it registered no default export, and expo-router then
 * destructured `undefined` in `fromImport` — "Cannot read property
 * 'ErrorBoundary' of undefined", with every route logging "missing the required
 * default export" on the way down. The whole app, not just push.
 *
 * A static `import` cannot be made conditional, so the require is deferred into
 * a function. In a development or production build this resolves the real
 * module on first call and push behaves exactly as before. In Expo Go on
 * Android it returns null and callers no-op — push is the one thing that
 * environment genuinely cannot do, and losing it beats losing the app.
 *
 * Types are imported separately with `import type`, which is erased at compile
 * time and so never triggers the runtime import.
 */

export type NotificationsModule = typeof import('expo-notifications');

/**
 * True only where the import itself would throw. iOS Expo Go merely warns, and
 * a dev/production build on either platform is fine, so neither is excluded.
 */
export const pushModuleUnavailable = Platform.OS === 'android' && isRunningInExpoGo();

let cached: NotificationsModule | null = null;
let noted = false;

/**
 * The `expo-notifications` module, or null where importing it would crash.
 *
 * Callers must treat null as "push is not available here" rather than as an
 * error — it is the expected result in Expo Go on Android.
 */
export function getNotifications(): NotificationsModule | null {
  if (pushModuleUnavailable) {
    // debug, not warn: `logger.warn` is unconditional in every environment, and
    // Expo Go on Android is a supported way to run this app, not a fault. A
    // yellow LogBox box on every launch trains people to ignore LogBox. This
    // stays visible to anyone actually debugging push (debug is __DEV__-only)
    // and silent otherwise. Once per session — the getter is called on each
    // login and on every listener setup.
    if (!noted) {
      noted = true;
      logger.debug(
        '[Push] expo-notifications is not loadable in Expo Go on Android (removed in SDK 53). ' +
          'Push is disabled for this session; use a development build to test notifications.',
      );
    }
    return null;
  }
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  cached ??= require('expo-notifications') as NotificationsModule;
  return cached;
}
