import React from 'react';
import { Tabs } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors } from '@/constants/theme';

/**
 * The storefront tabs, open to everyone.
 *
 * This layout used to redirect the whole tree to login whenever there was no
 * access token, which meant a visitor could not see a single product before
 * making an account. Home, Search and the product screens are public — the
 * gateway serves /products, /search and /categories unauthenticated — so the
 * guard now lives on the screens that genuinely need an identity (cart,
 * wishlist, orders, profile, checkout), each of which shows a contextual
 * sign-in that returns the shopper to where they were.
 *
 * Session *expiry* is unaffected: the axios interceptor's endSession() clears
 * the tokens and replaces to login itself (src/api/client.ts).
 *
 * The bar shows four destinations — Home, Categories, Messenger, Account. Six
 * was one too many for a phone: the labels truncated to "Wishli..." and
 * "Accou...", and search, cart and wishlist already sit in the home header, so
 * they were spending a slot each to duplicate a control one thumb-reach away.
 */
export default function TabsLayout() {
  const insets = useSafeAreaInsets();

  // Giving the bar an explicit height opts out of the automatic safe-area
  // padding, so the inset has to be added back — otherwise the labels sit under
  // the home indicator on an iPhone and under the gesture bar on Android 10+.
  const bottomInset = insets.bottom;

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: Colors.primary,
        tabBarInactiveTintColor: Colors.gray[500],
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
        tabBarItemStyle: { paddingVertical: 4 },
        tabBarStyle: {
          backgroundColor: Colors.white,
          borderTopWidth: 1,
          borderTopColor: Colors.gray[200],
          height: 60 + bottomInset,
          paddingBottom: bottomInset > 0 ? bottomInset : 6,
          paddingTop: 4,
          elevation: 8,
          shadowColor: Colors.black,
          shadowOffset: { width: 0, height: -2 },
          shadowOpacity: 0.08,
          shadowRadius: 6,
        },
        headerShown: false,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarIcon: ({ color, focused }) => (
            <MaterialCommunityIcons name={focused ? 'home' : 'home-outline'} size={24} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="categories"
        options={{
          title: 'Categories',
          tabBarIcon: ({ color, focused }) => (
            <MaterialCommunityIcons
              name={focused ? 'view-grid' : 'view-grid-outline'}
              size={24}
              color={color}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="messenger"
        options={{
          title: 'Messenger',
          tabBarIcon: ({ color, focused }) => (
            <MaterialCommunityIcons
              name={focused ? 'message-text' : 'message-text-outline'}
              size={24}
              color={color}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Account',
          tabBarIcon: ({ color, focused }) => (
            <MaterialCommunityIcons
              name={focused ? 'account-circle' : 'account-circle-outline'}
              size={24}
              color={color}
            />
          ),
        }}
      />

      {/*
        Still routable, just not in the bar. expo-router turns every file in
        this group into a tab, so these need `href: null` rather than deletion —
        the screens are reached from the home header (search, cart, wishlist)
        and from Account → My orders, and removing the files would break those
        links along with /checkout's return path.
      */}
      <Tabs.Screen name="search" options={{ href: null }} />
      <Tabs.Screen name="cart" options={{ href: null }} />
      <Tabs.Screen name="wishlist" options={{ href: null }} />
      <Tabs.Screen name="orders" options={{ href: null }} />
    </Tabs>
  );
}
