/**
 * MUNI Mobile App — Seller Center mini-app
 *
 * Seller-specific screens (separate stack within the mobile app).
 * Sellers can access via Profile → Switch to Seller Mode.
 */
import { Stack } from 'expo-router';
import { useSelector } from 'react-redux';
import { Redirect } from 'expo-router';
import type { RootState } from '@/store';

export default function SellerLayout() {
  const user = useSelector((state: RootState) => state.auth.user);
  const isSeller = user?.roles.includes('ROLE_SELLER') || user?.roles.includes('ROLE_ADMIN');

  if (!isSeller) {
    return <Redirect href="/(tabs)" />;
  }

  return (
    <Stack>
      <Stack.Screen name="dashboard"      options={{ title: 'Seller Dashboard' }} />
      <Stack.Screen name="products"       options={{ title: 'My Products' }} />
      <Stack.Screen name="products/new"   options={{ title: 'Add Product' }} />
      <Stack.Screen name="orders"         options={{ title: 'Manage Orders' }} />
      <Stack.Screen name="analytics"      options={{ title: 'Analytics' }} />
      <Stack.Screen name="payouts"        options={{ title: 'Payouts' }} />
    </Stack>
  );
}
