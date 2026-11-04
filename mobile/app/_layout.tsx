import { useEffect } from 'react';
import { Stack, useRootNavigationState } from 'expo-router';
import { Provider } from 'react-redux';
import { PaperProvider, MD3LightTheme } from 'react-native-paper';
import * as SplashScreen from 'expo-splash-screen';
import * as Font from 'expo-font';
// Imported per weight, not from the package root: the root index re-exports all
// 18 Inter weights, and Metro has no tree-shaking for asset requires, so a
// barrel import ships every one of them (~10 MB of unused .ttf) in the bundle.
import { Inter_400Regular } from '@expo-google-fonts/inter/400Regular';
import { Inter_500Medium } from '@expo-google-fonts/inter/500Medium';
import { Inter_600SemiBold } from '@expo-google-fonts/inter/600SemiBold';
import { Inter_700Bold } from '@expo-google-fonts/inter/700Bold';
import { Text, View } from 'react-native';
import { store, subscribeUiPersistence, hydrateUiPreferences } from '@/store';
import { useAppSelector } from '@/store/hooks';
import { selectHasBootstrapped } from '@/store/auth.slice';
import { useAuthInit } from '@/hooks';
import { setNavigationReady } from '@/api/client';
import { Colors } from '@/constants/theme';
import { captureError, initSentry } from '@/observability/sentry';
import { logger } from '@/utils/logger';
import {
  setupNotificationListeners,
  handleInitialNotificationResponse,
} from '@/notifications/handlers';
import '../src/i18n';

SplashScreen.preventAutoHideAsync();

initSentry();

export const unstable_settings = { anchor: '(tabs)' };

export function ErrorBoundary({ error }: { error: Error }) {
  logger.error('[RootLayout] Caught render error:', error);
  
  captureError(error, { source: 'RootLayout.ErrorBoundary' });
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <Text>Something went wrong. Please restart the app.</Text>
    </View>
  );
}

const muniTheme = {
  ...MD3LightTheme,
  colors: {
    ...MD3LightTheme.colors,
    primary: Colors.primary,
    secondary: Colors.secondary,
  },
};

export default function RootLayout() {
  const [fontsLoaded, fontError] = Font.useFonts({
    'Inter-Regular': Inter_400Regular,
    'Inter-Medium': Inter_500Medium,
    'Inter-SemiBold': Inter_600SemiBold,
    'Inter-Bold': Inter_700Bold,
  });

  useEffect(() => {
    const unsubscribe = subscribeUiPersistence();
    void hydrateUiPreferences();
    return unsubscribe;
  }, []);

  const navigationReady = Boolean(useRootNavigationState()?.key);
  useEffect(() => {
    setNavigationReady(navigationReady);
    return () => setNavigationReady(false);
  }, [navigationReady]);

  useEffect(() => {
    if (!navigationReady) return undefined;
    return setupNotificationListeners();
  }, [navigationReady]);
  useEffect(() => {
    if (!navigationReady) return;
    void handleInitialNotificationResponse();
  }, [navigationReady]);

  if (!fontsLoaded && !fontError) return null;

  return (
    <Provider store={store}>
      <PaperProvider theme={muniTheme}>
        <AppRoot />
      </PaperProvider>
    </Provider>
  );
}

function AppRoot() {
  useAuthInit();

  const hasBootstrapped = useAppSelector(selectHasBootstrapped);

  useEffect(() => {
    if (hasBootstrapped) {
      SplashScreen.hideAsync();
    }
  }, [hasBootstrapped]);

  if (!hasBootstrapped) return null;

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="(auth)" />
      <Stack.Screen
        name="product/[id]"
        options={{
          headerShown: true,
          headerTitle: '',
          headerTransparent: true,
          headerBackTitle: '',
        }}
      />
      <Stack.Screen name="checkout" options={{ headerShown: true, headerTitle: 'Checkout' }} />
      {/* Discovery and account screens sit outside the tabs, so they need a
          header of their own to get a back button — the stack's default here is
          headerless, which left them with no way back but the hardware button.
          `categories/index` used to be declared here; that route moved into the
          tab group, so the entry named a file that no longer exists. */}
      <Stack.Screen name="category/[slug]" options={{ headerShown: true }} />
      <Stack.Screen name="notifications" options={{ headerShown: true, headerTitle: 'Notifications' }} />
      <Stack.Screen name="chat/index" options={{ headerShown: true, headerTitle: 'Messages' }} />
      <Stack.Screen name="chat/[id]" options={{ headerShown: true }} />
      <Stack.Screen name="order/[id]" options={{ headerShown: true, headerTitle: 'Order' }} />
      <Stack.Screen name="returns" options={{ headerShown: true, headerTitle: 'Returns' }} />
      {/* Legal pages. headerShown for the same reason as the screens above —
          they are reached from the account screen and from the Create account
          consent line, including by a signed-out visitor, so the stack header's
          back button is the only way back. */}
      <Stack.Screen name="terms" options={{ headerShown: true, headerTitle: 'Terms & Conditions' }} />
      <Stack.Screen name="privacy" options={{ headerShown: true, headerTitle: 'Privacy Policy' }} />
      {/* Account area — the "More features" section of the account screen. Each
          needs headerShown for the same reason as the screens above: the stack
          default here is headerless, which would leave them with no back button. */}
      <Stack.Screen name="account/profile" options={{ headerShown: true, headerTitle: 'Profile' }} />
      <Stack.Screen name="account/settings" options={{ headerShown: true, headerTitle: 'Settings' }} />
      <Stack.Screen name="account/addresses" options={{ headerShown: true, headerTitle: 'Shipping addresses' }} />
      <Stack.Screen name="account/tax" options={{ headerShown: true, headerTitle: 'Tax information' }} />
      <Stack.Screen name="account/browsing-history" options={{ headerShown: true, headerTitle: 'Browsing history' }} />
      <Stack.Screen name="account/inquiries" options={{ headerShown: true, headerTitle: 'Inquiries' }} />
      <Stack.Screen name="account/start-selling" options={{ headerShown: true, headerTitle: 'Start selling' }} />
      <Stack.Screen name="account/help" options={{ headerShown: true, headerTitle: 'Help Centre' }} />
      <Stack.Screen name="account/currency" options={{ headerShown: true, headerTitle: 'Currency' }} />
      <Stack.Screen name="account/legal" options={{ headerShown: true, headerTitle: 'Legal policies' }} />
      <Stack.Screen name="account/delete-account" options={{ headerShown: true, headerTitle: 'Delete account' }} />
    </Stack>
  );
}
