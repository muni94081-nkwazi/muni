import { Stack, Redirect, useGlobalSearchParams } from 'expo-router';
import { useSelector } from 'react-redux';
import type { RootState } from '@/store';
import { resolveRedirect } from '@/utils/authRedirect';

export default function AuthLayout() {
  const token = useSelector((state: RootState) => state.auth.accessToken);
  const { redirect } = useGlobalSearchParams<{ redirect?: string }>();

  // Already signed in, so there is nothing to do here. This reads the same
  // `redirect` the screens do: a session established mid-flow (login, 2FA, or
  // registration) makes this layout re-render, and it would otherwise race the
  // screen's own replace and drop the shopper on Home instead of the cart or
  // product they were sent here from.
  if (token) return <Redirect href={resolveRedirect(redirect) as never} />;

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="login" />
      <Stack.Screen name="register" />
      <Stack.Screen name="forgot-password" />
      <Stack.Screen name="two-factor" />
    </Stack>
  );
}
