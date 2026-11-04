import React from 'react';
import { View, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { Text, Button } from 'react-native-paper';
import { router, type Href } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSelector } from 'react-redux';
import { logoutThunk } from '@/store';
import type { RootState } from '@/store';
import { useAppDispatch } from '@/store/hooks';
import { BorderRadius, Colors, FontSize, Spacing } from '@/constants/theme';
import { FallbackImage } from '@/components/FallbackImage';
import { promptSignIn } from '@/utils/authRedirect';

interface MenuEntry {
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  title: string;
  subtitle: string;
  href: Href;
  /**
   * Needs a session. A guest tapping it is sent to login first and lands on
   * this destination afterwards, rather than being blocked from opening the
   * account screen at all.
   */
  requiresAuth?: boolean;
}

export default function ProfileScreen() {
  const dispatch = useAppDispatch();
  const user = useSelector((s: RootState) => s.auth.user);
  const isAuthenticated = useSelector((s: RootState) => !!s.auth.accessToken);
  const cartCount = useSelector((s: RootState) => s.cart.itemCount);
  const insets = useSafeAreaInsets();

  // Deliberately no sign-in wall in front of this screen. A guest opens the
  // account tab and sees what an account is for; the gate moves to the point of
  // use, which is the same stance the Messenger tab already takes. Bouncing a
  // browsing guest straight to a login form hides the app and loses their place.
  const open = (entry: MenuEntry) => {
    if (entry.requiresAuth && !isAuthenticated) {
      // Redirect to the entry they tapped, not back to this screen — the auth
      // screens replace to `redirect` on success, so they finish where they
      // were heading.
      promptSignIn(typeof entry.href === 'string' ? entry.href : '/(tabs)/profile');
      return;
    }
    router.push(entry.href);
  };

  const handleLogout = () => {
    // Clears SecureStore as well as Redux — signing out used to leave the
    // tokens on the device for the request interceptor to keep attaching.
    dispatch(logoutThunk());
  };

  const fullName = [user?.firstName, user?.lastName].filter(Boolean).join(' ');
  const initials =
    [user?.firstName?.[0], user?.lastName?.[0]].filter(Boolean).join('').toUpperCase() || '?';

  // Only destinations that exist and are backed by a real API. Address book,
  // saved payment methods, notification settings and language are not built on
  // mobile, so they are absent rather than present as taps that do nothing.
  // `requiresAuth` mirrors what each destination actually does: orders, wishlist
  // and cart already render their own SignInPrompt for guests, and returns is
  // per-user. Gating here just means the guest meets the login form once,
  // instead of navigating into a screen that immediately turns them away.
  const shopping: MenuEntry[] = [
    {
      icon: 'clipboard-list-outline',
      title: 'My orders',
      subtitle: 'Track deliveries and view past purchases',
      href: '/(tabs)/orders',
      requiresAuth: true,
    },
    {
      icon: 'heart-outline',
      title: 'Wishlist',
      subtitle: 'Products you saved for later',
      href: '/(tabs)/wishlist',
      requiresAuth: true,
    },
    {
      icon: 'cart-outline',
      title: 'Cart',
      subtitle: cartCount > 0 ? `${cartCount} item${cartCount === 1 ? '' : 's'} ready` : 'Nothing in your cart yet',
      href: '/(tabs)/cart',
      requiresAuth: true,
    },
    {
      icon: 'package-variant-closed',
      title: 'Returns & disputes',
      subtitle: 'Request a return or check an open case',
      href: '/returns',
      requiresAuth: true,
    },
  ];

  // Everything that is not a direct shopping action. Settings carries the legal
  // documents, so there is no separate Legal section — but note both /terms and
  // /privacy stay public, reachable from Settings signed out and from the
  // Create account consent line.
  //
  // `requiresAuth` marks the entries that are about *this user's* records.
  // Browsing history is not one of them: it shows recommendations, which the
  // API serves to guests as trending.
  const moreFeatures: MenuEntry[] = [
    {
      icon: 'account-outline',
      title: 'Profile',
      subtitle: 'The details held on your account',
      href: '/account/profile',
      requiresAuth: true,
    },
    {
      icon: 'cog-outline',
      title: 'Settings',
      subtitle: 'Preferences, password, privacy and sign out',
      href: '/account/settings',
    },
    {
      icon: 'map-marker-outline',
      title: 'Shipping addresses',
      subtitle: 'Where your orders are delivered',
      href: '/account/addresses',
      requiresAuth: true,
    },
    {
      icon: 'receipt-text-outline',
      title: 'Tax information',
      subtitle: 'Invoices and VAT details',
      href: '/account/tax',
      requiresAuth: true,
    },
    {
      icon: 'history',
      title: 'Browsing history',
      subtitle: 'Products you viewed, and picks for you',
      href: '/account/browsing-history',
    },
    {
      icon: 'comment-question-outline',
      title: 'Inquiries',
      subtitle: 'Questions you asked about products',
      href: '/account/inquiries',
      requiresAuth: true,
    },
    {
      icon: 'storefront-outline',
      title: 'Start selling',
      subtitle: 'Open a shop on MUNI',
      href: '/account/start-selling',
    },
    {
      icon: 'lifebuoy',
      title: 'Help Centre',
      subtitle: 'Get help with an order or your account',
      href: '/account/help',
    },
  ];

  const sections: { title: string; entries: MenuEntry[] }[] = [
    { title: 'Shopping', entries: shopping },
    { title: 'More features', entries: moreFeatures },
  ];

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[styles.content, { paddingTop: insets.top + Spacing.md }]}
    >
      <View style={styles.header}>
        {isAuthenticated && user?.profilePictureUrl ? (
          <FallbackImage uri={user.profilePictureUrl} style={styles.avatar} contentFit="cover" />
        ) : (
          <View style={[styles.avatar, styles.avatarFallback]}>
            {isAuthenticated ? (
              <Text style={styles.avatarInitials}>{initials}</Text>
            ) : (
              // No initials to show for a guest, and a "?" reads as an error
              // rather than as "not signed in yet".
              <MaterialCommunityIcons
                name="account-circle-outline"
                size={32}
                color={Colors.primaryDark}
              />
            )}
          </View>
        )}
        <View style={styles.userInfo}>
          <Text style={styles.name} numberOfLines={1}>
            {isAuthenticated ? fullName || 'Your account' : 'Welcome to MUNI'}
          </Text>
          {isAuthenticated && user?.email ? (
            <Text style={styles.email} numberOfLines={1}>
              {user.email}
            </Text>
          ) : null}
          {!isAuthenticated ? (
            <Text style={styles.email} numberOfLines={2}>
              Sign in to track orders, save items and start a return.
            </Text>
          ) : null}
          {isAuthenticated && user && !user.emailVerified ? (
            <View style={styles.unverified}>
              <MaterialCommunityIcons name="alert-circle-outline" size={12} color={Colors.warning} />
              <Text style={styles.unverifiedText}>Email not verified</Text>
            </View>
          ) : null}
        </View>
      </View>

      {sections.map((section) => (
        <View key={section.title} style={styles.section}>
          <Text style={styles.sectionTitle}>{section.title}</Text>
          {section.entries.map((entry) => (
            <TouchableOpacity
              key={entry.title}
              style={styles.menuItem}
              onPress={() => open(entry)}
              accessibilityRole="button"
              accessibilityLabel={
                entry.requiresAuth && !isAuthenticated
                  ? `${entry.title}, sign in required`
                  : entry.title
              }
            >
              <View style={styles.menuIcon}>
                <MaterialCommunityIcons name={entry.icon} size={22} color={Colors.text.primary} />
              </View>
              <View style={styles.menuTextBlock}>
                <Text style={styles.menuTitle}>{entry.title}</Text>
                <Text style={styles.menuSubtitle} numberOfLines={1}>
                  {entry.subtitle}
                </Text>
              </View>
              <MaterialCommunityIcons name="chevron-right" size={22} color={Colors.gray[400]} />
            </TouchableOpacity>
          ))}
        </View>
      ))}

      {isAuthenticated ? (
        <Button
          mode="outlined"
          onPress={handleLogout}
          style={styles.logoutButton}
          contentStyle={styles.logoutContent}
          textColor={Colors.error}
          icon="logout"
        >
          Sign out
        </Button>
      ) : (
        <View style={styles.guestActions}>
          <Button
            mode="contained"
            onPress={() => promptSignIn('/(tabs)/profile')}
            style={styles.logoutButton}
            contentStyle={styles.logoutContent}
            icon="login"
          >
            Sign in
          </Button>
          <Button
            mode="outlined"
            onPress={() =>
              router.push({ pathname: '/(auth)/register', params: { redirect: '/(tabs)/profile' } })
            }
            style={styles.createButton}
            contentStyle={styles.logoutContent}
          >
            Create account
          </Button>

          {/* Legal notice, below the actions so it informs without competing
              with the primary task — the same order the Create account form
              uses. The links are nested <Text> inside a wrapping <Text>: that is
              what makes them tappable inline on React Native, where a
              TouchableOpacity cannot sit mid-sentence without breaking the line
              wrap. Each carries its own accessibilityRole so a screen reader
              announces two distinct links rather than one paragraph. */}
          <Text style={styles.legal}>
            By continuing, you agree to our{' '}
            <Text
              style={styles.legalLink}
              onPress={() => router.push('/terms')}
              accessibilityRole="link"
              accessibilityLabel="Terms and Conditions"
            >
              Terms &amp; Conditions
            </Text>
            {' '}and{' '}
            <Text
              style={styles.legalLink}
              onPress={() => router.push('/privacy')}
              accessibilityRole="link"
              accessibilityLabel="Privacy Policy"
            >
              Privacy Policy
            </Text>
            .
          </Text>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background.secondary },
  content: { paddingBottom: Spacing.xxl },
  header: {
    flexDirection: 'row',
    padding: Spacing.lg,
    backgroundColor: Colors.background.card,
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  avatar: {
    width: 72,
    height: 72,
    borderRadius: BorderRadius.full,
    marginRight: Spacing.md,
    backgroundColor: Colors.background.alt,
  },
  avatarFallback: { alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.accent },
  avatarInitials: { fontSize: FontSize.xxl, fontWeight: '800', color: Colors.text.onAccent },
  userInfo: { flex: 1 },
  name: { fontSize: FontSize.xl, fontWeight: '800', color: Colors.text.primary },
  email: { color: Colors.text.muted, fontSize: FontSize.sm, marginTop: 2 },
  unverified: { flexDirection: 'row', alignItems: 'center', marginTop: Spacing.xs },
  unverifiedText: { color: Colors.warning, fontSize: FontSize.xs, marginLeft: 4, fontWeight: '600' },
  section: {
    backgroundColor: Colors.background.card,
    marginBottom: Spacing.md,
    paddingBottom: Spacing.xs,
  },
  sectionTitle: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.sm,
    fontWeight: '700',
    fontSize: FontSize.xs,
    color: Colors.text.muted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    minHeight: 60,
    borderTopWidth: 1,
    borderTopColor: Colors.gray[100],
  },
  menuIcon: {
    width: 40,
    height: 40,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.background.alt,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: Spacing.md,
  },
  menuTextBlock: { flex: 1 },
  menuTitle: { fontSize: FontSize.md, fontWeight: '600', color: Colors.text.primary },
  menuSubtitle: { fontSize: FontSize.xs, color: Colors.text.muted, marginTop: 2 },
  logoutButton: {
    marginHorizontal: Spacing.lg,
    marginTop: Spacing.sm,
    borderColor: Colors.error,
    borderRadius: BorderRadius.full,
  },
  logoutContent: { minHeight: 48 },
  guestActions: { alignItems: 'stretch' },
  createButton: {
    marginHorizontal: Spacing.md,
    marginTop: Spacing.sm,
    borderColor: Colors.border,
  },
  legal: {
    marginTop: Spacing.lg,
    marginHorizontal: Spacing.xl,
    fontSize: FontSize.xs,
    color: Colors.text.muted,
    textAlign: 'center',
    lineHeight: 18,
  },
  legalLink: { color: Colors.link, fontWeight: '600' },
});
